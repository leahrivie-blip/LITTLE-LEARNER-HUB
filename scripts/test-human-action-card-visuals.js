#!/usr/bin/env node
/**
 * Human-action teaching-card visual routing tests.
 * Blocks primitive SVG bubble people; allows realistic + illustrated VP paths
 * and hands/object SVG fallbacks.
 *
 * Run: node scripts/test-human-action-card-visuals.js
 * Does not generate pixels, mutate lessons, or touch production assets.
 */
"use strict";

const assert = require("node:assert/strict");
const human = require("./lib/pro-upgrade-visuals/human-action-card-visuals.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function main() {
  console.log("\nHuman-action card visuals tests\n");

  // --- Block primitive SVG human keys ---
  for (const key of human.PRIMITIVE_HUMAN_SVG_ICON_KEYS) {
    ok(human.isPrimitiveHumanSvgIconKey(key), `${key}: flagged as primitive human SVG`);
    let threw = false;
    try {
      human.assertNotPrimitiveHumanSvgIcon(key);
    } catch (err) {
      threw = true;
      ok(err && err.code === "primitive_human_svg_blocked", `${key}: throws primitive_human_svg_blocked`);
    }
    ok(threw, `${key}: assertNotPrimitiveHumanSvgIcon throws`);
  }
  human.assertNotPrimitiveHumanSvgIcon("cleanup");
  human.assertNotPrimitiveHumanSvgIcon("apple");
  ok(true, "object icon keys cleanup/apple are allowed");

  // --- Share a Turn ---
  const share = human.resolvePrintableCardVisual({
    title: "Share a Turn",
    ageBand: "toddler_12_24",
    activityCategory: "Social-Emotional",
    setSize: 6,
  });
  ok(share.mode === "hands_object", "Share a Turn: hands/object fallback (no bubble person)");
  ok(share.iconKey === null, "Share a Turn: does not pass primitive icon key");
  ok(Boolean(share.bodySvg) && share.bodySvg.length > 40, "Share a Turn: bodySvg present");
  ok(share.bodySvg.includes("share") || share.bodySvg.includes("toy"), "Share a Turn: object/hands SVG body");
  ok(
    share.visual.family === "TEACHING_CARD_REALISTIC" || share.visual.family === "TEACHING_CARD_ILLUSTRATED",
    "Share a Turn: human teaching-card family",
  );
  ok(/toy|hand|turn|offer|exchange/i.test(share.visual.sceneDescription), "Share a Turn: concrete scene");
  ok(/bubble|circle-head|geometric|clip art|Canva/i.test(share.visual.generationPrompt), "Share a Turn: prompt forbids bubble/vector people");

  // --- Cheer a Friend ---
  const cheer = human.resolvePrintableCardVisual({
    title: "Cheer a Friend",
    ageBand: "toddler_12_24",
    setSize: 6,
  });
  ok(cheer.mode === "hands_object", "Cheer a Friend: hands/object fallback");
  ok(cheer.iconKey === null, "Cheer a Friend: no primitive icon key");
  ok(/clap/i.test(cheer.bodySvg) || /clap/i.test(cheer.visual.sceneDescription), "Cheer a Friend: clap/hands concept");

  // --- Clean Up (object/hands path) ---
  const clean = human.resolvePrintableCardVisual({
    title: "Clean Up",
    ageBand: "toddler_12_24",
    setSize: 6,
  });
  ok(clean.mode === "hands_object", "Clean Up: hands/object SVG");
  ok(/basket|toy/i.test(clean.bodySvg), "Clean Up: basket/toy object art");
  ok(clean.visual.requiresHumanScene === true || clean.visual.allowsHandsObjectFallback === true, "Clean Up: planned as teaching/hands visual");

  // --- Apple object card (not human-action) ---
  const apple = human.resolvePrintableCardVisual({
    title: "Red Apple",
    iconKey: "apple",
    ageBand: "toddler_12_24",
  });
  ok(apple.mode === "object_ok", "Apple: object_ok path");
  ok(apple.iconKey === "apple", "Apple: passes through object icon key");
  ok(
    apple.visual.family === "OBJECT_CARD_REALISTIC" || apple.visual.family === "OBJECT_CARD_ILLUSTRATED",
    "Apple: object card family",
  );

  // --- Illustrated path ---
  const illustrated = human.buildTeachingCardIllustratedPrompt({
    title: "Share a Turn",
    ageBand: "toddler_12_24",
    setSize: 6,
  });
  ok(illustrated.family === "TEACHING_CARD_ILLUSTRATED", "illustrated: family TEACHING_CARD_ILLUSTRATED");
  ok(illustrated.preset === human.TEACHING_CARD_ILLUSTRATED_PRESET, "illustrated: teaching_card_illustrated preset");
  ok(illustrated.apiVisualStyle === "SOFT_EDUCATIONAL_ILLUSTRATION", "illustrated: maps to SOFT_EDUCATIONAL_ILLUSTRATION");
  ok(/picture-book|educational illustration|hand-drawn/i.test(illustrated.generationPrompt), "illustrated: quality illustration language");
  ok(/bubble|circle-head|geometric|clip art|Canva|stick figures/i.test(illustrated.generationPrompt), "illustrated: forbids bubble/vector people");
  ok(!/flat corporate vector people are required/i.test(illustrated.generationPrompt), "illustrated: does not require flat vectors");

  // --- Pack consistency ---
  const pack = human.planTeachingCardPackVisuals(
    [
      { title: "Help Carry", subtitle: "Carry a toy for a friend" },
      { title: "Share a Turn", subtitle: "Offer a turn with a toy" },
      { title: "Clean Up", subtitle: "Put one toy away" },
      { title: "Cheer a Friend", subtitle: "Clap for a friend" },
      { title: "Gentle Hands", subtitle: "Soft hands with friends" },
      { title: "Help Carry", subtitle: "Extra mission card" },
    ],
    { ageBand: "toddler_12_24", activityCategory: "Social-Emotional", setSize: 6 },
  );
  ok(
    pack.packStyle === "TEACHING_CARD_REALISTIC" || pack.packStyle === "TEACHING_CARD_ILLUSTRATED",
    "pack: human teaching-card pack style",
  );
  ok(pack.cards.length === 6, "pack: six cards");
  ok(
    pack.cards.every((c) => c.visual.family === pack.packStyle),
    "pack: every card locked to pack style (consistency)",
  );
  ok(
    pack.cards.every((c) => c.mode === "hands_object" || c.mode === "review_placeholder"),
    "pack: no object_ok with primitive human icons",
  );
  ok(
    pack.cards.every((c) => c.iconKey === null),
    "pack: never emits blocked SVG human icon keys",
  );

  // Diversity / scene distinctness across kindness set
  const scenes = pack.cards.map((c) => c.visual.sceneDescription);
  const uniqueScenes = new Set(scenes.map((s) => String(s).toLowerCase().slice(0, 80)));
  ok(uniqueScenes.size >= 4, "pack: diverse scenes across kindness cards (≥4 distinct)");

  // Movement pack inherits pack style
  const movePack = human.planTeachingCardPackVisuals(
    [
      { title: "Stretch Tall" },
      { title: "Jump Soft" },
      { title: "Tiptoe" },
      { title: "Freeze" },
      { title: "Fly Arms" },
      { title: "Stretch Tall" },
    ],
    { ageBand: "toddler_12_24", activityCategory: "Movement", packStyle: pack.packStyle },
  );
  ok(movePack.packStyle === pack.packStyle, "movement pack: inherits kindness pack style");
  ok(movePack.cards.every((c) => c.visual.family === pack.packStyle), "movement pack: style lock");
  ok(movePack.cards.every((c) => c.iconKey === null), "movement pack: no primitive human icon keys");

  // Forced illustrated pack
  const illPack = human.planTeachingCardPackVisuals(
    [{ title: "Share a Turn" }, { title: "Cheer a Friend" }],
    { preferStyle: "illustrated", ageBand: "preschool", setSize: 2 },
  );
  ok(illPack.packStyle === "TEACHING_CARD_ILLUSTRATED", "preferStyle illustrated → pack TEACHING_CARD_ILLUSTRATED");
  ok(illPack.cards.every((c) => c.visual.apiVisualStyle === "SOFT_EDUCATIONAL_ILLUSTRATION"), "illustrated pack API style");

  // Requesting blocked icon key must not pass through
  const blocked = human.resolvePrintableCardVisual({
    title: "Share a Turn",
    iconKey: "share",
    ageBand: "toddler_12_24",
  });
  ok(blocked.iconKey === null, "requested iconKey=share is blocked from pass-through");
  ok(blocked.mode !== "object_ok", "requested share icon does not use object_ok");

  console.log(`\n${passed} passed\n`);
}

try {
  main();
} catch (err) {
  console.error("\nFAILED:", err && err.message ? err.message : err);
  process.exit(1);
}
