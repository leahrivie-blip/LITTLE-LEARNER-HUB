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

  const materialsApi = (typeof require === "function"
    ? (() => { try { return require("./teaching-kit-materials.js"); } catch (_e) { return null; } })()
    : null)
    || (typeof globalThis !== "undefined" ? globalThis.LLHTeachingKitMaterials : null)
    || null;

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const DAY_LABELS = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  /** Vision-aligned digital binder tabs (provider-facing). */
  const BINDER_TABS = Object.freeze([
    Object.freeze({ id: "overview", label: "Overview" }),
    Object.freeze({ id: "weekly_plan", label: "Weekly Plan" }),
    Object.freeze({ id: "activities", label: "Activities" }),
    Object.freeze({ id: "printables", label: "Printables" }),
    Object.freeze({ id: "songs", label: "Songs" }),
    Object.freeze({ id: "books", label: "Books" }),
    Object.freeze({ id: "examples", label: "Example Images" }),
    Object.freeze({ id: "teacher_toolkit", label: "Teacher Toolkit" }),
  ]);

  const PROVIDER_BINDER_SECTION_MAP = Object.freeze({
    overview: "overview",
    weekly_plan: "weekly_plan",
    activities: "daily_activities",
    printables: "printables",
    songs: "songs",
    books: "books",
    examples: "examples",
    teacher_toolkit: "teacher_toolkit",
  });

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
    const questionLines = bulletLines(entry.questions || entry.readAloudQuestions || notes);
    const before = bulletLines(entry.beforeReadingQuestions || entry.beforeQuestions);
    const during = bulletLines(entry.duringReadingPrompts || entry.duringQuestions);
    const after = bulletLines(entry.afterReadingQuestions || entry.afterQuestions);
    return {
      title,
      author: text(entry.author),
      notes,
      suggestedWeekday: text(entry.suggestedWeekday || entry.dayOfWeek || entry.day),
      whyThisBook: text(entry.whyThisBook || entry.whyItFits) || (questionLines.length ? "" : notes),
      beforeReadingQuestions: before,
      duringReadingPrompts: during,
      afterReadingQuestions: after.length ? after : questionLines,
      readAloudQuestions: questionLines,
      vocabularyConnections: bulletLines(entry.vocabularyConnections || entry.vocabulary),
      extensionIdea: text(entry.extensionIdea || entry.extension),
      alternativeBooks: asArray(entry.alternativeBooks || entry.substitutes).map(text).filter(Boolean),
      libraryNote: text(entry.libraryNote || entry.libraryAvailability),
      // Covers only when explicitly provided as an approved reference — never invent.
      coverImageUrl: text(entry.coverImageUrl || entry.coverUrl),
      coverImageAlt: text(entry.coverImageAlt),
    };
  }

  function songEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const title = text(entry.title);
    if (!title) return null;
    const notes = text(entry.notes);
    let lyrics = text(entry.lyrics);
    let motions = text(entry.motions);
    const lyricsMatch = !lyrics && notes.match(/lyrics?:\s*([\s\S]*?)(?:motions?:|$)/i);
    const motionsMatch = !motions && notes.match(/motions?:\s*([\s\S]*)$/i);
    if (lyricsMatch) lyrics = text(lyricsMatch[1]);
    if (motionsMatch) motions = text(motionsMatch[1]);
    if (!lyrics && !motions && notes) {
      // Legacy: keep notes as teaching cue, never invent copyrighted lyrics.
      motions = notes;
    }
    const rights = text(entry.rightsStatus || entry.copyrightStatus || entry.status).toLowerCase();
    const canPrintLyrics = rights === "original"
      || rights === "public-domain"
      || rights === "public_domain"
      || rights === "traditional"
      || Boolean(entry.allowPrintLyrics);
    return {
      title,
      notes,
      lyrics: canPrintLyrics ? lyrics : "",
      lyricsPrintable: canPrintLyrics && Boolean(lyrics),
      rightsStatus: text(entry.rightsStatus || entry.copyrightStatus) || (lyrics ? "unspecified" : "title-only"),
      tune: text(entry.tune || entry.tuneInformation),
      motions,
      whenToUse: text(entry.whenToUse),
      teacherDirections: text(entry.teacherDirections || entry.directions),
      ageAdaptations: text(entry.ageAdaptations || entry.adaptations),
      linkedWeekday: text(entry.linkedWeekday || entry.dayOfWeek || entry.day),
      audioUrl: text(entry.audioUrl),
      externalReference: text(entry.externalReference),
    };
  }

  const VOCAB_PROMPT_PATTERNS = Object.freeze([
    (word) => `What do you notice about the ${word}?`,
    (word) => `How is a ${word} like something you already know?`,
    (word) => `What sound, texture, or movement makes you think of a ${word}?`,
    (word) => `Where might a ${word} live, sleep, or belong?`,
    (word) => `How could we carefully care for or use a ${word}?`,
    (word) => `What do you predict will happen next with the ${word}?`,
  ]);

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
        const word = text(dash[1]);
        const customAsk = askSplit[1] ? text(askSplit[1]) : "";
        const genericAsk = /^can you show me or tell me about/i.test(customAsk);
        out.push({
          word,
          definition: text(askSplit[0]).replace(/\.$/, ""),
          discussionIdea: customAsk && !genericAsk
            ? customAsk
            : VOCAB_PROMPT_PATTERNS[out.length % VOCAB_PROMPT_PATTERNS.length](word),
        });
        continue;
      }
      out.push({
        word: part,
        definition: "",
        discussionIdea: VOCAB_PROMPT_PATTERNS[out.length % VOCAB_PROMPT_PATTERNS.length](part),
      });
    }
    return out;
  }

  function teacherPromptsFrom(source) {
    const tips = asArray(source.teacherTips).map(text).filter(Boolean);
    if (tips.length) {
      return tips.slice(0, 8).map((tip) => ({ label: "Tip", text: tip }));
    }
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

  function supplySubstitutionsFrom(source) {
    return asArray(source.substitutions).map((item) => {
      if (!item || typeof item !== "object") return null;
      const need = text(item.need || item.from);
      const use = text(item.use || item.to);
      if (!need || !use) return null;
      return { need, use };
    }).filter(Boolean).slice(0, 12);
  }

  function settingTagsFrom(source) {
    const allowed = new Set(["small_group", "large_group", "indoor", "outdoor"]);
    return asArray(source.settingTags)
      .map((tag) => text(tag).toLowerCase().replace(/\s+/g, "_"))
      .filter((tag) => allowed.has(tag))
      .slice(0, 8);
  }

  /** Cleanup is distinct from safety — never invent cleanup from safety boilerplate. */
  function cleanupTipsFrom(source) {
    const fromField = bulletLines(
      source.cleanupTips
      || source.cleanup
      || source.cleanupInstructions
      || source.resetInstructions,
    );
    return uniqueStrings(fromField, 8);
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

  function humanizeCategoryLabel(value) {
    const raw = text(value);
    if (!raw) return "Open-Ended Exploration";
    if (/[A-Z]/.test(raw) && !/_/.test(raw)) return raw;
    return raw
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function mapActivityCard(entry, mapCategory) {
    // Daily-item authored fields are the source of truth when present; thin synced
    // store activities must not wipe setupMinutes / groupSize / extraSupport / etc.
    const activity = entry.activity && typeof entry.activity === "object" ? entry.activity : {};
    const item = entry.item && typeof entry.item === "object" ? entry.item : {};
    const source = { ...activity, ...item };
    // Keep enrichment media from the activity record when the daily item omits URLs.
    if (!text(source.setupImageUrl || source.setupPhotoUrl)) {
      source.setupImageUrl = activity.setupImageUrl || activity.setupPhotoUrl || "";
      source.setupMediaAssetId = activity.setupMediaAssetId || source.setupMediaAssetId;
    }
    if (!text(source.exampleImageUrl || source.examplePhotoUrl)) {
      source.exampleImageUrl = activity.exampleImageUrl || activity.examplePhotoUrl || "";
      source.exampleMediaAssetId = activity.exampleMediaAssetId || source.exampleMediaAssetId;
    }
    const title = text(source.title) || "Activity";
    const categoryRaw = text(source.activityCategory) || "Open-Ended Exploration";
    const category = humanizeCategoryLabel(categoryRaw);
    const materials = text(source.materials);
    const setup = text(source.setup);
    const steps = text(source.steps);
    const learningObjective =
      text(source.objective) ||
      asArray(source.learningGoals).map(text).filter(Boolean)[0] ||
      "";
    const minutes = estimateMinutesForActivity(source);
    const explicitDuration = Number(source.durationMinutes || source.activityDurationMinutes);
    const durationMinutes = Number.isFinite(explicitDuration) && explicitDuration > 0
      ? explicitDuration
      : minutes.total;
    const explicitSetup = Number(source.setupMinutes);
    const setupMinutes = Number.isFinite(explicitSetup) && explicitSetup >= 0
      ? explicitSetup
      : minutes.setup;
    const examplePhotoUrl = text(source.exampleImageUrl || source.examplePhotoUrl);
    const setupPhotoUrl = text(source.setupImageUrl || source.setupPhotoUrl);
    const exampleCaption = text(source.exampleImageCaption || source.exampleCaption);
    const setupCaption = text(source.setupImageCaption || source.setupCaption);
    const exampleAlt = text(source.exampleImageAlt || source.exampleAlt)
      || (examplePhotoUrl ? `Finished example for ${title}` : "");
    const setupAlt = text(source.setupImageAlt || source.setupAlt)
      || (setupPhotoUrl ? `Setup example for ${title}` : "");
    let safetyNotes = text(source.safetyNotes);
    const milkingCue = /milk|rubber glove|pinhole|latex/i.test(`${title} ${materials} ${steps} ${setup}`);
    if (milkingCue && !/latex-free|nitrile|vinyl|sanit/i.test(safetyNotes)) {
      const gloveNote = "Use a latex-free glove (nitrile or vinyl) or a safer milking prop. Sanitize before/after, supervise closely, and stop if any child has a known material sensitivity.";
      safetyNotes = safetyNotes ? `${safetyNotes}\n${gloveNote}` : gloveNote;
    }
    return {
      id: entry.id,
      sourceKey: entry.sourceKey,
      dayOfWeek: entry.dayOfWeek || text(source.dayOfWeek),
      title,
      activityCategory: category,
      activityCategoryRaw: categoryRaw,
      sectionId: mapCategory(categoryRaw),
      description: text(source.description),
      purpose: text(source.purpose || source.description),
      imageRequirement: text(source.imageRequirement),
      examplePhotoUrl,
      setupPhotoUrl,
      // Preserve storage field names for enrichment round-trips / debugging.
      exampleImageUrl: examplePhotoUrl,
      setupImageUrl: setupPhotoUrl,
      exampleCaption,
      setupCaption,
      exampleAlt,
      setupAlt,
      materials: materialsList(materials),
      materialsText: materials,
      learningObjective,
      developmentalDomains: asArray(source.developmentalDomains || source.domains).map(text).filter(Boolean),
      setupMinutes,
      activityDurationMinutes: durationMinutes,
      groupSize: text(source.groupSize),
      dailyPlacement: text(source.dailyPlacement || source.placement),
      teacherPrompts: teacherPromptsFrom(source),
      setup,
      steps,
      preparation: text(source.preparation || source.prep || setup),
      cleanupTips: cleanupTipsFrom(source),
      observationIdeas: observationIdeasFrom(source),
      adaptations: text(source.adaptations),
      extraSupport: text(source.extraSupport || source.differentiation),
      extensions: text(source.extensions || source.challengeExtension),
      mixedAgeAdaptations: text(source.mixedAgeAdaptations || source.mixedAge),
      indoorAlternative: text(source.indoorAlternative || source.indoorAlternatives || source.indoor),
      outdoorOption: text(source.outdoorOption || source.outdoorAlternatives || source.outdoor),
      safetyNotes,
      familyConnection: text(source.familyConnection),
      printableInstructions: text(source.printableInstructions),
      vocabulary: vocabularyEntries(source.vocabulary),
      estimatedMinutes: durationMinutes,
      hasExamplePhoto: Boolean(examplePhotoUrl),
      hasSetupPhoto: Boolean(setupPhotoUrl),
      settingTags: settingTagsFrom(source).map(humanizeCategoryLabel),
      supplySubstitutions: supplySubstitutionsFrom(source),
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
    const materialsExplain = materialsApi && materialsApi.explainMissingMaterials
      ? materialsApi.explainMissingMaterials(materials, readyMaterials, { highlightCritical: true })
      : null;
    const missingMaterials = materialsExplain
      ? (materialsExplain.mode === "missing" ? materialsExplain.missing : [])
      : (() => {
        const readySet = new Set(readyMaterials.map(normalizeMaterialToken));
        if (!readySet.size) return [];
        return materials
          .filter((item) => item.critical)
          .filter((item) => {
            const token = normalizeMaterialToken(item.label);
            for (const ready of readySet) {
              if (ready === token || ready.includes(token) || token.includes(ready)) return false;
            }
            return true;
          })
          .map((item) => item.label);
      })();

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
      missingMaterials,
      missingHighlighted: Boolean(missingMaterials.length),
      materialsStatus: materialsExplain || {
        mode: readyMaterials.length ? (missingMaterials.length ? "missing" : "ready") : "gather",
        summary: missingMaterials.length
          ? `${missingMaterials.length} priority supplies still missing.`
          : (materials.length ? "Gather listed supplies before Monday." : "No materials listed yet."),
        fixHint: missingMaterials.length
          ? "Locate or substitute each missing supply, then mark it ready."
          : "Check off supplies as you pull them.",
        items: (missingMaterials.length ? missingMaterials : materials.slice(0, 8).map((m) => m.label)).map((label) => ({
          label,
          status: missingMaterials.length ? "missing" : "to_gather",
          howToFix: missingMaterials.length
            ? `Locate or substitute “${label}”, then mark ready.`
            : `Pull “${label}” onto your prep tray.`,
        })),
      },
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

    // Transitions stay transitions-only. Never fold Circle Time / family copy into
    // schedule slots — that maps one authored field into unrelated sections.
    const transitions = uniqueStrings([
      ...asArray(dayPlan.transitions).map(text),
    ], 10);
    const hasCircleTime = asArray(dayPlan.circleTime).map((item) => text(item)).some(Boolean);

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
    if (hasCircleTime) pushSlot("circle", "Circle time");
    if (transitions.length) pushSlot("transition", "Transition");
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
      const fileData = text(resource.fileData);
      const fileUrl = text(resource.fileUrl || resource.url || resource.downloadUrl || resource.mediaUrl);
      // Prefer inline/https file refs already stored on the resource — display/print only.
      const resolvedFile = fileData || fileUrl;
      return {
        id: text(resource.id),
        title: text(resource.title) || "Printable",
        resourceCategory: text(resource.resourceCategory) || "Classroom Resources",
        usedInWeek,
        linkedActivityIds: uniqueStrings(usedInWeek.map((slot) => slot.activityId), 10),
        fileName: text(resource.fileName),
        mimeType: text(resource.mimeType),
        fileData,
        fileUrl: resolvedFile,
        previewUrl: text(
          resource.previewUrl
          || resource.previewImageUrl
          || resource.thumbnailUrl
          || resource.coverImageUrl,
        ),
        previewImageUrl: text(resource.previewImageUrl || resource.previewUrl),
        description: text(resource.description),
        printingInstructions: text(resource.printingInstructions),
        pageCount: Number(resource.pageCount) || 0,
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
          days: WEEKDAYS.map((day) => {
            const dayPlan = ctx.plan.dailyPlans?.[day] || {};
            const dayClassroom = ctx.days?.[day] || {};
            const dayActs = ctx.activityCards.filter((card) => card.dayOfWeek === day);
            const focus = text(dayPlan.theme)
              || text(dayPlan.focus)
              || text(dayPlan.objectives)
              || text(dayClassroom.focus)
              || "";
            return {
              day,
              dayLabel: DAY_LABELS[day],
              activityCount: dayActs.length,
              focus,
              // Structured weekday fields — empty strings mean "not authored yet"
              // (owner preview shows intentional empty; customers hide empty kits via quality gates).
              dailyFocus: focus,
              circleTime: text(dayPlan.circleTime) || asArray(dayPlan.circleTime).map(text).filter(Boolean).join("; "),
              book: text((asArray(dayPlan.books).map(bookEntry).filter(Boolean)[0] || {}).title),
              song: text((asArray(dayPlan.songs).map(songEntry).filter(Boolean)[0] || {}).title),
              invitationToPlay: text(dayPlan.invitationToPlay || dayPlan.invitation),
              activityLinks: dayActs.map((card) => ({ id: card.id, title: card.title })),
              sensory: text(dayPlan.sensory || dayPlan.sensoryExperience),
              fineMotor: text(dayPlan.fineMotor || dayPlan.fineMotorExperience),
              grossMotor: text(dayPlan.grossMotor || dayPlan.grossMotorExperience),
              artCreative: text(dayPlan.art || dayPlan.creative || dayPlan.artCreative),
              smallGroup: text(dayPlan.smallGroup || dayPlan.smallGroupOption),
              largeGroup: text(dayPlan.largeGroup || dayPlan.largeGroupOption),
              indoorAlternative: text(dayPlan.indoorAlternative || dayPlan.indoor),
              outdoorOption: text(dayPlan.outdoorPlay || dayPlan.outdoor || dayPlan.outdoorOption),
              dailyMaterials: uniqueStrings([
                ...materialsList(dayPlan.materials),
                ...dayActs.flatMap((card) => card.materials || []),
              ], 30),
              teacherPreparation: text(dayPlan.teacherPreparation || dayPlan.prep),
              suggestedQuestions: bulletLines(dayPlan.suggestedQuestions || dayPlan.questions),
              observationFocus: bulletLines(dayPlan.observations || dayPlan.observationFocus),
              // Do not reuse circleTime here — Circle Time has its own section.
              transitionSupport: uniqueStrings([
                ...asArray(dayPlan.transitions).map(text),
              ], 10),
              familyConnection: text(dayPlan.familyConnection),
              teacherNotes: text(dayPlan.teacherNotes || dayPlan.notes),
              incomplete: !focus,
            };
          }),
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
      case "teacher_toolkit": {
        const toolkit = ctx.teacherToolkit || {};
        const materialsModel = ctx.materialsModel || null;
        const list = (raw) => asArray(raw).map(text).filter(Boolean);
        return {
          prepChecklist: list(toolkit.prepChecklist),
          observationFocus: list(toolkit.observationFocus),
          notes: text(toolkit.notes),
          teacherPreparation: text(toolkit.teacherPreparation),
          teacherTips: list(toolkit.teacherTips || toolkit.tips),
          setupCleanupShortcuts: list(toolkit.setupCleanupShortcuts || toolkit.setupShortcuts),
          dailyMaterialsSummary: text(toolkit.dailyMaterialsSummary)
            || (materialsModel
              ? WEEKDAYS.map((day) => {
                const row = materialsModel.byDay?.[day];
                const mats = (row?.materials || []).join(", ");
                return mats ? `${DAY_LABELS[day]}: ${mats}` : "";
              }).filter(Boolean).join("\n")
              : ""),
          masterMaterialsChecklist: list(toolkit.masterMaterialsChecklist || toolkit.masterMaterials).length
            ? list(toolkit.masterMaterialsChecklist || toolkit.masterMaterials)
            : asArray(ctx.weekMaterials).map(text).filter(Boolean),
          materialSubstitutions: list(toolkit.materialSubstitutions || toolkit.substitutions),
          vocabulary: list(toolkit.vocabulary).length
            ? list(toolkit.vocabulary)
            : (ctx.vocabulary || []).map((word) => word.word || word).filter(Boolean),
          observationPrompts: list(toolkit.observationPrompts).length
            ? list(toolkit.observationPrompts)
            : bulletLines(ctx.plan.observationOpportunities),
          documentationPrompts: list(toolkit.documentationPrompts || toolkit.milestonePrompts),
          mixedAgeAdaptations: text(toolkit.mixedAgeAdaptations),
          extraSupportAdaptations: text(toolkit.extraSupportAdaptations || toolkit.extraSupport),
          challengeExtensions: text(toolkit.challengeExtensions || toolkit.extensions),
          smallGroupOptions: text(toolkit.smallGroupOptions),
          largeGroupOptions: text(toolkit.largeGroupOptions),
          indoorAlternatives: text(toolkit.indoorAlternatives),
          outdoorOptions: text(toolkit.outdoorOptions),
          familyConnection: text(toolkit.familyConnection) || text(ctx.plan.familyConnection),
          safetyInclusionNotes: text(toolkit.safetyInclusionNotes || toolkit.safetyNotes),
          endOfWeekReflection: text(toolkit.endOfWeekReflection),
          suggestedQuestions: list(toolkit.suggestedQuestions || toolkit.questionsToAsk),
        };
      }
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
    if (Array.isArray(content.prepChecklist) || content.teacherPreparation != null || content.masterMaterialsChecklist) {
      // Teacher Toolkit: any authored toolkit field counts as content.
      return Boolean(
        content.prepChecklist?.length > 0
        || (Array.isArray(content.observationFocus) && content.observationFocus.length > 0)
        || (Array.isArray(content.teacherTips) && content.teacherTips.length > 0)
        || (Array.isArray(content.setupCleanupShortcuts) && content.setupCleanupShortcuts.length > 0)
        || (Array.isArray(content.masterMaterialsChecklist) && content.masterMaterialsChecklist.length > 0)
        || (Array.isArray(content.materialSubstitutions) && content.materialSubstitutions.length > 0)
        || (Array.isArray(content.vocabulary) && content.vocabulary.length > 0)
        || (Array.isArray(content.observationPrompts) && content.observationPrompts.length > 0)
        || (Array.isArray(content.documentationPrompts) && content.documentationPrompts.length > 0)
        || (Array.isArray(content.suggestedQuestions) && content.suggestedQuestions.length > 0)
        || text(content.notes)
        || text(content.teacherPreparation)
        || text(content.dailyMaterialsSummary)
        || text(content.mixedAgeAdaptations)
        || text(content.extraSupportAdaptations)
        || text(content.challengeExtensions)
        || text(content.smallGroupOptions)
        || text(content.largeGroupOptions)
        || text(content.indoorAlternatives)
        || text(content.outdoorOptions)
        || text(content.familyConnection)
        || text(content.safetyInclusionNotes)
        || text(content.endOfWeekReflection),
      );
    }
    if (Array.isArray(content.days)) return content.days.some((day) => day.activityCount > 0 || day.focus);
    if (text(content.weeklyOverview)) return true;
    if (text(content.familyConnection)) return true;
    if (text(content.letter)) return true;
    if (text(content.adaptations)) return true;
    if (text(content.notes)) return true;
    return false;
  }

  function buildProviderBinder(sections, plan, overlay, options = {}) {
    const includeEmptyTabs = Boolean(options.includeEmptyBinderTabs || options.includeEmptySections || options.ownerPreview);
    const bySectionId = new Map(asArray(sections).map((section) => [section.id, section]));
    const tabs = BINDER_TABS.map((tab) => {
      const sectionId = PROVIDER_BINDER_SECTION_MAP[tab.id] || tab.id;
      const section = bySectionId.get(sectionId);
      const hasContent = Boolean(section && section.visible);
      // Owner preview keeps every binder tab (intentional empty states).
      // Customer / default: hide truly empty sections.
      const visible = includeEmptyTabs ? true : hasContent;
      return {
        id: tab.id,
        label: tab.label,
        sectionId,
        visible,
        empty: !hasContent,
        itemCount: section ? Number(section.itemCount || 0) : 0,
      };
    }).filter((tab) => tab.visible);
    return {
      cover: {
        brand: "Little Learner Hub",
        title: text(plan.title) || "Teaching Kit",
        subtitle: `Everything you need this week · ${text(plan.age) || "Classroom"}`,
        theme: text(plan.theme),
        imageUrl: text(plan.coverImageUrl),
        imageAlt: text(plan.coverImageAlt) || text(plan.title) || "Lesson cover",
      },
      tabs,
      footerLabel: `${text(plan.title) || "Teaching Kit"} · Teaching Kit`,
      teacherToolkit: overlay && overlay.teacherToolkit && typeof overlay.teacherToolkit === "object"
        ? overlay.teacherToolkit
        : null,
    };
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
    const materialsModel = materialsApi && materialsApi.buildMaterialsModel
      ? materialsApi.buildMaterialsModel(safePlan, activityCards)
      : null;
    const weekMaterials = materialsModel
      ? materialsModel.master
      : collectWeekMaterials(safePlan, activityCards);

    const overlay =
      safePlan.teachingKit && typeof safePlan.teachingKit === "object" && !Array.isArray(safePlan.teachingKit)
        ? safePlan.teachingKit
        : null;

    const days = {};
    WEEKDAYS.forEach((day) => {
      days[day] = buildDayClassroom(safePlan, day, activityCards, vocabulary);
    });

    const ctx = {
      plan: safePlan,
      activityCards,
      vocabulary,
      books,
      songs,
      printables,
      weekMaterials,
      days,
      materialsModel,
      teacherToolkit: overlay && overlay.teacherToolkit && typeof overlay.teacherToolkit === "object"
        ? overlay.teacherToolkit
        : null,
    };

    const sections = sectionsRegistry.map((section) => {
      const content = sectionContent(section.id, ctx);
      const visible = sectionHasContent(section.id, content);
      let itemCount = 0;
      if (Array.isArray(content.activities)) itemCount = content.activities.length;
      else if (Array.isArray(content.books)) itemCount = content.books.length;
      else if (Array.isArray(content.songs)) itemCount = content.songs.length;
      else if (Array.isArray(content.words)) itemCount = content.words.length;
      else if (Array.isArray(content.materials)) itemCount = content.materials.length;
      else if (Array.isArray(content.printables)) itemCount = content.printables.length;
      else if (Array.isArray(content.activitiesWithPhotos)) itemCount = content.activitiesWithPhotos.length;
      else if (Array.isArray(content.prepChecklist) || section.id === "teacher_toolkit") {
        itemCount = [
          ...(content.prepChecklist || []),
          ...(content.observationFocus || []),
          ...(content.observationPrompts || []),
        ].length
          + (text(content.notes) ? 1 : 0)
          + (text(content.teacherPreparation) ? 1 : 0)
          + (text(content.familyConnection) ? 1 : 0);
      } else if (visible) {
        itemCount = 1;
      }
      return {
        id: section.id,
        label: section.label,
        printDefault: section.printDefault === true,
        visible,
        itemCount,
        content: visible || includeEmpty ? content : null,
      };
    }).filter((section) => includeEmpty || section.visible);

    const mondayMorningSetup = buildMondayMorningSetup(safePlan, activityCards, printables, {
      readyMaterials,
    });

    const today = days[selectedDay];
    const openEverything = buildOpenEverything(today, printables);
    const providerBinder = buildProviderBinder(sections, safePlan, overlay, {
      includeEmptyBinderTabs: includeEmpty,
      includeEmptySections: includeEmpty,
      ownerPreview: Boolean(options && options.ownerPreview),
    });

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
        materialsModel,
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
          cover: providerBinder.cover,
          tabs: providerBinder.tabs.length
            ? providerBinder.tabs.map((tab) => ({ id: tab.id, label: tab.label }))
            : BINDER_TABS.slice(),
          footerLabel: providerBinder.footerLabel,
          providerTabs: providerBinder.tabs,
          teacherToolkit: providerBinder.teacherToolkit,
        },
        providerBinder,
      },
      quality: {
        activityCount: activityCards.length,
        activitiesWithExamplePhoto: activityCards.filter((card) => card.hasExamplePhoto).length,
        activitiesWithSetupPhoto: activityCards.filter((card) => card.hasSetupPhoto).length,
        printableCount: printables.length,
        hasParentMessage: Boolean(text(safePlan.familyConnection)),
        hasVocabulary: vocabulary.length > 0,
        hasTeacherToolkit: Boolean(
          providerBinder.tabs.some((tab) => tab.id === "teacher_toolkit"),
        ),
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
