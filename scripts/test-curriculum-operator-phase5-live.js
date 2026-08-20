#!/usr/bin/env node
/**
 * Optional Phase 5 live song/book planner smoke (fixture lesson only).
 * SKIP unless OPENAI_API_KEY is set and LLH_OPERATOR_LIVE_SONGS_BOOKS=1.
 * Never touches production curriculum.
 */
"use strict";

const songsBooksApi = require("./curriculum-operator-songs-books.js");

async function main() {
  const enabled = ["1", "true", "yes"].includes(
    String(process.env.LLH_OPERATOR_LIVE_SONGS_BOOKS || "").trim().toLowerCase(),
  );
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!enabled || !key) {
    console.log("SKIP: set LLH_OPERATOR_LIVE_SONGS_BOOKS=1 and OPENAI_API_KEY to run the Phase 5 live fixture.");
    return;
  }

  const plan = {
    id: "cur-lp-p5-live-fixture",
    title: "Weather Watchers",
    age: "Toddler 18–24 Months",
    theme: "Weather",
    enrichmentDraft: { week: { songs: [], books: [] }, activities: {} },
  };
  const activities = [{
    id: "cur-act-p5-live",
    title: "Wind Is Moving",
    dayOfWeek: "monday",
  }];
  const audit = {
    songs: [
      { field: "song.monday", decision: "MISSING", reason: "No song linked." },
      { field: "song.tuesday", decision: "MISSING", reason: "No song linked." },
      { field: "song.wednesday", decision: "MISSING", reason: "No song linked." },
      { field: "song.thursday", decision: "MISSING", reason: "No song linked." },
      { field: "song.friday", decision: "MISSING", reason: "No song linked." },
    ],
    books: { decision: "FILL", reason: "No books listed." },
  };

  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: key });
  const callAi = async (systemPrompt, userPrompt) => {
    const response = await client.chat.completions.create({
      model: process.env.LLH_OPERATOR_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return response.choices?.[0]?.message?.content || "";
  };

  const planned = await songsBooksApi.planSongsAndBooks({
    plan,
    activities,
    audit,
    callAi,
  });
  if (!planned.ok) throw new Error(planned.error || "live planner failed");
  const songs = planned.enrichmentDraft?.week?.songs || [];
  const books = planned.enrichmentDraft?.week?.books || [];
  if (!songs.length) throw new Error("expected at least one original song");
  if (songs.some((s) => /disney|baby shark|frozen|elsa/i.test(`${s.title} ${s.lyrics}`))) {
    throw new Error("copyrighted lyric markers present");
  }
  if (!books.length) throw new Error("expected at least one book entry");
  for (const book of books) {
    const check = songsBooksApi.validateBookEntry(book);
    if (!check.ok) throw new Error(`book failed validation: ${check.errors.join(", ")}`);
  }
  const verified = songsBooksApi.verifySongBookJobDraft({
    beforePlan: plan,
    afterPlan: { ...plan, enrichmentDraft: planned.enrichmentDraft },
    songActions: planned.songActions,
    bookActions: planned.bookActions,
  });
  if (!verified.ok) throw new Error("post-save verification failed");
  console.log(`OK: Phase 5 live fixture · songs=${songs.length} · books=${books.length} · plannerCalls=${planned.usage.songPlannerCalls}`);
  console.log("Note: production curriculum is intentionally not modified.");
}

main().catch((error) => {
  console.error("Phase 5 live songs/books test FAILED:", error.message || error);
  process.exit(1);
});
