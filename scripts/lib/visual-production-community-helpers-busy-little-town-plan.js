/**
 * Community Helpers: Our Busy Little Town — planned Visual Production briefs only.
 * Does not generate, attach, assemble PDF, publish, or change Master Paste.
 *
 * Relink uses exact activity name + catalog activity ID. Never ordinal position.
 */
"use strict";

const overlay = require("../../server/visual-production-community-helpers-overlay.js");

const LESSON_ID = "cur-lp-7e21456dcc03e652";
const PACK_ID = "vpp-preschool-community-helpers-busy-little-town";
const PACK_TITLE = overlay.PACK_TITLE;
const PAGE_TITLES = overlay.PAGE_TITLES;

const EXPECTED_ACTIVITY_NAMES = Object.freeze([
  "Build Our Little Town",
  "Whose Tool Is It",
  "Community Helper Process Art",
  "Post Office Delivery Route",
  "Design Your Own Stamp Art",
  "Firefighter Rescue the Numbers",
  "Firefighter Watercolor Rescue Art",
  "Doctor Teddy Check-Up Clinic",
  "Bandage the Boo Boo Fine Motor Art",
  "Healthy Heartbeat Movement Lab",
  "Construction Blueprint Challenge",
  "Construction Vehicle Track Painting",
  "Fix the Road Playdough Crew",
  "Recycling Truck Sorting Station",
  "Little Community Café",
  "Who Should We Call",
  "When I Grow Up Collaborative Mural",
]);

/** @typedef {"NO_IMAGE_NEEDED"|"OPTIONAL"|"SETUP_IMAGE_ONLY"|"FINISHED_EXAMPLE_ONLY"|"SETUP_AND_FINISHED_EXAMPLE"} ImageClass */

/** @type {Record<string, { classification: ImageClass, field: string, generate: boolean }>} */
const ACTIVITY_IMAGE_PLAN = Object.freeze({
  "Build Our Little Town": { classification: "SETUP_IMAGE_ONLY", field: "setupImageUrl", generate: true },
  "Whose Tool Is It": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "Community Helper Process Art": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "Post Office Delivery Route": { classification: "SETUP_IMAGE_ONLY", field: "setupImageUrl", generate: true },
  "Design Your Own Stamp Art": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "Firefighter Rescue the Numbers": { classification: "SETUP_IMAGE_ONLY", field: "setupImageUrl", generate: true },
  "Firefighter Watercolor Rescue Art": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "Doctor Teddy Check-Up Clinic": { classification: "SETUP_IMAGE_ONLY", field: "setupImageUrl", generate: true },
  "Bandage the Boo Boo Fine Motor Art": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "Healthy Heartbeat Movement Lab": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "Construction Blueprint Challenge": { classification: "SETUP_IMAGE_ONLY", field: "setupImageUrl", generate: true },
  "Construction Vehicle Track Painting": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "Fix the Road Playdough Crew": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "Recycling Truck Sorting Station": { classification: "SETUP_IMAGE_ONLY", field: "setupImageUrl", generate: true },
  "Little Community Café": { classification: "SETUP_IMAGE_ONLY", field: "setupImageUrl", generate: true },
  "Who Should We Call": { classification: "NO_IMAGE_NEEDED", field: "", generate: false },
  "When I Grow Up Collaborative Mural": { classification: "FINISHED_EXAMPLE_ONLY", field: "exampleImageUrl", generate: true },
});

const SHARED_ACTIVITY_RULES = [
  "Activity image.",
  "Realistic real-life preschool daycare photography.",
  "Zoomed in and focused on the actual activity.",
  "Believable classroom setup made from real physical materials.",
  "Naturally lit.",
  "Slightly imperfect like a real teacher set it up in 5 to 10 minutes.",
  "Uncluttered.",
  "Developmentally appropriate for preschool 3-4 years.",
  "Clear enough that another childcare teacher can recreate it immediately.",
  "No glossy CGI.",
  "No fake 3D.",
  "No puffy cartoon art.",
  "No blob characters.",
  "No fake-looking people.",
  "No weird hands.",
  "No extra fingers.",
  "No uncanny faces.",
  "No floating objects.",
  "No fantasy lighting.",
  "No overly staged Pinterest scenes.",
  "No crowded classroom backgrounds.",
  "No random toys.",
  "No website text.",
  "No logo.",
  "No random text.",
  "Leave the bottom area clear.",
].join("\n");

const SHARED_PRINTABLE_RULES = [
  "Clean printable.",
  "Clean flat 2D illustration.",
  "White or very light background.",
  "Crisp print-friendly edges.",
  "Large simple preschool-friendly pictures.",
  "Lots of white space.",
  "Uncluttered layout.",
  "US Letter portrait.",
  "Teacher-use printable, not a worksheet packet.",
  "No decorative filler.",
  "No glossy 3D effects.",
  "No blob characters.",
  "No crowded clip art.",
  "Do not render any letters, numbers, titles, labels, logos, or website URLs.",
  "Leave a clear band at the top for a later title overlay.",
  "Leave a clear strip at the bottom of each card for a later label overlay.",
  "Leave the bottom edge of the page visually clear.",
].join("\n");

function oneLine(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function normalizeTitleKey(value) {
  return oneLine(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Exact unique title match only. Never matches by weekday slot or list position.
 * @param {string} activityName
 * @param {object[]} activities
 * @returns {{ activityId: string, error: string, activityName: string }}
 */
function matchExactUniqueActivity(activityName, activities) {
  const want = normalizeTitleKey(activityName);
  const name = oneLine(activityName);
  if (!want) return { activityId: "", error: "", activityName: name };
  const list = (Array.isArray(activities) ? activities : []).map((item) => ({
    id: oneLine(item && (item.id || item.activityId)),
    itemId: oneLine(item && item.itemId),
    title: oneLine(item && (item.title || item.activityName || item.name)),
  })).filter((item) => item.title);
  const exact = list.filter((item) => normalizeTitleKey(item.title) === want);
  if (exact.length > 1) {
    return { activityId: "", error: "ambiguous_activity_match", activityName: name };
  }
  if (exact.length === 1) {
    return {
      activityId: exact[0].id || exact[0].itemId,
      error: "",
      activityName: name,
    };
  }
  return { activityId: "", error: "", activityName: name };
}

const ACTIVITY_SPECS = Object.freeze([
  {
    activityName: "Build Our Little Town",
    originalInstruction: [
      "Realistic close-up preschool tabletop town setup.",
      "Show a simple teacher-made play map on a table.",
      "Painter-tape or printed roads, a few wooden or unit blocks as buildings, small helper vehicles, and simple community building cards.",
      "Include a fire station, clinic, post office, restaurant, and recycling area as small block buildings or cards.",
      "Keep it a close tabletop scene, not a giant floor town.",
      "No children or teacher needed.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Post Office Delivery Route",
    originalInstruction: [
      "Realistic close-up preschool pretend post office setup.",
      "Show a simple classroom mailbox or basket, a few envelopes, blank child name cards with writing lines, and a small mailbag.",
      "Optional simple sorting slots or cubby-like baskets.",
      "No real addresses, no private information, no real last names, no street numbers.",
      "No children or teacher needed.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Firefighter Rescue the Numbers",
    originalInstruction: [
      "Realistic close-up preschool number-rescue activity setup.",
      "Show a small cardboard building, number cards, counting objects, and a blue scarf or empty clean spray bottle used as a pretend hose.",
      "A child-safe firefighter hat may sit nearby.",
      "Calm and controlled.",
      "Do not show flames around children.",
      "Do not show a scary fire scene.",
      "Do not show emergency trauma imagery.",
      "No children or teacher needed.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Doctor Teddy Check-Up Clinic",
    originalInstruction: [
      "Realistic close-up preschool pretend clinic setup.",
      "Show a stuffed animal patient, a toy stethoscope, a clipboard, a bandage roll, and a simple doctor bag on a clean preschool table.",
      "Optional cotton balls and a pretend thermometer.",
      "Gentle and preschool-friendly.",
      "No fake blood.",
      "No scary medical imagery.",
      "No children or teacher needed.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Construction Blueprint Challenge",
    originalInstruction: [
      "Realistic close-up preschool construction center setup.",
      "Show wooden blocks, a child-safe hard hat, a toy measuring tape, one simple blueprint card, and a small construction vehicle on a clean building area.",
      "Keep it a small tabletop invitation, not a giant construction scene.",
      "No children or teacher needed.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Recycling Truck Sorting Station",
    originalInstruction: [
      "Realistic close-up preschool recycling sorting station.",
      "Show 3 or 4 simple bins or baskets, clean pretend recyclable items including paper, plastic, metal, and cardboard, and an optional small toy recycling truck.",
      "Printable sorting cards or mats may be visible if they look like simple classroom printables.",
      "Clean and preschool-safe.",
      "No dirty trash.",
      "No food waste.",
      "No sharp cans.",
      "No glass.",
      "No unsafe loose materials.",
      "No children or teacher needed.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Little Community Café",
    originalInstruction: [
      "Realistic close-up preschool dramatic-play café setup.",
      "Show a small preschool table or café counter, a few pretend plates and cups, realistic pretend food, a simple picture menu or order card, a small order pad or clipboard, one child-safe apron, and a small tray.",
      "It should look like a daycare teacher could set this up in 5 to 10 minutes.",
      "Do not show a giant restaurant room.",
      "Do not show a commercial-looking café.",
      "Do not show overly elaborate decorations.",
      "Do not cover the whole table in fake food.",
      "Do not show a text-heavy menu.",
      "No children or teacher needed.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "When I Grow Up Collaborative Mural",
    originalInstruction: [
      "Realistic preschool collaborative mural in progress or nearly complete.",
      "Show large butcher paper with child-drawn or child-painted community helper pictures.",
      "The artwork must look genuinely child-made, imperfect, with different drawing styles.",
      "Leave a handmade paper title strip across the top visually empty for a later heading overlay.",
      "Crayons or paint nearby.",
      "Realistic classroom wall or table.",
      "Do not make the child art look professionally illustrated.",
      "No photographed children's faces.",
      "No children or teacher needed unless a hand at the edge is required for scale.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
]);

function printablePages() {
  return [
    {
      pageNumber: 1,
      pageTitle: PAGE_TITLES[0],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Two very large preschool situation cards stacked on one US Letter portrait page.",
        "Top card: a calm simple scene of a child or stuffed animal not feeling well, with a caregiver nearby. No blood. Not scary.",
        "Bottom card: a calm pet checkup scene with a stuffed dog or cat and a gentle adult. Not injured-looking. Not scary.",
        "One obvious scene per card.",
        "Leave a blank label strip at the bottom of each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 2,
      pageTitle: PAGE_TITLES[1],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Two very large preschool situation cards stacked on one page.",
        "Top card: a calm distant wisp of smoke near a building, no flames around people, no trauma.",
        "Bottom card: a child handing a letter or envelope to a mailbox.",
        "Keep imagery calm and non-scary.",
        "Leave a blank label strip at the bottom of each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 3,
      pageTitle: PAGE_TITLES[2],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Two very large preschool situation cards stacked on one page.",
        "Top card: a simple leaking pipe with a small drip of water, no flood, no danger.",
        "Bottom card: a car with the hood gently open at a garage, calm and simple.",
        "Leave a blank label strip at the bottom of each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 4,
      pageTitle: PAGE_TITLES[3],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Two very large preschool situation cards stacked on one page.",
        "Top card: a cook in a small restaurant kitchen with a pan or bowl.",
        "Bottom card: clean recycling bins waiting to be collected, no dirty trash.",
        "Leave a blank label strip at the bottom of each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 5,
      pageTitle: PAGE_TITLES[4],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Four large community helper matching cards in a 2 by 2 grid.",
        "One helper per card: firefighter, doctor, veterinarian, mail carrier.",
        "Simple friendly preschool helper illustrations.",
        "No tools on these helper cards.",
        "Leave a blank name strip at the bottom of each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 6,
      pageTitle: PAGE_TITLES[5],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Five large community helper matching cards: three on the top row and two centered on the bottom row.",
        "One helper per card: construction worker, cook or chef, recycling worker, mechanic, plumber.",
        "No police officer.",
        "No tools on these helper cards.",
        "Leave a blank name strip at the bottom of each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 7,
      pageTitle: PAGE_TITLES[6],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Four large tool matching cards in a 2 by 2 grid.",
        "One tool per card: fire hose, stethoscope, pet carrier, mailbag.",
        "No people on the tool cards.",
        "Leave a blank name strip at the bottom of each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 8,
      pageTitle: PAGE_TITLES[7],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Five large tool matching cards: three on the top row and two centered on the bottom row.",
        "One tool per card: hard hat, spatula, recycling bin, wrench, pipe wrench.",
        "No people.",
        "Leave a blank name strip at the bottom of each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 9,
      pageTitle: PAGE_TITLES[8],
      assetType: "PRINTABLE_PAGE",
      originalInstruction: [
        "Simple preschool tabletop play map filling most of a US Letter page.",
        "Large simple roads, a few intersections, open placement spaces, grass and park accents.",
        "No tiny map details.",
        "No street names.",
        "No buildings drawn on the map; leave open spaces for separate building pieces.",
        "Leave a blank title band at the top.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 10,
      pageTitle: PAGE_TITLES[9],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Five large simple building-piece cards for a play map: three on the top row and two on the bottom.",
        "Front-facing simple buildings: fire station, doctor clinic, post office, restaurant cafe, veterinarian clinic.",
        "Leave a blank name strip at the bottom of each building.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 11,
      pageTitle: PAGE_TITLES[10],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Four large simple building-piece cards in a 2 by 2 grid.",
        "Front-facing buildings: construction site, recycling center, school, mechanic garage.",
        "Leave a blank name strip at the bottom of each building.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 12,
      pageTitle: PAGE_TITLES[11],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Five large pretend-play badges: three on the top row and two on the bottom.",
        "One helper icon per badge: firefighter, doctor, veterinarian, mail carrier, builder.",
        "Simple badge or lanyard-card shape.",
        "Leave the helper name area blank for later overlay.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 13,
      pageTitle: PAGE_TITLES[12],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Four large pretend-play badges in a 2 by 2 grid.",
        "One helper icon per badge: cook or chef, recycling helper, mechanic, plumber.",
        "Leave the helper name area blank for later overlay.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 14,
      pageTitle: PAGE_TITLES[13],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Six large classroom mail cards: four blank name cards and two mailbox signs.",
        "Name cards have a simple envelope or postcard shape and a blank writing line area.",
        "Do not invent child names.",
        "Mailbox signs show a simple mailbox illustration with a blank label strip.",
        "Leave label strips blank.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 15,
      pageTitle: PAGE_TITLES[14],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Six large mail cards: four simple envelope fronts with a blank To line area, plus two sorting cards showing cubbies and a mailbag.",
        "No fake child names.",
        "No real addresses.",
        "Leave label strips blank.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 16,
      pageTitle: PAGE_TITLES[15],
      assetType: "PRINTABLE_PAGE",
      originalInstruction: [
        "Preschool picture menu page with six large food and drink illustrations in two rows of three.",
        "Foods: sandwich, apple, banana, pizza slice, milk, water.",
        "Large simple pictures, lots of breathing room.",
        "Leave the title band and a label strip under each food blank.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 17,
      pageTitle: PAGE_TITLES[16],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Two large preschool cafe order cards stacked on the page.",
        "Each card has a blank heading band at the top and six small food pictures in two rows of three matching sandwich, apple, banana, pizza slice, milk, and water.",
        "Include empty circles or boxes beside each food so a child can point, circle, or mark a choice.",
        "Leave all words blank for later overlay.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 18,
      pageTitle: PAGE_TITLES[17],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Four large recycling category mats in a 2 by 2 grid.",
        "Paper, plastic, metal, and cardboard.",
        "Each mat has one large obvious icon and a blank category label strip.",
        "Clean items only. No trash. No glass. No sharp metal.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 19,
      pageTitle: PAGE_TITLES[18],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Seven large recycling picture cards: four on the top row and three centered on the bottom row.",
        "newspaper, paper sheet, water bottle, plastic container, clean can, small box, cereal-style box.",
        "Clean preschool-safe examples only.",
        "No broken glass, no sharp metal, no dirty trash, no confusing composite materials.",
        "Leave a blank label strip on each card.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 20,
      pageTitle: PAGE_TITLES[19],
      assetType: "PRINTABLE_PAGE",
      originalInstruction: [
        "Open-ended keepsake portrait page.",
        "Very large blank center area for child art, drawing, collage, or a photo.",
        "Minimal tiny helper icons only at the far edges if any.",
        "Do not crowd the page.",
        "Leave a wide blank title band at the top and a wide blank writing panel at the bottom.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 21,
      pageTitle: PAGE_TITLES[20],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Five large building-front cards for block play: three on the top row and two on the bottom.",
        "Simple front-facing designs large enough to prop against blocks: fire station, post office, vet clinic, doctor clinic, restaurant cafe.",
        "Leave a blank name strip at the bottom of each building.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 22,
      pageTitle: PAGE_TITLES[21],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Four large building-front cards in a 2 by 2 grid.",
        "Construction company, recycling center, mechanic garage, school.",
        "Leave a blank name strip at the bottom of each building.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 23,
      pageTitle: PAGE_TITLES[22],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Three large teacher conversation cards stacked on the page.",
        "Each card pairs one simple community-helper scene with a blank prompt strip.",
        "Card 1: helpers arriving to help.",
        "Card 2: tools on a table.",
        "Card 3: community buildings.",
        "Not quiz-like. Calm and open-ended.",
        "Leave prompt strips blank.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 24,
      pageTitle: PAGE_TITLES[23],
      assetType: "PRINTABLE_CARDS",
      originalInstruction: [
        "Two large teacher conversation cards stacked on the page.",
        "Card 1: helpers doing jobs around town.",
        "Card 2: two helpers working together, such as a firefighter and a doctor standing side by side.",
        "Leave prompt strips blank.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
  ];
}

/**
 * @param {{ activities?: object[] }} [options]
 */
function buildCommunityHelpersBusyLittleTownStructuredBriefs(options) {
  const activities = Array.isArray(options?.activities) ? options.activities : [];
  /** @type {{ activityId: string, error: string, activityName: string }[]} */
  const ambiguousMatches = [];
  const activityBriefs = ACTIVITY_SPECS.map((spec) => {
    const hit = matchExactUniqueActivity(spec.activityName, activities);
    if (hit.error === "ambiguous_activity_match") ambiguousMatches.push(hit);
    return {
      lessonId: LESSON_ID,
      activityName: spec.activityName,
      activityId: hit.activityId,
      allowPendingActivity: true,
      assetType: "ACTIVITY_IMAGE",
      visualStyle: "REALISTIC_CLASSROOM",
      originalInstruction: spec.originalInstruction,
      instruction: spec.originalInstruction,
      attachmentField: ACTIVITY_IMAGE_PLAN[spec.activityName].field,
    };
  });
  const pageBriefs = printablePages().map((page) => ({
    lessonId: LESSON_ID,
    activityName: `Page ${page.pageNumber} — ${page.pageTitle}`,
    allowPendingActivity: true,
    assetType: page.assetType,
    visualStyle: "CLEAN_PRINTABLE",
    originalInstruction: page.originalInstruction,
    instruction: page.originalInstruction,
    printablePackId: PACK_ID,
    packTitle: PACK_TITLE,
    pageNumber: page.pageNumber,
    pageTitle: page.pageTitle,
    textOverlayRequirements: overlay.exactLinesForPageTitle(page.pageTitle),
  }));
  return {
    lessonId: LESSON_ID,
    printablePackId: PACK_ID,
    packTitle: PACK_TITLE,
    structuredBriefs: activityBriefs.concat(pageBriefs),
    ambiguousMatches,
  };
}

module.exports = {
  LESSON_ID,
  PACK_ID,
  PACK_TITLE,
  PAGE_TITLES,
  EXPECTED_ACTIVITY_NAMES,
  ACTIVITY_IMAGE_PLAN,
  ACTIVITY_SPECS,
  matchExactUniqueActivity,
  buildCommunityHelpersBusyLittleTownStructuredBriefs,
};
