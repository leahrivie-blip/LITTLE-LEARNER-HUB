/**
 * Teaching Kit Slice 1B — pure mapper from legacy lesson plan → TeachingKitViewModel.
 * Does not rewrite storage. Consumed via scripts/teaching-kit.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitMapper = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const DAY_LABELS = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  const BINDER_TABS = Object.freeze([
    Object.freeze({ id: "setup", label: "Setup" }),
    Object.freeze({ id: "daily", label: "Daily" }),
    Object.freeze({ id: "activities", label: "Activities" }),
    Object.freeze({ id: "songs_books", label: "Songs & Books" }),
    Object.freeze({ id: "families", label: "Families" }),
    Object.freeze({ id: "observe", label: "Observe" }),
  ]);

  const BUILD_PRESETS = Object.freeze([
    Object.freeze({ id: "today_pack", label: "Today’s classroom pack", default: true }),
    Object.freeze({ id: "monday_setup_pack", label: "Monday Morning Setup pack", default: false }),
    Object.freeze({ id: "week_binder", label: "Week binder", default: false }),
    Object.freeze({ id: "family_pack", label: "Family pack", default: false }),
  ]);

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function lines(value) {
    return text(value)
      .split(/\r?\n|;|,/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function bulletLines(value) {
    return text(value)
      .split(/\r?\n/)
      .map((part) => part.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean);
  }

  function uniqueStrings(items, max) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const item = text(items[i]);
      if (!item) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  }

  function normalizeMaterialToken(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function materialsList(value) {
    return uniqueStrings(lines(value), 40);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function bookEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const title = text(entry.title);
    if (!title) return null;
    const notes = text(entry.notes);
    const questionLines = bulletLines(notes);
    return {
      title,
      author: text(entry.author),
      notes,
      readAloudQuestions: questionLines,
      whyThisBook: questionLines.length ? "" : notes,
    };
  }

  function songEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const title = text(entry.title);
    if (!title) return null;
    const notes = text(entry.notes);
    let lyrics = "";
    let motions = "";
    const lyricsMatch = notes.match(/lyrics?:\s*([\s\S]*?)(?:motions?:|$)/i);
    const motionsMatch = notes.match(/motions?:\s*([\s\S]*)$/i);
    if (lyricsMatch) lyrics = text(lyricsMatch[1]);
    if (motionsMatch) motions = text(motionsMatch[1]);
    if (!lyrics && !motions && notes) {
      // Legacy: keep notes as teaching cue, never invent copyrighted lyrics.
      motions = notes;
    }
    return {
      title,
      notes,
      lyrics,
      motions,
      whenToUse: "",
    };
  }

  function vocabularyEntries(value) {
    const raw = text(value);
    if (!raw) return [];
    const parts = raw.includes("\n") ? raw.split(/\r?\n/) : raw.split(/,/);
    const out = [];
    for (let i = 0; i < parts.length && out.length < 40; i += 1) {
      const part = text(parts[i]);
      if (!part) continue;
      const dash = part.match(/^(.+?)\s+[—–-]\s+(.+)$/);
      if (dash) {
        const definitionAndAsk = text(dash[2]);
        const askSplit = definitionAndAsk.split(/\bAsk:\s*/i);
        out.push({
          word: text(dash[1]),
          definition: text(askSplit[0]).replace(/\.$/, ""),
          discussionIdea: askSplit[1] ? text(askSplit[1]) : "",
        });
        continue;
      }
      out.push({
        word: part,
        definition: "",
        discussionIdea: `Can you show me or tell me about “${part}”?`,
      });
    }
    return out;
  }

  function teacherPromptsFrom(source) {
    const language = text(source.teacherLanguage);
    if (language) {
      const labeled = [];
      const blocks = language.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (let i = 0; i < blocks.length; i += 1) {
        const match = blocks[i].match(/^(Look|Wonder|Care|Listen|Try)\s*[:.-]\s*(.+)$/i);
        if (match) {
          labeled.push({ label: match[1], text: text(match[2]) });
        } else {
          labeled.push({ label: "Prompt", text: blocks[i] });
        }
      }
      if (labeled.length) return labeled;
    }
    const role = text(source.teacherRole);
    if (role) return [{ label: "Prompt", text: role }];
    return [];
  }

  function cleanupTipsFrom(source) {
    const tips = [];
    const safety = bulletLines(source.safetyNotes);
    for (let i = 0; i < safety.length; i += 1) tips.push(safety[i]);
    if (!tips.length && materialsList(source.materials).length) {
      tips.push("Return materials to labeled bins.");
      tips.push("Wipe the table or tray before the next activity.");
      tips.push("Quick hand wash if materials were shared.");
    }
    return uniqueStrings(tips, 8);
  }

  function observationIdeasFrom(source) {
    const fromField = bulletLines(source.observationOpportunities || source.observations);
    if (fromField.length) return fromField.slice(0, 8);
    const objective = text(source.objective || source.objectives);
    if (objective) return [`Does the child show progress toward: ${objective.split(/\.|\n/)[0]}?`];
    return [];
  }

  function estimateMinutesForActivity(source) {
    const setupLen = text(source.setup).length;
    const stepsLen = text(source.steps).length;
    const setup = setupLen > 180 ? 8 : setupLen > 40 ? 5 : 3;
    const run = stepsLen > 400 ? 20 : stepsLen > 120 ? 15 : 10;
    const cleanup = 3;
    return { setup, run, cleanup, total: setup + run + cleanup };
  }

  function resolvePlanActivities(plan, activities) {
    const planId = text(plan && plan.id);
    const fromList = asArray(activities).filter((activity) => text(activity && activity.lessonPlanId) === planId);
    const bySource = new Map();
    fromList.forEach((activity) => {
      const key = text(activity.sourceKey) || `${planId}:${text(activity.itemId)}` || text(activity.id);
      if (key) bySource.set(key, activity);
    });

    const merged = [];
    const seen = new Set();
    WEEKDAYS.forEach((day) => {
      const dayPlan = plan && plan.dailyPlans && plan.dailyPlans[day] ? plan.dailyPlans[day] : {};
      asArray(dayPlan.items).forEach((item) => {
        if (!item || !text(item.title)) return;
        const sourceKey = text(item.sourceKey) || `${planId}:${text(item.itemId)}`;
        const activity = bySource.get(sourceKey);
        const id = text(activity && activity.id) || sourceKey || `${day}-${text(item.itemId) || text(item.title)}`;
        if (seen.has(id)) return;
        seen.add(id);
        merged.push({
          dayOfWeek: day,
          item,
          activity: activity || null,
          id,
          sourceKey,
        });
      });
    });

    // Orphan activities linked to plan but missing from daily items
    fromList.forEach((activity) => {
      const id = text(activity.id);
      if (!id || seen.has(id)) return;
      seen.add(id);
      merged.push({
        dayOfWeek: text(activity.dayOfWeek) || "",
        item: null,
        activity,
        id,
        sourceKey: text(activity.sourceKey) || id,
      });
    });

    return merged;
  }

  function materialOverlapScore(left, right) {
    const a = new Set(left.map(normalizeMaterialToken).filter(Boolean));
    const b = right.map(normalizeMaterialToken).filter(Boolean);
    if (!a.size || !b.length) return 0;
    let hits = 0;
    b.forEach((token) => {
      if (!token) return;
      for (const item of a) {
        if (item === token || item.includes(token) || token.includes(item)) {
          hits += 1;
          break;
        }
      }
    });
    return hits;
  }

  function buildSubstituteCandidates(current, allCards, readyMaterials, max) {
    const ready = asArray(readyMaterials).map(normalizeMaterialToken).filter(Boolean);
    const currentMaterials = materialsList(current.materials);
    const scored = [];
    for (let i = 0; i < allCards.length; i += 1) {
      const candidate = allCards[i];
      if (!candidate || candidate.id === current.id) continue;
      const candidateMaterials = materialsList(candidate.materials);
      const readyHits = materialOverlapScore(ready, candidateMaterials);
      const sameGoal =
        text(candidate.learningObjective).toLowerCase().slice(0, 40) ===
        text(current.learningObjective).toLowerCase().slice(0, 40);
      const sharedWithCurrent = materialOverlapScore(currentMaterials, candidateMaterials);
      // Prefer ready-material fits; always keep at least kit-local fallbacks.
      let score = readyHits * 5 + (sameGoal ? 2 : 0) + (candidate.sectionId === current.sectionId ? 1 : 0);
      if (sharedWithCurrent > 2) score -= 1;
      if (!ready.length && candidate.dayOfWeek === current.dayOfWeek) score -= 2;
      if (score < 0) score = 0;
      // Materials-aware boost path: if provider marked ready items and this
      // candidate uses none of them, keep it only as a low-priority fallback.
      if (ready.length && readyHits === 0) score = Math.max(score, 0.5);
      scored.push({
        activityId: candidate.id,
        title: candidate.title,
        dayOfWeek: candidate.dayOfWeek,
        sectionId: candidate.sectionId,
        reason: readyHits
          ? `Uses materials you already have (${candidateMaterials.slice(0, 3).join(", ") || "classroom basics"})`
          : sameGoal
            ? "Similar learning goal from this week’s kit"
            : "Another activity from this Teaching Kit",
        sharedReadyMaterialCount: readyHits,
        score,
      });
    }
    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return scored.slice(0, max).map(({ score, ...rest }) => rest);
  }

  function mapActivityCard(entry, mapCategory) {
    const source = entry.activity || entry.item || {};
    const title = text(source.title) || "Activity";
    const category = text(source.activityCategory) || "Open-Ended Exploration";
    const materials = text(source.materials);
    const setup = text(source.setup);
    const steps = text(source.steps);
    const learningObjective =
      text(source.objective) ||
      asArray(source.learningGoals).map(text).filter(Boolean)[0] ||
      "";
    const minutes = estimateMinutesForActivity(source);
    return {
      id: entry.id,
      sourceKey: entry.sourceKey,
      dayOfWeek: entry.dayOfWeek || text(source.dayOfWeek),
      title,
      activityCategory: category,
      sectionId: mapCategory(category),
      description: text(source.description),
      examplePhotoUrl: text(source.exampleImageUrl || source.examplePhotoUrl),
      setupPhotoUrl: text(source.setupImageUrl || source.setupPhotoUrl),
      materials: materialsList(materials),
      materialsText: materials,
      learningObjective,
      teacherPrompts: teacherPromptsFrom(source),
      setup,
      steps,
      cleanupTips: cleanupTipsFrom(source),
      observationIdeas: observationIdeasFrom(source),
      adaptations: text(source.adaptations),
      extensions: text(source.extensions),
      safetyNotes: text(source.safetyNotes),
      vocabulary: vocabularyEntries(source.vocabulary),
      estimatedMinutes: minutes,
      hasExamplePhoto: Boolean(text(source.exampleImageUrl || source.examplePhotoUrl)),
      hasSetupPhoto: Boolean(text(source.setupImageUrl || source.setupPhotoUrl)),
      substituteCandidates: [],
    };
  }

  function collectWeekMaterials(plan, activityCards) {
    const all = [];
    all.push(...materialsList(plan.weeklyMaterials));
    WEEKDAYS.forEach((day) => {
      const dayPlan = plan.dailyPlans && plan.dailyPlans[day] ? plan.dailyPlans[day] : {};
      all.push(...materialsList(dayPlan.materials));
    });
    activityCards.forEach((card) => {
      all.push(...card.materials);
    });
    return uniqueStrings(all, 60);
  }

  function buildMondayMorningSetup(plan, activityCards, printables, options) {
    const materials = collectWeekMaterials(plan, activityCards).map((label, index) => ({
      id: `mat-${index + 1}`,
      label,
      critical: index < 8,
      source: "week",
    }));
    const prepTasks = [];
    if (materials.length) {
      prepTasks.push({
        id: "prep-gather",
        label: "Gather materials for the week",
        minutes: Math.min(12, Math.max(4, Math.ceil(materials.length / 3))),
        detail: "Pull listed supplies onto a prep tray or counter.",
      });
    }
    if (activityCards.length) {
      prepTasks.push({
        id: "prep-stations",
        label: "Set stations for today’s first activities",
        minutes: Math.min(10, Math.max(4, activityCards.filter((card) => card.dayOfWeek === "monday").length * 3 || 5)),
        detail: "Lay out Monday activity trays using setup notes.",
      });
    }
    if (printables.length || text(plan.familyConnection)) {
      prepTasks.push({
        id: "prep-print",
        label: "Print checklist items",
        minutes: printables.length ? 3 + printables.length : 2,
        detail: "Run Today page, activity cards, and parent message if needed.",
      });
    }
    if (text(plan.observationOpportunities)) {
      prepTasks.push({
        id: "prep-observe",
        label: "Place observation sticky notes",
        minutes: 2,
        detail: "Park prompts near the first activity area.",
      });
    }

    const printChecklist = [
      { id: "print-today", label: "Today’s Classroom page", usedInWeek: ["Mon–Fri · all-day board"] },
      {
        id: "print-activities",
        label: `Activity cards (${activityCards.length})`,
        usedInWeek: activityCards.length ? ["During scheduled activity blocks"] : [],
      },
      {
        id: "print-parent",
        label: "Parent connection message",
        usedInWeek: text(plan.familyConnection) ? ["Pickup / family send"] : [],
      },
      {
        id: "print-observe",
        label: "Observation prompts",
        usedInWeek: text(plan.observationOpportunities) ? ["During today’s activities"] : [],
      },
    ];
    printables.forEach((printable) => {
      printChecklist.push({
        id: `print-res-${printable.id}`,
        label: printable.title,
        usedInWeek: printable.usedInWeek.map((slot) => `${slot.dayLabel} · ${slot.moment}`),
      });
    });

    const readyMaterials = asArray(options && options.readyMaterials).map(text).filter(Boolean);
    const readySet = new Set(readyMaterials.map(normalizeMaterialToken));
    const missingMaterials = materials
      .filter((item) => item.critical)
      .filter((item) => {
        if (!readySet.size) return true;
        const token = normalizeMaterialToken(item.label);
        for (const ready of readySet) {
          if (ready === token || ready.includes(token) || token.includes(ready)) return false;
        }
        return true;
      })
      .map((item) => item.label);

    const gather = prepTasks.find((task) => task.id === "prep-gather")?.minutes || 0;
    const stations = prepTasks.find((task) => task.id === "prep-stations")?.minutes || 0;
    const print = prepTasks.find((task) => task.id === "prep-print")?.minutes || 0;
    const estimatedPrepMinutes = prepTasks.reduce((sum, task) => sum + (task.minutes || 0), 0);

    return {
      estimatedPrepMinutes,
      prepBreakdown: { gather, stations, print },
      materials,
      prepTasks,
      printChecklist: printChecklist.filter((item) => item.usedInWeek.length || item.id.startsWith("print-")),
      missingMaterials: readySet.size ? missingMaterials : missingMaterials.slice(0, 5),
      missingHighlighted: Boolean(readySet.size ? missingMaterials.length : materials.length),
      safetyNotes: uniqueStrings(
        WEEKDAYS.flatMap((day) => bulletLines(plan.dailyPlans?.[day]?.safetyNotes)),
        8,
      ),
      cta: "Open Today’s Classroom",
    };
  }

  function buildDayClassroom(plan, day, activityCards, vocabulary) {
    const dayPlan = plan.dailyPlans && plan.dailyPlans[day] ? plan.dailyPlans[day] : {};
    const dayActivities = activityCards.filter((card) => card.dayOfWeek === day);
    // Merge day + week entries; richer questions/lyrics win for matching titles.
    const books = uniqueByTitle([
      ...asArray(dayPlan.books).map(bookEntry).filter(Boolean),
      ...asArray(plan.books).map(bookEntry).filter(Boolean),
    ]).slice(0, 4);
    const songs = uniqueByTitle([
      ...asArray(dayPlan.songs).map(songEntry).filter(Boolean),
      ...asArray(plan.songs).map(songEntry).filter(Boolean),
    ]).slice(0, 3);

    const transitions = uniqueStrings([
      ...asArray(dayPlan.transitions).map(text),
      ...asArray(dayPlan.circleTime).map((item) => text(item)),
    ], 10);

    const schedule = [];
    let hour = 8;
    let minute = 30;
    function pushSlot(kind, label) {
      const time = `${hour}:${String(minute).padStart(2, "0")}`;
      schedule.push({ time, kind, label });
      minute += 30;
      if (minute >= 60) {
        hour += 1;
        minute -= 60;
      }
    }
    if (songs.length) pushSlot("song", `Arrival + ${songs[0].title}`);
    if (transitions.length) pushSlot("transition", transitions[0]);
    dayActivities.forEach((card) => pushSlot("activity", card.title));
    if (books.length) pushSlot("book", `Read-aloud · ${books[0].title}`);
    if (text(dayPlan.outdoorPlay)) pushSlot("outdoor", "Outdoor play");
    if (dayActivities.length || songs.length) pushSlot("transition", "Cleanup → next routine");

    const observations = uniqueStrings([
      ...asArray(dayPlan.observations).map(text),
      ...dayActivities.flatMap((card) => card.observationIdeas.map((idea) => `${card.title}: ${idea}`)),
    ], 12);

    const parentMessage =
      text(dayPlan.familyConnection) ||
      text(plan.familyConnection);

    return {
      day,
      dayLabel: DAY_LABELS[day],
      focus: text(dayPlan.theme) || text(dayPlan.objectives) || text(plan.theme),
      schedule,
      activities: dayActivities.map((card) => ({
        id: card.id,
        title: card.title,
        sectionId: card.sectionId,
        hasExamplePhoto: card.hasExamplePhoto,
        hasSetupPhoto: card.hasSetupPhoto,
      })),
      books,
      songs,
      vocabulary: vocabulary.slice(0, 8),
      materials: uniqueStrings([...materialsList(dayPlan.materials), ...dayActivities.flatMap((card) => card.materials)], 24),
      transitions,
      observations,
      parentMessage,
      parentMessageReadyToSend: Boolean(parentMessage),
      quickNotesPlaceholder: "Add a quick classroom note…",
    };
  }

  function uniqueByTitle(items) {
    const seen = new Map();
    const out = [];
    items.forEach((item) => {
      const key = text(item && item.title).toLowerCase();
      if (!key) return;
      if (!seen.has(key)) {
        seen.set(key, out.length);
        out.push(item);
        return;
      }
      // Prefer the richer entry when the same title appears at day + week level.
      const index = seen.get(key);
      const current = out[index];
      out[index] = {
        ...current,
        ...item,
        author: text(item.author) || text(current.author),
        notes: text(item.notes).length >= text(current.notes).length ? item.notes : current.notes,
        lyrics: text(item.lyrics) || text(current.lyrics),
        motions: text(item.motions) || text(current.motions),
        readAloudQuestions:
          (item.readAloudQuestions && item.readAloudQuestions.length
            ? item.readAloudQuestions
            : current.readAloudQuestions) || [],
        whyThisBook: text(item.whyThisBook) || text(current.whyThisBook),
      };
    });
    return out;
  }

  function inferPrintableUsedInWeek(resource, plan, activityCards) {
    const title = text(resource.title).toLowerCase();
    const slots = [];
    WEEKDAYS.forEach((day) => {
      const dayCards = activityCards.filter((card) => card.dayOfWeek === day);
      const hit = dayCards.find((card) => {
        const hay = `${card.title} ${card.materials.join(" ")}`.toLowerCase();
        return title && (hay.includes(title.slice(0, 8)) || title.includes(text(card.title).toLowerCase().slice(0, 8)));
      });
      if (hit) {
        slots.push({
          day,
          dayLabel: DAY_LABELS[day],
          moment: `with ${hit.title}`,
          activityId: hit.id,
        });
      }
    });
    if (!slots.length && activityCards.length) {
      const first = activityCards[0];
      slots.push({
        day: first.dayOfWeek || "monday",
        dayLabel: DAY_LABELS[first.dayOfWeek] || "Monday",
        moment: "classroom resources",
        activityId: first.id,
      });
    }
    if (!slots.length && text(plan.weeklyOverview)) {
      slots.push({
        day: "monday",
        dayLabel: "Monday",
        moment: "week overview / circle",
        activityId: "",
      });
    }
    return slots;
  }

  function buildPrintables(plan, resources, activityCards) {
    const planId = text(plan.id);
    const linked = asArray(resources).filter((resource) => {
      if (!resource || typeof resource !== "object") return false;
      if (asArray(plan.resourceIds).includes(text(resource.id))) return true;
      return asArray(resource.lessonPlanIds).includes(planId);
    });
    return linked.map((resource) => {
      const usedInWeek = inferPrintableUsedInWeek(resource, plan, activityCards);
      return {
        id: text(resource.id),
        title: text(resource.title) || "Printable",
        resourceCategory: text(resource.resourceCategory) || "Classroom Resources",
        usedInWeek,
        linkedActivityIds: uniqueStrings(usedInWeek.map((slot) => slot.activityId), 10),
        fileName: text(resource.fileName),
        mimeType: text(resource.mimeType),
      };
    });
  }

  function buildOpenEverything(dayModel, printables) {
    const items = [];
    asArray(dayModel.activities).forEach((activity) => {
      items.push({
        kind: "activity",
        id: activity.id,
        title: activity.title,
        detail: "Activity card · example + setup photos when available",
      });
    });
    asArray(dayModel.books).forEach((book) => {
      items.push({
        kind: "book",
        id: `book:${book.title}`,
        title: book.title,
        detail: "Book · read-aloud questions",
      });
    });
    asArray(dayModel.songs).forEach((song) => {
      items.push({
        kind: "song",
        id: `song:${song.title}`,
        title: song.title,
        detail: "Song · lyrics + motions when available",
      });
    });
    asArray(printables).forEach((printable) => {
      const usedToday = printable.usedInWeek.some((slot) => slot.day === dayModel.day);
      if (!usedToday && printable.usedInWeek.length) return;
      items.push({
        kind: "printable",
        id: printable.id,
        title: printable.title,
        detail: "Printable",
        usedInWeek: printable.usedInWeek,
      });
    });
    if (dayModel.parentMessage) {
      items.push({
        kind: "parent_message",
        id: "parent-message",
        title: "Parent connection",
        detail: "Ready-to-send family message",
        body: dayModel.parentMessage,
      });
    }
    return {
      day: dayModel.day,
      dayLabel: dayModel.dayLabel,
      items,
      observationIdeas: dayModel.observations,
    };
  }

  function sectionContent(sectionId, ctx) {
    switch (sectionId) {
      case "overview":
        return {
          weeklyOverview: ctx.plan.weeklyOverview,
          theme: ctx.plan.theme,
          age: ctx.plan.age,
          title: ctx.plan.title,
        };
      case "objectives":
        return { objectives: bulletLines(ctx.plan.objectives) };
      case "vocabulary":
        return { words: ctx.vocabulary };
      case "materials":
        return { materials: ctx.weekMaterials };
      case "weekly_plan":
        return {
          days: WEEKDAYS.map((day) => ({
            day,
            dayLabel: DAY_LABELS[day],
            activityCount: ctx.activityCards.filter((card) => card.dayOfWeek === day).length,
            focus: text(ctx.plan.dailyPlans?.[day]?.theme),
          })),
        };
      case "daily_activities":
        return { activities: ctx.activityCards };
      case "books":
        return { books: ctx.books };
      case "songs":
        return { songs: ctx.songs };
      case "teacher_tips":
        return { adaptations: text(ctx.plan.adaptations) };
      case "observations":
        return { prompts: bulletLines(ctx.plan.observationOpportunities) };
      case "family":
        return { familyConnection: text(ctx.plan.familyConnection) };
      case "printables":
        return { printables: ctx.printables };
      case "examples":
        return {
          activitiesWithPhotos: ctx.activityCards.filter((card) => card.hasExamplePhoto || card.hasSetupPhoto),
        };
      case "family_letter":
        return { letter: text(ctx.plan.familyConnection) };
      case "observation_forms":
        return { prompts: bulletLines(ctx.plan.observationOpportunities) };
      case "vocab_cards":
        return { words: ctx.vocabulary };
      case "teacher_notes":
        return { notes: text(ctx.plan.adaptations) };
      case "extensions":
        return {
          extensions: ctx.activityCards.map((card) => card.extensions).filter(Boolean),
        };
      default: {
        const filtered = ctx.activityCards.filter((card) => card.sectionId === sectionId);
        return { activities: filtered };
      }
    }
  }

  function sectionHasContent(sectionId, content) {
    if (!content || typeof content !== "object") return false;
    if (Array.isArray(content.activities)) return content.activities.length > 0;
    if (Array.isArray(content.books)) return content.books.length > 0;
    if (Array.isArray(content.songs)) return content.songs.length > 0;
    if (Array.isArray(content.words)) return content.words.length > 0;
    if (Array.isArray(content.materials)) return content.materials.length > 0;
    if (Array.isArray(content.objectives)) return content.objectives.length > 0;
    if (Array.isArray(content.prompts)) return content.prompts.length > 0;
    if (Array.isArray(content.printables)) return content.printables.length > 0;
    if (Array.isArray(content.activitiesWithPhotos)) return content.activitiesWithPhotos.length > 0;
    if (Array.isArray(content.extensions)) return content.extensions.length > 0;
    if (Array.isArray(content.days)) return content.days.some((day) => day.activityCount > 0 || day.focus);
    if (text(content.weeklyOverview)) return true;
    if (text(content.familyConnection)) return true;
    if (text(content.letter)) return true;
    if (text(content.adaptations)) return true;
    if (text(content.notes)) return true;
    return false;
  }

  /**
   * @param {object} plan normalized lesson plan
   * @param {object[]} [activities]
   * @param {object[]} [resources]
   * @param {object} [options]
   * @param {boolean} [options.includeEmptySections=false] admin/preview
   * @param {string} [options.day=monday] default Today day
   * @param {string[]} [options.readyMaterials] materials marked ready (for missing + substitute)
   * @param {object} deps { SECTIONS, mapActivityCategoryToSection }
   */
  function mapLessonPlanToTeachingKit(plan, activities, resources, options, deps) {
    const safePlan = plan && typeof plan === "object" ? plan : null;
    if (!safePlan || !text(safePlan.id)) {
      return {
        schemaVersion: 1,
        ok: false,
        reason: "missing_plan",
        sections: [],
        companion: null,
      };
    }

    const sectionsRegistry = asArray(deps && deps.SECTIONS);
    const mapCategory =
      typeof (deps && deps.mapActivityCategoryToSection) === "function"
        ? deps.mapActivityCategoryToSection
        : function () { return "daily_activities"; };

    const includeEmpty = Boolean(options && options.includeEmptySections);
    const readyMaterials = asArray(options && options.readyMaterials);
    const selectedDayRaw = text(options && options.day).toLowerCase();
    const selectedDay = WEEKDAYS.includes(selectedDayRaw) ? selectedDayRaw : "monday";

    const resolved = resolvePlanActivities(safePlan, activities);
    let activityCards = resolved.map((entry) => mapActivityCard(entry, mapCategory));
    activityCards = activityCards.map((card) => ({
      ...card,
      substituteCandidates: buildSubstituteCandidates(card, activityCards, readyMaterials, 3),
    }));

    const vocabulary = vocabularyEntries(safePlan.vocabularyWords);
    const books = uniqueByTitle(asArray(safePlan.books).map(bookEntry).filter(Boolean));
    const songs = uniqueByTitle(asArray(safePlan.songs).map(songEntry).filter(Boolean));
    const printables = buildPrintables(safePlan, resources, activityCards);
    const weekMaterials = collectWeekMaterials(safePlan, activityCards);

    const ctx = {
      plan: safePlan,
      activityCards,
      vocabulary,
      books,
      songs,
      printables,
      weekMaterials,
    };

    const sections = sectionsRegistry.map((section) => {
      const content = sectionContent(section.id, ctx);
      const visible = sectionHasContent(section.id, content);
      return {
        id: section.id,
        label: section.label,
        printDefault: section.printDefault === true,
        visible,
        itemCount: Array.isArray(content.activities)
          ? content.activities.length
          : Array.isArray(content.books)
            ? content.books.length
            : Array.isArray(content.songs)
              ? content.songs.length
              : Array.isArray(content.words)
                ? content.words.length
                : Array.isArray(content.materials)
                  ? content.materials.length
                  : Array.isArray(content.printables)
                    ? content.printables.length
                    : visible
                      ? 1
                      : 0,
        content: visible || includeEmpty ? content : null,
      };
    }).filter((section) => includeEmpty || section.visible);

    const mondayMorningSetup = buildMondayMorningSetup(safePlan, activityCards, printables, {
      readyMaterials,
    });

    const days = {};
    WEEKDAYS.forEach((day) => {
      days[day] = buildDayClassroom(safePlan, day, activityCards, vocabulary);
    });

    const today = days[selectedDay];
    const openEverything = buildOpenEverything(today, printables);

    const overlay =
      safePlan.teachingKit && typeof safePlan.teachingKit === "object" && !Array.isArray(safePlan.teachingKit)
        ? safePlan.teachingKit
        : null;

    return {
      schemaVersion: 1,
      ok: true,
      lessonPlanId: text(safePlan.id),
      title: text(safePlan.title) || "Untitled Lesson Plan",
      age: text(safePlan.age),
      theme: text(safePlan.theme),
      plan: text(safePlan.plan) === "Pro" ? "Pro" : "Free",
      status: text(safePlan.status),
      coverImageUrl: text(safePlan.coverImageUrl),
      coverImageAlt: text(safePlan.coverImageAlt),
      completeness: text(overlay && overlay.completeness) || "legacy_mapped",
      sections,
      companion: {
        surfaces: [
          "start_week",
          "monday_morning_setup",
          "todays_classroom",
          "open_everything_today",
          "activity_detail",
          "printables",
          "build_my_kit",
          "binder",
        ],
        mondayMorningSetup,
        days,
        today,
        openEverything,
        activities: activityCards,
        printables,
        vocabulary,
        books,
        songs,
        parentConnection: {
          readyToSendMessage: text(safePlan.familyConnection),
          pickupTalkingPoints: bulletLines(safePlan.familyConnection).slice(0, 3),
        },
        buildMyKit: {
          presets: BUILD_PRESETS.slice(),
          activities: activityCards.map((card) => ({
            id: card.id,
            title: card.title,
            dayOfWeek: card.dayOfWeek,
            sectionId: card.sectionId,
            includedDefault: true,
            substituteAvailable: card.substituteCandidates.length > 0,
          })),
          alwaysIncluded: [
            "Monday Morning Setup",
            "Daily Classroom pages",
            "Books + read-aloud questions",
            "Songs + motions",
            "Vocabulary",
            "Parent connection messages",
            "Observation prompts",
            "Printables with Used in week",
          ],
          sections: sections.map((section) => ({
            id: section.id,
            label: section.label,
            printDefault: section.printDefault,
            available: section.visible,
          })),
        },
        binder: {
          cover: {
            brand: "Little Learner Hub",
            title: text(safePlan.title) || "Teaching Kit",
            subtitle: `Complete Teaching Kit · ${text(safePlan.age) || "Classroom"}`,
            theme: text(safePlan.theme),
          },
          tabs: BINDER_TABS.slice(),
          footerLabel: `${text(safePlan.title) || "Teaching Kit"} · Teaching Kit`,
        },
      },
      quality: {
        activityCount: activityCards.length,
        activitiesWithExamplePhoto: activityCards.filter((card) => card.hasExamplePhoto).length,
        activitiesWithSetupPhoto: activityCards.filter((card) => card.hasSetupPhoto).length,
        printableCount: printables.length,
        hasParentMessage: Boolean(text(safePlan.familyConnection)),
        hasVocabulary: vocabulary.length > 0,
      },
    };
  }

  return {
    WEEKDAYS,
    DAY_LABELS,
    BINDER_TABS,
    BUILD_PRESETS,
    mapLessonPlanToTeachingKit,
  };
});
