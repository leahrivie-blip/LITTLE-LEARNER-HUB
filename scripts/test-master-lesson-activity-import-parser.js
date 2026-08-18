#!/usr/bin/env node
/**
 * Regression coverage for Create New Lesson Plan master-import structured activities.
 * Run: npm run test:master-lesson-activity-parser
 */
const assert = require("node:assert/strict");
const {
  parseFullLessonStructurePaste,
  buildStructurePreview,
} = require("./curriculum-lesson-structure-paste.js");

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function listLines(body) {
  return String(body || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function formatActivityPreview(parsed) {
  const preview = buildStructurePreview(parsed);
  const lines = ["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => {
    const label = day.charAt(0).toUpperCase() + day.slice(1);
    const names = Array.isArray(preview.byDay?.[day]) ? preview.byDay[day] : [];
    const header = `${label} — ${names.length}`;
    return [header, ...names.map((name) => `- ${name}`)].join("\n");
  });
  lines.push(`TOTAL ACTIVITIES: ${preview.activityCount}`);
  return lines.join("\n");
}

function giantFloorDrawingPaste(weekdayHeading) {
  return `Lesson title
Giant Floor Drawing Parser Check

Age band
Toddler 12–24 Months

Materials
Top paper
Top tape
Top crayons

Observation focus
Watch whole-arm movement during the week.

Activity name
Giant Floor Drawing
${weekdayHeading}
Monday
Category/domain
Creative Arts
Age
Toddler 12–24 Months
Duration
8–12 minutes
Objective
Encourage whole-arm movement and early mark making.
What children will do
Scribble on a large paper on the floor.
Materials
Large paper
Chunky washable crayons
Painter's tape
Steps
Invite the child to the paper.
Offer chunky crayons.
Allow free scribbling.
Questions
What marks did you make?
Observation focus
Look for whole-arm movement.
Image request
Setup + finished example
Example images
None yet
`;
}

function assertGiantFloorDrawing(parsed, label) {
  assert.equal(parsed.ok, true, `${label}: ${parsed.errors.join("; ")}`);
  assert.equal(parsed.activityCount, 1, `${label}: activityCount ${JSON.stringify(parsed.unrecognized)}`);
  assert.equal(parsed.dailyPlans.monday.items.length, 1, label);
  const item = parsed.dailyPlans.monday.items[0];
  assert.equal(item.title, "Giant Floor Drawing", label);
  assert.match(item.activityCategory || "", /Creative Arts/, label);
  assert.match(item.ageModifications || "", /Toddler 12–24 Months/, label);
  assert.equal(item.durationMinutes, "8–12 minutes", label);
  assert.match(item.objective || "", /whole-arm movement/, label);
  const materials = listLines(item.materials);
  assert.equal(materials.length, 3, `${label} materials ${item.materials}`);
  assert.deepEqual(materials, ["Large paper", "Chunky washable crayons", "Painter's tape"]);
  const steps = listLines(item.steps);
  assert.equal(steps.length, 3, `${label} steps ${item.steps}`);
  assert.match(item.teacherLanguage || "", /What marks did you make/, label);
  assert.match(item.observationOpportunities || "", /whole-arm movement/, label);
  assert.equal(listLines(parsed.lesson.weeklyMaterials).length, 3, `${label} weekly materials bleed`);
  assert.deepEqual(listLines(parsed.lesson.weeklyMaterials), ["Top paper", "Top tape", "Top crayons"]);
  assert.equal(parsed.lesson.observationFocus.length, 1, `${label} weekly observation bleed`);
  assert.match(parsed.lesson.observationFocus[0], /Watch whole-arm movement during the week/);
  const preview = formatActivityPreview(parsed);
  assert.match(preview, /Monday — 1/);
  assert.match(preview, /- Giant Floor Drawing/);
  assert.match(preview, /Tuesday — 0/);
  assert.match(preview, /Wednesday — 0/);
  assert.match(preview, /Thursday — 0/);
  assert.match(preview, /Friday — 0/);
  assert.match(preview, /TOTAL ACTIVITIES: 1/);
  assert.equal(
    parsed.unrecognized.some((row) => /Activity weekday was missing/i.test(row.body || "")),
    false,
    `${label} weekday lost: ${JSON.stringify(parsed.unrecognized)}`,
  );
}

function activityBlock(name, weekday, weekdayHeading) {
  return [
    "Activity name",
    name,
    weekdayHeading,
    weekday,
    "Category/domain",
    "Creative Arts",
    "Age",
    "Toddler 12–24 Months",
    "Duration",
    "8–12 minutes",
    "Objective",
    `Encourage exploration in ${name}.`,
    "What children will do",
    `Children will try ${name}.`,
    "Materials",
    `${name} paper`,
    `${name} crayons`,
    "Teacher prep",
    `Set out ${name} materials.`,
    "Setup",
    `Place ${name} on the floor.`,
    "Steps",
    `Invite the child to ${name}.`,
    `Offer materials for ${name}.`,
    "Questions",
    `What do you notice in ${name}?`,
    "Observation focus",
    `Watch ${name} closely.`,
    "Safety",
    `Keep ${name} materials large and supervised.`,
    "Cleanup",
    `Return ${name} materials to the tray.`,
    "Tips",
    `Keep ${name} brief.`,
    "Support adaptations",
    `Offer hand-over-hand help during ${name}.`,
    "Added challenge",
    `Invite a second round of ${name}.`,
    "Mixed-age adaptations",
    `Older children can narrate ${name}.`,
    "Observation prompts",
    `Did the child stay with ${name}?`,
    "Vocabulary",
    "draw",
    "scribble",
    "Image request",
    "Setup + finished example",
    "Example images",
    "None yet",
  ].join("\n");
}

function fifteenActivityFixture() {
  const namesByDay = {
    Monday: ["Monday Mark Making", "Monday Tape Paths", "Monday Color Sweep"],
    Tuesday: ["Tuesday Dot Dance", "Tuesday Line Walk", "Tuesday Shape Stamp"],
    Wednesday: ["Wednesday Swirl Draw", "Wednesday Soft Sponge", "Wednesday Chalk Wall"],
    Thursday: ["Thursday Big Circles", "Thursday Tape Resist", "Thursday Color Mix"],
    Friday: ["Friday Gallery Walk", "Friday Name Marks", "Friday Quiet Scribble"],
  };
  const blocks = [];
  WEEKDAYS.forEach((day) => {
    namesByDay[day].forEach((name, index) => {
      blocks.push(activityBlock(name, day, index === 0 ? "Weekday" : "Activity weekday"));
    });
  });
  return {
    namesByDay,
    paste: `Lesson title
Structured Activity Parser 15

Age band
Toddler 12–24 Months

Materials
Weekly paper
Weekly tape
Weekly crayons

Observation focus
Weekly observation sentence only.

Books
Mix It Up by Herve Tullet
Beautiful Oops by Barney Saltzberg

Book prompts
Point to colors on the page.
Ask what happens next.

${blocks.join("\n\n")}
`,
  };
}

const LIVE_THREE_ACTIVITY_PREVIEW_PASTE = `Lesson title
Little Makers Workshop PREVIEW TEST

Age band
Toddler 12–24 Months

Weekly overview
A short test lesson for checking the master importer.

Learning objectives
Explore art materials through simple toddler-safe creative play.
Practice pressing, scribbling, rolling, and making choices.

Materials list
Large paper
Chunky washable crayons
Washable paint
Large toy car

Teacher preparation/Toolkit
Prepare materials before inviting children to the activity area.

Prep checklist
Tape paper securely.
Set out only the materials needed.

Observation focus
Notice how children grasp, press, roll, repeat actions, and make simple choices.

Family connection
Share one simple piece of process art.

Activity name
Giant Floor Drawing
Activity weekday
Monday
Category/domain
Creative Arts
Age
Toddler 12–24 Months
Duration
8–12 minutes
Objective
Encourage early mark making.
What children will do
Children make large scribbles on paper.
Materials
Large paper
Chunky washable crayons
Painter's tape
Observation focus
Notice grasp and arm movement.
Image request
Close-up of toddler hands using chunky crayons.

Activity name
Toy Car Paint Tracks
Activity weekday
Tuesday
Category/domain
Creative Arts
Age
Toddler 12–24 Months
Duration
10–12 minutes
Objective
Explore rolling movement.
Materials
Large toy car
Paint
Large paper
Observation focus
Notice pushing and visual tracking.

Activity name
Sticky Wall Collage
Activity weekday
Wednesday
Category/domain
Creative Arts
Age
Toddler 12–24 Months
Duration
10–15 minutes
Objective
Practice placing and pressing.
Materials
Contact paper
Large paper shapes
Observation focus
Notice finger use and release.
`;

function runStructuredActivityParserRegressionTests() {
  const liveParsed = parseFullLessonStructurePaste(LIVE_THREE_ACTIVITY_PREVIEW_PASTE);
  assert.equal(liveParsed.ok, true, liveParsed.errors.join("; "));
  assert.equal(liveParsed.activityCount, 3, JSON.stringify(liveParsed.unrecognized));
  assert.equal(
    liveParsed.unrecognized.some((row) => /Activity weekday was missing/i.test(row.body || "")),
    false,
    JSON.stringify(liveParsed.unrecognized),
  );
  assert.deepEqual(liveParsed.dailyPlans.monday.items.map((item) => item.title), ["Giant Floor Drawing"]);
  assert.deepEqual(liveParsed.dailyPlans.tuesday.items.map((item) => item.title), ["Toy Car Paint Tracks"]);
  assert.deepEqual(liveParsed.dailyPlans.wednesday.items.map((item) => item.title), ["Sticky Wall Collage"]);
  assert.equal(liveParsed.dailyPlans.thursday.items.length, 0);
  assert.equal(liveParsed.dailyPlans.friday.items.length, 0);
  const livePreview = formatActivityPreview(liveParsed);
  assert.match(livePreview, /Monday — 1/);
  assert.match(livePreview, /- Giant Floor Drawing/);
  assert.match(livePreview, /Tuesday — 1/);
  assert.match(livePreview, /- Toy Car Paint Tracks/);
  assert.match(livePreview, /Wednesday — 1/);
  assert.match(livePreview, /- Sticky Wall Collage/);
  assert.match(livePreview, /Thursday — 0/);
  assert.match(livePreview, /Friday — 0/);
  assert.match(livePreview, /TOTAL ACTIVITIES: 3/);
  assert.deepEqual(listLines(liveParsed.lesson.weeklyMaterials), [
    "Large paper",
    "Chunky washable crayons",
    "Washable paint",
    "Large toy car",
  ]);
  const liveStructurePreview = buildStructurePreview(liveParsed);
  assert.equal(liveStructurePreview.recognized.weeklyMaterials, 4);
  assert.equal(liveStructurePreview.recognized.observationFocus, 1);
  assert.deepEqual(liveParsed.lesson.observationFocus, [
    "Notice how children grasp, press, roll, repeat actions, and make simple choices.",
  ]);
  assert.match(liveParsed.dailyPlans.monday.items[0].observationOpportunities || "", /Notice grasp and arm movement/);
  assert.match(liveParsed.dailyPlans.tuesday.items[0].observationOpportunities || "", /Notice pushing and visual tracking/);
  assert.match(liveParsed.dailyPlans.wednesday.items[0].observationOpportunities || "", /Notice finger use and release/);
  assert.deepEqual(listLines(liveParsed.dailyPlans.monday.items[0].materials), [
    "Large paper",
    "Chunky washable crayons",
    "Painter's tape",
  ]);
  console.log("PASS  0  live 3-activity Create New Lesson Plan preview fixture");
  console.log(livePreview);

  const weekdayParsed = parseFullLessonStructurePaste(giantFloorDrawingPaste("Weekday"));
  assertGiantFloorDrawing(weekdayParsed, "Weekday heading");
  console.log("PASS  1  Activity name + Weekday Monday parses one Monday activity");

  const activityWeekdayParsed = parseFullLessonStructurePaste(giantFloorDrawingPaste("Activity weekday"));
  assertGiantFloorDrawing(activityWeekdayParsed, "Activity weekday heading");
  console.log("PASS  2  Activity name + Activity weekday Monday parses one Monday activity");

  const fixture = fifteenActivityFixture();
  const parsed15 = parseFullLessonStructurePaste(fixture.paste);
  assert.equal(parsed15.ok, true, parsed15.errors.join("; "));
  assert.equal(parsed15.activityCount, 15, JSON.stringify(parsed15.unrecognized));
  WEEKDAYS.forEach((label) => {
    const day = label.toLowerCase();
    const titles = (parsed15.dailyPlans[day].items || []).map((item) => item.title);
    assert.deepEqual(titles, fixture.namesByDay[label], `${label} titles`);
    assert.equal(titles.length, 3, `${label} count`);
  });
  const preview15 = formatActivityPreview(parsed15);
  WEEKDAYS.forEach((label) => {
    assert.match(preview15, new RegExp(`${label} — 3`));
    fixture.namesByDay[label].forEach((name) => {
      assert.match(preview15, new RegExp(`- ${name}`));
    });
  });
  assert.match(preview15, /TOTAL ACTIVITIES: 15/);
  globalThis.__llhMasterActivityPreview15 = preview15;
  console.log("PASS  3  15 activities group 3 per weekday");
  console.log(preview15);

  assert.equal(listLines(parsed15.lesson.weeklyMaterials).length, 3, parsed15.lesson.weeklyMaterials);
  assert.deepEqual(listLines(parsed15.lesson.weeklyMaterials), [
    "Weekly paper",
    "Weekly tape",
    "Weekly crayons",
  ]);
  WEEKDAYS.forEach((label) => {
    parsed15.dailyPlans[label.toLowerCase()].items.forEach((item) => {
      assert.equal(listLines(item.materials).includes("Weekly paper"), false, item.title);
    });
  });
  console.log("PASS  4  Activity Materials do not leak into weekly Materials");

  assert.equal(parsed15.lesson.observationFocus.length, 1, parsed15.lesson.observationFocus);
  assert.equal(parsed15.lesson.observationFocus[0], "Weekly observation sentence only.");
  parsed15.dailyPlans.monday.items.forEach((item) => {
    assert.match(item.observationOpportunities || "", /Watch .+ closely/);
    assert.doesNotMatch(item.observationOpportunities || "", /Weekly observation sentence only/);
  });
  console.log("PASS  5  Activity Observation focus does not leak into weekly Observation focus");

  const mondayFirst = parsed15.dailyPlans.monday.items[0];
  assert.equal(mondayFirst.title, "Monday Mark Making");
  assert.deepEqual(listLines(mondayFirst.materials), ["Monday Mark Making paper", "Monday Mark Making crayons"]);
  assert.match(mondayFirst.steps, /Invite the child to Monday Mark Making/);
  assert.match(mondayFirst.teacherLanguage || "", /What do you notice in Monday Mark Making/);
  assert.match(mondayFirst.observationOpportunities || "", /Watch Monday Mark Making closely/);
  assert.equal(mondayFirst.imageRequirement, "required");
  const fridayLast = parsed15.dailyPlans.friday.items[2];
  assert.equal(fridayLast.title, "Friday Quiet Scribble");
  assert.deepEqual(listLines(fridayLast.materials), ["Friday Quiet Scribble paper", "Friday Quiet Scribble crayons"]);
  assert.match(fridayLast.steps, /Offer materials for Friday Quiet Scribble/);
  assert.ok(!fridayLast.exampleImageUpload, "placeholder example images must not request upload");
  console.log("PASS  6  Activity fields remain attached to the correct activity");

  assert.equal(parsed15.books.length, 2, parsed15.books);
  assert.equal(parsed15.books[0].title, "Mix It Up by Herve Tullet");
  assert.equal(parsed15.books[1].title, "Beautiful Oops by Barney Saltzberg");
  parsed15.books.forEach((book) => {
    assert.doesNotMatch(book.title, /Book prompts|Point to colors|Ask what happens next/i);
  });
  assert.ok(
    parsed15.unrecognized.some((row) => /book prompts/i.test(row.heading || "")),
    `Book prompts should be reported as unsupported: ${JSON.stringify(parsed15.unrecognized)}`,
  );
  console.log("PASS  7  Book prompt lines are not counted as book titles");

  const legacy = parseFullLessonStructurePaste(`Lesson title:
Baby Moves & Discovers

Age band:
Infant 0–6 Months

Weekly overview:
Babies will explore movement.

Learning objectives:
Support visual attention and tracking
Encourage reaching and grasping

Materials list:
Tummy-time mats
Baby-safe mirrors

Milestones:
Gross motor
Language

Monday:
Color Scarf Tracking
Hello, Baby! Mirror Play

Tuesday:
Shake, Listen & Find
`);
  assert.equal(legacy.ok, true, legacy.errors.join("; "));
  assert.equal(legacy.lesson.title, "Baby Moves & Discovers");
  assert.equal(legacy.dailyPlans.monday.items.length, 2);
  assert.equal(legacy.dailyPlans.monday.items[0].title, "Color Scarf Tracking");
  assert.equal(legacy.dailyPlans.tuesday.items[0].title, "Shake, Listen & Find");
  assert.equal(legacy.activityCount, 3);
  console.log("PASS  8  Existing weekday name-list imports continue to work");

  const countGuard = parseFullLessonStructurePaste(`Lesson title
Count Guard

Age band
Toddler 12–24 Months

Materials
Giant Floor Drawing paper
Not An Activity Line

Observation focus
One weekly sentence.

Activity name
Real Placed Activity
Activity weekday
Wednesday
Category/domain
Creative Arts
Materials
Activity only paper
Activity only crayons
`);
  assert.equal(countGuard.activityCount, 1, JSON.stringify(countGuard.unrecognized));
  assert.equal(countGuard.dailyPlans.wednesday.items[0].title, "Real Placed Activity");
  assert.equal(countGuard.dailyPlans.monday.items.length, 0);
  assert.equal(listLines(countGuard.lesson.weeklyMaterials).length, 2);
  assert.ok(!countGuard.activities.some((row) => row.title === "Giant Floor Drawing paper"));
  assert.ok(!countGuard.activities.some((row) => row.title === "Not An Activity Line"));
  console.log("PASS  9  Activity count comes only from explicit Activity name blocks");
}

if (require.main === module) {
  runStructuredActivityParserRegressionTests();
  console.log("\nAll master-lesson activity parser regression tests passed.");
}

module.exports = {
  runStructuredActivityParserRegressionTests,
  formatActivityPreview,
  giantFloorDrawingPaste,
  fifteenActivityFixture,
};
