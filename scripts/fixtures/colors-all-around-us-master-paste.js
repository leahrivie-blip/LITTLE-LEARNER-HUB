/**
 * Colors All Around Us — Infant 0–6 Months Master Paste fixtures.
 * Exact owner copy is the replace/create source. Combined title—age paste
 * keeps the earlier parser regression (title and age on one line + TOKEN_*
 * field boundaries). Does not publish.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SEP = "⸻";
const EXACT_PASTE_PATH = path.join(__dirname, "colors-all-around-us-exact-master-paste.txt");

const DAY_THEMES = Object.freeze({
  Monday: "Look at Color",
  Tuesday: "Tummy-Time Colors",
  Wednesday: "Touch and Color",
  Thursday: "Light, Movement and Color",
  Friday: "Color Keepsakes and Favorites",
});

const COMBINED_DAY_THEMES = Object.freeze({
  Monday: "Looking at Bright Colors",
  Tuesday: "One Color at a Time",
  Wednesday: "Reaching When Ready",
  Thursday: "Touch and Connection",
  Friday: "Favorite Colors Together",
});

const ACTIVITIES = Object.freeze([
  {
    day: "Monday",
    title: "Rainbow Scarf Tracking",
    category: "Cognitive / Visual Development",
    durationMinutes: 2,
    objective: "slow-moving colorful object",
    description: "bright scarf move slowly",
    setup: "Hold the scarf where baby can clearly see it",
    steps: "Gain baby’s attention with the still scarf",
  },
  {
    day: "Monday",
    title: "Black, White and One Bright Color",
    category: "Cognitive / Visual Development",
    durationMinutes: 3,
    objective: "strong contrast paired with one bright color",
    description: "black-and-white patterns alongside one bright",
    setup: "Place cards upright near the baby’s tummy-time area",
    steps: "Begin with one black-and-white card",
  },
  {
    day: "Monday",
    title: "Color Song and Object",
    category: "Language / Social-Emotional",
    durationMinutes: 3,
    objective: "Pair simple color words with caregiver voice",
    description: "sings or chants a short color phrase",
    setup: "place baby on a mat facing the caregiver",
    steps: "red ball, red ball, look at the red ball",
  },
  {
    day: "Tuesday",
    title: "Color Tummy-Time Gallery",
    category: "Physical / Visual Development",
    durationMinutes: 2,
    objective: "head lifting and visual attention during tummy time",
    description: "small gallery of bold colorful images",
    setup: "in front of the tummy-time space",
    steps: "Add a second card only if baby remains comfortable",
  },
  {
    day: "Tuesday",
    title: "Mirror Colors",
    category: "Social-Emotional / Visual Development",
    durationMinutes: 3,
    objective: "attention to faces and color through mirror exploration",
    description: "baby-safe mirror surrounded by a few large colored shapes",
    setup: "Position the mirror safely at baby’s eye level",
    steps: "Invite baby to notice their reflection",
  },
  {
    day: "Tuesday",
    title: "Bright Ball Roll and Watch",
    category: "Physical / Cognitive",
    durationMinutes: 3,
    objective: "visual tracking, head turning, and anticipation",
    description: "large soft colorful ball slowly roll",
    setup: "supported side-lying based on developmental needs",
    steps: "Slowly roll it a short distance",
  },
  {
    day: "Wednesday",
    title: "Color Fabric Fan",
    category: "Sensory / Language",
    durationMinutes: 3,
    objective: "color and texture through safe caregiver-guided fabric",
    description: "fabric pieces presented one at a time",
    setup: "Sit with baby or position baby comfortably on a clean mat",
    steps: "Show one fabric square",
  },
  {
    day: "Wednesday",
    title: "Color Ring Reach",
    category: "Fine Motor / Physical",
    durationMinutes: 3,
    objective: "reaching, swiping, and early grasping",
    description: "reach for one large colorful baby-safe ring",
    setup: "supported side-lying, tummy, or caregiver lap",
    steps: "Hold one ring where baby can clearly see it",
  },
  {
    day: "Wednesday",
    title: "Sealed Color Squish Art",
    category: "Art / Sensory",
    durationMinutes: 3,
    objective: "mess-free early art experience",
    description: "securely sealed paint bag",
    setup: "Secure the bag flat to the floor",
    steps: "Allow baby to press or kick the outside",
  },
  {
    day: "Thursday",
    title: "Rainbow Light Watch",
    category: "Sensory / Cognitive",
    durationMinutes: 2,
    objective: "gentle changes in colored light",
    description: "transparent color reflections",
    setup: "colored reflection can be viewed comfortably",
    steps: "Create one soft colored reflection",
  },
  {
    day: "Thursday",
    title: "Ribbon Dance Watch",
    category: "Music and Movement / Visual Development",
    durationMinutes: 3,
    objective: "Combine music, movement, and visual tracking",
    description: "securely attached colorful ribbons while singing",
    setup: "Position baby safely on a mat or caregiver lap",
    steps: "Begin with ribbons still",
  },
  {
    day: "Thursday",
    title: "Color Bottle Watch",
    category: "Sensory / Cognitive",
    durationMinutes: 3,
    objective: "focused watching and visual tracking of slow movement",
    description: "slowly tilt and move a securely sealed lightweight sensory bottle",
    setup: "Hold bottle within baby’s visual field",
    steps: "Show the still bottle",
  },
  {
    day: "Friday",
    title: "My Color Footprint Keepsake",
    category: "Art / Social-Emotional",
    durationMinutes: 5,
    objective: "teacher-led color keepsake",
    description: "teacher-supported footprint process",
    setup: "Work one-to-one with baby in a secure comfortable position",
    steps: "Apply a very thin layer of washable paint to the foot",
  },
  {
    day: "Friday",
    title: "Favorite Color Look",
    category: "Cognitive / Observation",
    durationMinutes: 3,
    objective: "without expecting babies to identify colors",
    description: "view two large color cards",
    setup: "Position cards side by side within baby’s comfortable visual field",
    steps: "Switch the cards’ positions",
  },
  {
    day: "Friday",
    title: "Our Color Baby Book",
    category: "Language / Social-Emotional",
    durationMinutes: 5,
    objective: "familiar baby photos",
    description: "familiar babies or classroom objects paired with one bold color",
    setup: "position the book where it can be viewed clearly",
    steps: "Show one page at a time",
  },
]);

const COMBINED_TITLE_AGE_ACTIVITIES = Object.freeze([
  { day: "Monday", title: "Rainbow Scarf Tracking", category: "Cognitive / Visual Development", token: "TOKEN_SCARF" },
  { day: "Monday", title: "Black, White and One Bright Color", category: "Language / Social-Emotional", token: "TOKEN_BW" },
  { day: "Monday", title: "Color Song and Object", category: "Physical / Visual Development", token: "TOKEN_SONG" },
  { day: "Tuesday", title: "One Bright Color Focus", category: "Social-Emotional / Visual Development", token: "TOKEN_ONE" },
  { day: "Tuesday", title: "Color Song Cuddle", category: "Physical / Cognitive", token: "TOKEN_CUDDLE" },
  { day: "Tuesday", title: "Short Color Book Look", category: "Sensory / Language", token: "TOKEN_BOOK" },
  { day: "Wednesday", title: "Reach for a Bright Toy", category: "Fine Motor / Physical", token: "TOKEN_REACH" },
  { day: "Wednesday", title: "Mirror and Color Look", category: "Art / Sensory", token: "TOKEN_MIRROR" },
  { day: "Wednesday", title: "Soft Color Touch", category: "Sensory / Cognitive", token: "TOKEN_TOUCH" },
  { day: "Thursday", title: "Color Texture Exploration", category: "Music and Movement / Visual Development", token: "TOKEN_TEX" },
  { day: "Thursday", title: "Color Hello with Caregiver", category: "Art / Social-Emotional", token: "TOKEN_HELLO" },
  { day: "Thursday", title: "Color Cloth Sway", category: "Cognitive / Observation", token: "TOKEN_SWAY" },
  { day: "Friday", title: "Rainbow Color Song Review", category: "Cognitive / Visual Development", token: "TOKEN_REVIEW" },
  { day: "Friday", title: "Favorite Color Page", category: "Language / Social-Emotional", token: "TOKEN_PAGE" },
  { day: "Friday", title: "Outdoor Color Stroll", category: "Physical / Visual Development", token: "TOKEN_STROLL" },
]);

function activityBlock(activity) {
  const { title, day, category, token } = activity;
  return [
    "Activity name",
    title,
    "Weekday",
    day,
    "Category/domain",
    category,
    "Age",
    "Infant 0–6 Months",
    "Duration",
    "3–5 minutes",
    "Objective",
    `${token} objective only`,
    "What children will do",
    `${token} will-do only`,
    "Materials",
    `${token} scarf`,
    `${token} mat`,
    "Teacher prep",
    `${token} prep only`,
    "Setup",
    `${token} setup only`,
    "Steps",
    `${token} step one`,
    `${token} step two`,
    "Questions",
    `${token} question only`,
    "Observation focus",
    `${token} obs only`,
    "Safety",
    `${token} safety only`,
    "Cleanup",
    `${token} cleanup only`,
    "Indoor/Outdoor options",
    `${token} indoor-outdoor only`,
    "Tips",
    `${token} tip only`,
    "Substitutions",
    `Use ${token} cloth`,
    "Support adaptations",
    `${token} support only`,
    "Added challenge",
    `${token} challenge only`,
    "Mixed-age",
    `${token} mixed only`,
    "Observation prompts",
    `${token} prompt only`,
    "Vocabulary",
    token,
    "Image request",
    "Setup + finished example",
    "Example images",
    "None yet",
  ].join("\n");
}

function namesByDayFrom(list) {
  const out = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
  list.forEach((activity) => out[activity.day].push(activity.title));
  return out;
}

function namesByDay() {
  return namesByDayFrom(ACTIVITIES);
}

function colorsAllAroundUsMasterPaste() {
  return fs.readFileSync(EXACT_PASTE_PATH, "utf8");
}

function colorsAllAroundUsCombinedTitleAgePaste() {
  const dayBlocks = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => {
    const acts = COMBINED_TITLE_AGE_ACTIVITIES.filter((activity) => activity.day === day)
      .map((activity) => `${SEP}\n${activityBlock(activity)}`)
      .join("\n");
    return `${day} — ${COMBINED_DAY_THEMES[day]}\n${acts}`;
  }).join(`\n${SEP}\n`);

  return `Colors All Around Us — Infant 0–6 Months

Weekly overview
This week focuses on looking, tracking, reaching, and warm caregiver talk with bright colors.

Learning objectives
Support visual attention and slow tracking with bright, simple materials
Offer supervised tummy-time looking with colorful anchors

Materials list
Large bright scarves
Soft colored cloth squares
Baby-safe mirror

Teacher preparation / Toolkit
Sanitize cloths and set a calm floor space.
Choose two or three bright colors for the day.

Prep checklist
Wash/sanitize scarves, cloths, rattles, mirror
Clear floor mat with soft lighting

Observation focus
Does baby fixate or track?
Any reaching when offered within range?

Family connection
Invite families to name one bright color during a diaper change or walk.

Milestones
Language
Social Emotional
Gross Motor
Fine Motor
Cognition
Creativity

${dayBlocks}
`;
}

module.exports = {
  SEP,
  DAY_THEMES,
  COMBINED_DAY_THEMES,
  ACTIVITIES,
  COMBINED_TITLE_AGE_ACTIVITIES,
  namesByDay,
  namesByDayFrom,
  activityBlock,
  colorsAllAroundUsMasterPaste,
  colorsAllAroundUsCombinedTitleAgePaste,
  COLORS_LESSON_ID: "cur-lp-infant-colors-all-around-us",
  COLORS_LESSON_TITLE: "Colors All Around Us",
  COLORS_AGE_BAND: "Infant 0–6 Months",
};
