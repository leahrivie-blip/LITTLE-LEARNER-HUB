/**
 * Regression fixture: Colors All Around Us — Infant 0–6 Months Master Paste.
 * Mirrors the owner Master Copy structure that Replace From Master Paste rejected
 * (combined title—age line, Monday — theme headings, Unicode ⸻ separators,
 * Category/domain values, Teacher preparation / Toolkit, Indoor/Outdoor options).
 * Unique per-activity field tokens prove boundaries. Does not publish.
 */
"use strict";

const SEP = "⸻";

const DAY_THEMES = Object.freeze({
  Monday: "Looking at Bright Colors",
  Tuesday: "One Color at a Time",
  Wednesday: "Reaching When Ready",
  Thursday: "Touch and Connection",
  Friday: "Favorite Colors Together",
});

const ACTIVITIES = Object.freeze([
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

function namesByDay() {
  const out = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
  ACTIVITIES.forEach((activity) => out[activity.day].push(activity.title));
  return out;
}

function colorsAllAroundUsMasterPaste() {
  const dayBlocks = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => {
    const acts = ACTIVITIES.filter((activity) => activity.day === day)
      .map((activity) => `${SEP}\n${activityBlock(activity)}`)
      .join("\n");
    return `${day} — ${DAY_THEMES[day]}\n${acts}`;
  }).join(`\n${SEP}\n`);

  const paste = `Colors All Around Us — Infant 0–6 Months

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
  return paste;
}

module.exports = {
  SEP,
  DAY_THEMES,
  ACTIVITIES,
  namesByDay,
  activityBlock,
  colorsAllAroundUsMasterPaste,
  COLORS_LESSON_ID: "cur-lp-infant-colors-all-around-us",
  COLORS_LESSON_TITLE: "Colors All Around Us",
  COLORS_AGE_BAND: "Infant 0–6 Months",
};
