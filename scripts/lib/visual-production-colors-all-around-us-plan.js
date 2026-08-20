/**
 * Colors All Around Us — planned Visual Production briefs only.
 * Does not generate, attach, assemble PDF, publish, or change Master Paste.
 *
 * Relink uses exact activity name + catalog activity ID. Never ordinal position.
 */
"use strict";

const LESSON_ID = "cur-lp-infant-colors-all-around-us";
const PACK_ID = "vpp-infant-colors-all-around-us";
const PACK_TITLE = "Colors All Around Us Infant Visual & Keepsake Pack";

const PAGE_TITLES = Object.freeze([
  "Cover",
  "Black, White + Bright Color Visual Cards",
  "Color Tummy-Time Cards",
  "Favorite Color Look Cards",
  "Rainbow Scarf Song + Teacher Prompt Card",
  "My Color Footprint Keepsake",
]);

const EXPECTED_ACTIVITY_NAMES = Object.freeze([
  "Rainbow Scarf Tracking",
  "Black, White and One Bright Color",
  "Color Song and Object",
  "Color Tummy-Time Gallery",
  "Mirror Colors",
  "Bright Ball Roll and Watch",
  "Color Fabric Fan",
  "Color Ring Reach",
  "Sealed Color Squish Art",
  "Rainbow Light Watch",
  "Ribbon Dance Watch",
  "Color Bottle Watch",
  "My Color Footprint Keepsake",
  "Favorite Color Look",
  "Our Color Baby Book",
]);

const TUMMY_TIME_LABELS = Object.freeze(["RED", "YELLOW", "BLUE", "GREEN"]);

const RAINBOW_SCARF_SONG_LINES = Object.freeze([
  "Rainbow Scarf Song",
  "Red, red, red so bright",
  "Wave it slowly left and right",
  "Up it goes and down again",
  "Watch it dance and watch it bend",
  "Teacher prompts:",
  "Do you see the scarf?",
  "Where did it go?",
  "You found it again.",
  "Are your eyes following it?",
]);

const SHARED_ACTIVITY_RULES = [
  "Activity image.",
  "Realistic real-life daycare photography.",
  "Zoomed in and focused on the actual activity.",
  "Believable classroom setup made from real physical materials.",
  "Naturally lit.",
  "Slightly imperfect like a real teacher set it up.",
  "Uncluttered.",
  "Developmentally appropriate for infants 0-6 months.",
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
  "Large simple elements.",
  "Lots of white space.",
  "Uncluttered layout.",
  "Infant-teacher-friendly and practical for classroom use.",
  "No decorative filler.",
  "No glossy 3D effects.",
  "No blob characters.",
  "No crowded clip art.",
  "Do not render any letters, numbers, titles, labels, logos, or website URLs.",
  "Leave the bottom area clear.",
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
    activityName: "Rainbow Scarf Tracking",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "An adult safely holds one bright scarf in front of a baby on a clean mat.",
      "Focus on the scarf and the baby visual field.",
      "No loose scarf near the face.",
      "Show the caregiver only because positioning and safe scarf control matter.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Black, White and One Bright Color",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "Two black-and-white visual cards and one bright red or yellow card at tummy-time eye level.",
      "Very simple.",
      "No clutter.",
      "No caregiver or infant needed unless a tiny supported tummy-time mat edge is required for scale.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Color Song and Object",
    originalInstruction: [
      "Realistic caregiver interaction photo.",
      "Caregiver presenting one large bright baby-safe ball while singing or talking.",
      "Keep focus on one object.",
      "Show the caregiver because the presentation interaction matters.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Color Tummy-Time Gallery",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "Infant tummy-time setup with 3 large simple color cards at eye level.",
      "Optional rolled blanket support.",
      "No busy background.",
      "Show the infant only if tummy-time positioning is needed to make the setup clear.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Mirror Colors",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "Infant-safe mirror with only a few securely attached simple colored shapes.",
      "Baby safely positioned for tummy time or supported floor play.",
      "Show the infant because safe positioning in front of the mirror matters.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Bright Ball Roll and Watch",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "One large soft colorful ball on a clean infant mat.",
      "Keep it simple and clearly safe.",
      "No extra toys.",
      "No caregiver or infant required.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Color Fabric Fan",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "Three large clean fabric squares in different colors and textures.",
      "Teacher presents one at a time.",
      "No tassels, buttons, beads, or loose parts.",
      "Show a teacher hand presenting one square because the one-at-a-time presentation matters.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Color Ring Reach",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "One large baby-safe grasping ring held within reaching distance.",
      "Focus on the reach and the ring.",
      "Show the ring and a safe infant reach if that makes the activity clear.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Sealed Color Squish Art",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "A clear heavy-duty bag with only 2 paint colors inside.",
      "The bag must visibly be sealed and taped flat.",
      "No loose paint accessible.",
      "This should clearly look safe.",
      "No caregiver or infant required.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Rainbow Light Watch",
    originalInstruction: [
      "Realistic wider classroom view.",
      "Soft indirect colored light on a nearby wall with a baby watching safely.",
      "No bright light aimed at the baby.",
      "Show the baby because safe watching position matters.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Ribbon Dance Watch",
    originalInstruction: [
      "Realistic caregiver interaction photo.",
      "Teacher controlling a securely attached ribbon wand or ring.",
      "Ribbons stay away from the infant face and neck.",
      "Show the teacher because safe ribbon control matters.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Color Bottle Watch",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "Teacher holding one lightweight sealed sensory bottle while a baby watches.",
      "Simple blue or colored movement inside the bottle.",
      "Show the teacher hand because safe bottle presentation matters.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "My Color Footprint Keepsake",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "White cardstock, a very small amount of washable paint, a sponge or applicator, wipes ready, and a caregiver supporting a baby foot.",
      "Clean, safe setup.",
      "Show the caregiver supporting the foot because safe positioning matters.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Favorite Color Look",
    originalInstruction: [
      "Realistic minimal close-up daycare photo.",
      "Two large plain color cards side-by-side in a baby visual field.",
      "Extremely simple.",
      "No extra toys or decorations.",
      "No caregiver required.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
  {
    activityName: "Our Color Baby Book",
    originalInstruction: [
      "Realistic close-up daycare photo.",
      "A teacher-made sturdy baby photo book with simple bold color backgrounds.",
      "Caregiver holds the book safely.",
      "Should look handmade but polished.",
      "Show the caregiver because safe book holding matters.",
      SHARED_ACTIVITY_RULES,
    ].join("\n"),
  },
]);

function printablePages() {
  return [
    {
      pageNumber: 1,
      pageTitle: PAGE_TITLES[0],
      assetType: "PRINTABLE_PAGE",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: ["Colors All Around Us", "Infant Visual & Keepsake Pack"],
      originalInstruction: [
        "Cover page for Colors All Around Us Infant Visual & Keepsake Pack.",
        "Clean modern cover.",
        "Simple large color shapes and circles.",
        "White or very light background.",
        "Leave a large empty band across the upper third for a title overlay.",
        "No cartoon baby.",
        "No people.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 2,
      pageTitle: PAGE_TITLES[1],
      assetType: "PRINTABLE_CARDS",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: [],
      originalInstruction: [
        "Six large high-contrast visual cards on one US Letter portrait page.",
        "Card 1: black-and-white stripes.",
        "Card 2: black-and-white circles.",
        "Card 3: black-and-white checker pattern.",
        "Card 4: bright red circle on a light card.",
        "Card 5: bright yellow circle on a light card.",
        "Card 6: bright blue circle on a light card.",
        "Large cards with plenty of space between them.",
        "No unnecessary text.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 3,
      pageTitle: PAGE_TITLES[2],
      assetType: "PRINTABLE_CARDS",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: TUMMY_TIME_LABELS.slice(),
      originalInstruction: [
        "Four large tummy-time visual cards in a 2 by 2 grid.",
        "Top left: large bold RED color field with one simple geometric shape.",
        "Top right: large bold YELLOW color field with one simple geometric shape.",
        "Bottom left: large bold BLUE color field with one simple geometric shape.",
        "Bottom right: large bold GREEN color field with one simple geometric shape.",
        "High contrast.",
        "Plenty of space.",
        "Leave a clear strip at the bottom of each card for a later color-name overlay.",
        "Do not draw any letters.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 4,
      pageTitle: PAGE_TITLES[3],
      assetType: "PRINTABLE_CARDS",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: [],
      originalInstruction: [
        "Four large removable cards in a 2 by 2 grid.",
        "Plain red card, plain yellow card, plain blue card, and plain green card.",
        "Keep them mostly plain.",
        "No text necessary.",
        "These are for infant visual preference observation.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 5,
      pageTitle: PAGE_TITLES[4],
      assetType: "PRINTABLE_PAGE",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: RAINBOW_SCARF_SONG_LINES.slice(),
      originalInstruction: [
        "Teacher resource page.",
        "Keep decorative artwork minimal.",
        "Small simple color accents only in the far corners or margins.",
        "Leave a large empty center panel for later song lyrics and teacher prompts.",
        "No people.",
        "No cartoon baby.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
    {
      pageNumber: 6,
      pageTitle: PAGE_TITLES[5],
      assetType: "HANDPRINT_FOOTPRINT_TEMPLATE",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: ["My Color Footprint", "Name: __________", "Date: __________"],
      originalInstruction: [
        "US Letter portrait keepsake page.",
        "Large blank center area for a real baby footprint.",
        "White background.",
        "Small simple color or rainbow accent only near the edges.",
        "Plenty of room in the center.",
        "No crowded border.",
        "No cartoon baby.",
        "Leave a clear band at the top for a title and Name / Date lines.",
        SHARED_PRINTABLE_RULES,
      ].join("\n"),
    },
  ];
}

/**
 * @param {{ activities?: object[] }} [options]
 */
function buildColorsAllAroundUsStructuredBriefs(options) {
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
    };
  });
  const pageBriefs = printablePages().map((page) => ({
    lessonId: LESSON_ID,
    activityName: `Page ${page.pageNumber} — ${page.pageTitle}`,
    allowPendingActivity: true,
    assetType: page.assetType,
    visualStyle: page.visualStyle,
    originalInstruction: page.originalInstruction,
    instruction: page.originalInstruction,
    printablePackId: PACK_ID,
    packTitle: PACK_TITLE,
    pageNumber: page.pageNumber,
    pageTitle: page.pageTitle,
    textOverlayRequirements: page.textOverlayRequirements,
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
  TUMMY_TIME_LABELS,
  RAINBOW_SCARF_SONG_LINES,
  matchExactUniqueActivity,
  buildColorsAllAroundUsStructuredBriefs,
};
