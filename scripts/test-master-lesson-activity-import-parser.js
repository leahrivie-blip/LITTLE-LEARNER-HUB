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
const weekKit = require("./curriculum-week-kit-paste.js");
const colorsFixture = require("./fixtures/colors-all-around-us-master-paste.js");

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
  assert.equal(item.durationMinutes, 8, label);
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

const RAINBOW_COFFEE_FILTER_ART_ACTIVITY = `Activity name
Rainbow Coffee Filter Art
Weekday
Thursday
Category/domain
Art
Age
Preschool 3–4 Years
Duration
20 minutes
Objective
Children will explore color spreading and blending through process art.
What children will do
Children will add washable marker colors to a coffee filter and spray or drop small amounts of water to watch the colors spread.
Materials
White coffee filters
Washable markers
Droppers
Spray bottles
Water
Trays
Drying rack
Teacher prep
Place each filter on a tray.
Fill small spray bottles or droppers with water.
Setup
Arrange rainbow-colored markers but allow children to choose their own combinations.
Steps
Draw color marks on the dry filter.
Add a small amount of water.
Watch colors spread.
Add more water only if needed.
Observe colors touching and blending.
Leave filters flat to dry.
Questions
What happened when water touched the marker
Which colors moved
What new colors do you notice
What happens where two colors meet
Observation focus
Observe fine-motor control, prediction, and color mixing.
Safety
Use washable non-toxic markers.
Supervise water use.
Cleanup
Place filters on drying rack and wipe trays.
Indoor/Outdoor options
Use indoors or outdoors at an art table.
Tips
Avoid oversaturating filters.
Substitutions
Use liquid watercolor drops.
Support adaptations
Provide dot markers if drawing pressure is difficult.
Added challenge
Ask children to predict what will happen when two specific colors meet.
Mixed-age
Younger children can add random colors and water.
Older children can create intentional color sections.
Observation prompts
Did the child notice spreading
Did the child identify a color change
Did the child control water amount
Vocabulary
rainbow
color
blend
spread
water
Image request
example_only
`;

function rainbowCoffeeFilterArtFixture() {
  return {
    title: "Weather Watchers",
    activityTitle: "Rainbow Coffee Filter Art",
    paste: `Lesson title
Weather Watchers

Age band
Preschool 3–4 Years

Weekly overview
Children explore weather, color, and water through process art and outdoor noticing.

Learning objectives
Notice how water moves color.
Practice careful pouring and spraying.

Materials list
Coffee filters
Washable markers
Water

Teacher preparation/Toolkit
Set out trays and drying space before inviting children.

Prep checklist
Fill spray bottles.
Cover tables.

Observation focus
Watch how children control water and notice color changes.

Family connection
Ask families to notice rainbows or wet sidewalk colors.

Milestones
Fine motor
Creativity

Books
Little Cloud by Eric Carle

Songs
Rain, Rain, Go Away

Printable ideas
Weather color mixing cards

${RAINBOW_COFFEE_FILTER_ART_ACTIVITY}
`,
  };
}

function weatherWatchersTwentyActivityFixture() {
  const namesByDay = {
    Monday: ["Monday Cloud Watch", "Monday Wind Streamers", "Monday Puddle Splash", "Monday Weather Chart"],
    Tuesday: ["Tuesday Rain Sounds", "Tuesday Storm Drumming", "Tuesday Umbrella Walk", "Tuesday Fog Painting"],
    Wednesday: ["Wednesday Sun Prints", "Wednesday Shadow Play", "Wednesday Warm Wind Dance", "Wednesday Forecast Talk"],
    Thursday: ["Rainbow Coffee Filter Art", "Thursday Rain Gauge", "Thursday Cloud Dough", "Thursday Weather Sort"],
    Friday: ["Friday Rainbow Review", "Friday Weather Walk", "Friday Color Mix Share", "Friday Storm Stories"],
  };
  const blocks = [];
  WEEKDAYS.forEach((day) => {
    namesByDay[day].forEach((name, index) => {
      if (name === "Rainbow Coffee Filter Art") {
        blocks.push(RAINBOW_COFFEE_FILTER_ART_ACTIVITY.trim());
        return;
      }
      blocks.push(activityBlock(name, day, index === 0 ? "Weekday" : "Activity weekday"));
    });
  });
  const rainbow = rainbowCoffeeFilterArtFixture();
  return {
    title: "Weather Watchers",
    namesByDay,
    paste: rainbow.paste.replace(RAINBOW_COFFEE_FILTER_ART_ACTIVITY, `${blocks.join("\n\n")}\n`),
  };
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

  const namePaste = largeNameBlockMasterPaste();
  const expectedNameCount = weekKit.countExplicitActivityNameStarts(namePaste);
  assert.ok(expectedNameCount >= 8, `fixture must declare multiple Name blocks, got ${expectedNameCount}`);
  const nameParsed = parseFullLessonStructurePaste(namePaste);
  assert.equal(nameParsed.ok, true, nameParsed.errors.join("; "));
  assert.equal(nameParsed.activityCount, expectedNameCount, JSON.stringify({
    activityCount: nameParsed.activityCount,
    titles: flattenActivityTitles(nameParsed),
    unrecognized: nameParsed.unrecognized,
  }));
  assert.ok(nameParsed.activityCount < 30, "Name-block paste must not explode into dozens of fake activities");
  const fakeTitles = [
    "15 minutes", "Age", "Duration", "Materials", "Teacher prep", "Setup", "Steps",
    "Questions", "Observation focus", "Safety", "Cleanup", "Tips", "Substitutions",
    "Support adaptations", "Added challenge", "Mixed-age", "Observation prompts",
    "Vocabulary", "Image request", "Example images", "Check every vehicle for loose parts.",
  ];
  const titles = flattenActivityTitles(nameParsed);
  fakeTitles.forEach((title) => {
    assert.equal(titles.includes(title), false, `field/value became an activity: ${title}`);
  });
  const nameMondayFirst = nameParsed.dailyPlans.monday.items[0];
  assert.equal(nameMondayFirst.title, "Monday Wheel Painting");
  assert.ok(
    String(nameMondayFirst.durationMinutes) === "15"
    || String(nameMondayFirst.durationMinutes) === "15 minutes",
    `duration should keep the pasted minutes, got ${nameMondayFirst.durationMinutes}`,
  );
  assert.match(nameMondayFirst.ageModifications || "", /Preschool/);
  assert.match(nameMondayFirst.safetyNotes || "", /Check every vehicle for loose parts/);
  assert.match(nameMondayFirst.materials || "", /Paper plates/);
  assert.match(nameMondayFirst.steps || "", /Invite children to roll/);
  assert.match(nameMondayFirst.teacherLanguage || "", /Which vehicle moves/);
  assert.equal(nameMondayFirst.imageRequirement, "required");
  const nameFridayLast = nameParsed.dailyPlans.friday.items[nameParsed.dailyPlans.friday.items.length - 1];
  assert.equal(nameFridayLast.title, "Friday Quiet Track Draw");
  assert.match(nameFridayLast.objective || "", /Friday Quiet Track Draw|quiet mark making/);
  assert.equal(
    titles.filter((title) => title === "Monday Wheel Painting").length,
    1,
  );
  console.log(`PASS  10 Name-block master paste creates ${expectedNameCount} real activities only`);

  function weekdaySpanMasterPaste(days) {
    const blocks = days.map((day, index) => activityBlock(`${day} Span Activity`, day, index === 0 ? "Weekday" : "Activity weekday"));
    return `Lesson title
Weekday Span ${days.length}-Day Fixture

Age band
Toddler 12–24 Months

Weekly overview
Intentional ${days.length}-day lesson.

${blocks.join("\n\n")}
`;
  }

  function assertWeekdaySpanImport(days, label) {
    const parsed = parseFullLessonStructurePaste(weekdaySpanMasterPaste(days));
    assert.equal(parsed.ok, true, parsed.errors.join("; "));
    assert.equal(parsed.activityCount, days.length, `${label} activity count`);
    const titles = flattenActivityTitles(parsed);
    assert.equal(titles.length, days.length);
    days.forEach((day) => {
      const key = day.toLowerCase();
      assert.deepEqual(parsed.dailyPlans[key].items.map((item) => item.title), [`${day} Span Activity`]);
    });
    WEEKDAYS.filter((day) => !days.includes(day)).forEach((day) => {
      const key = day.toLowerCase();
      assert.ok(parsed.dailyPlans[key], `${label} keeps ${day} container`);
      assert.equal(parsed.dailyPlans[key].items.length, 0, `${label} ${day} stays empty`);
    });
    assert.equal(titles.some((title) => /no activity scheduled/i.test(title)), false, `${label} no fake placeholders`);
    console.log(`PASS  11 ${label} master paste imports; missing days stay empty`);
  }

  assertWeekdaySpanImport(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "5-day");
  assertWeekdaySpanImport(["Monday", "Tuesday", "Wednesday", "Thursday"], "4-day");
  assertWeekdaySpanImport(["Monday", "Tuesday", "Wednesday"], "3-day");

  const zeroActivity = parseFullLessonStructurePaste(`Lesson title
Zero Activity Fixture

Age band
Toddler 12–24 Months

Weekly overview
Title and age only.
`);
  assert.equal(zeroActivity.activityCount, 0, "zero-activity paste creates no activities");
  assert.equal(flattenActivityTitles(zeroActivity).length, 0);
  WEEKDAYS.forEach((day) => {
    assert.equal(zeroActivity.dailyPlans[day.toLowerCase()].items.length, 0);
  });
  assert.equal(
    flattenActivityTitles(zeroActivity).some((title) => /no activity scheduled/i.test(title)),
    false,
  );
  console.log("PASS  12 zero-activity master paste does not fabricate weekday activities");

  const rainbow = rainbowCoffeeFilterArtFixture();
  const rainbowParsed = parseFullLessonStructurePaste(rainbow.paste);
  assert.equal(rainbowParsed.ok, true, rainbowParsed.errors.join("; "));
  assert.equal(rainbowParsed.lesson.title, "Weather Watchers");
  assert.equal(rainbowParsed.activityCount, 1);
  const rainbowItem = rainbowParsed.dailyPlans.thursday.items[0];
  assert.equal(rainbowItem.title, "Rainbow Coffee Filter Art");
  assert.equal(rainbowItem.activityCategory, "Art");
  assert.match(rainbowItem.ageModifications, /Preschool 3–4 Years/);
  assert.equal(rainbowItem.durationMinutes, 20);
  assert.match(rainbowItem.objective, /color spreading and blending/);
  assert.match(rainbowItem.description, /washable marker colors to a coffee filter/);
  assert.deepEqual(listLines(rainbowItem.materials), [
    "White coffee filters",
    "Washable markers",
    "Droppers",
    "Spray bottles",
    "Water",
    "Trays",
    "Drying rack",
  ]);
  assert.match(rainbowItem.preparation, /Place each filter on a tray/);
  assert.match(rainbowItem.setup, /rainbow-colored markers/);
  assert.match(rainbowItem.steps, /Draw color marks on the dry filter/);
  assert.match(rainbowItem.teacherLanguage, /What happened when water touched the marker/);
  assert.match(rainbowItem.observationOpportunities, /fine-motor control/);
  assert.match(rainbowItem.safetyNotes, /washable non-toxic markers/);
  assert.match(rainbowItem.cleanupTips, /drying rack/);
  assert.match(rainbowItem.indoorAlternatives, /indoors or outdoors at an art table/);
  assert.match(rainbowItem.outdoorAlternatives, /indoors or outdoors at an art table/);
  assert.ok(Array.isArray(rainbowItem.teacherTips) && rainbowItem.teacherTips.some((tip) => /oversaturating/.test(tip)));
  assert.equal(rainbowItem.substitutions.length, 1);
  assert.equal(rainbowItem.substitutions[0].need, weekKit.UNSTRUCTURED_SUBSTITUTION_NEED);
  assert.match(rainbowItem.substitutions[0].use, /liquid watercolor drops/);
  assert.notEqual(rainbowItem.substitutions[0].need, "If missing");
  assert.match(rainbowItem.adaptations, /dot markers/);
  assert.match(rainbowItem.extensions, /two specific colors meet/);
  assert.match(rainbowItem.mixedAgeAdaptations, /Younger children can add random colors/);
  assert.ok(rainbowItem.observationPrompts.some((row) => /notice spreading/.test(row)));
  assert.match(rainbowItem.vocabulary, /rainbow/);
  assert.equal(rainbowItem.imageRequirement, "example_only");
  console.log("PASS  Rainbow Coffee Filter Art parser maps every supported field");

  const twenty = weatherWatchersTwentyActivityFixture();
  const twentyParsed = parseFullLessonStructurePaste(twenty.paste);
  assert.equal(twentyParsed.ok, true, twentyParsed.errors.join("; "));
  assert.equal(twentyParsed.activityCount, 20);
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    assert.equal(twentyParsed.dailyPlans[day].items.length, 4, day);
  });
  assert.equal(twentyParsed.dailyPlans.thursday.items[0].title, "Rainbow Coffee Filter Art");
  console.log("PASS  Weather Watchers 20-activity parse keeps weekday grouping");

  assertColorsAllAroundUsMasterPaste();
  assertColorsAllAroundUsCombinedTitleAgePaste();
}

function flattenActivityTitles(parsed) {
  return ["monday", "tuesday", "wednesday", "thursday", "friday"].flatMap((day) => (
    (parsed.dailyPlans?.[day]?.items || []).map((item) => item.title)
  ));
}

function assertNoWeekdayOrSeparatorPollution(parsed) {
  const headings = [
    "Monday — Look at Color",
    "Tuesday — Tummy-Time Colors",
    "Wednesday — Touch and Color",
    "Thursday — Light, Movement and Color",
    "Friday — Color Keepsakes and Favorites",
    "Monday — Looking at Bright Colors",
  ];
  const milestoneDump = JSON.stringify(parsed.lesson.milestones || [])
    + JSON.stringify(parsed.lesson.rejectedMilestones || []);
  headings.forEach((heading) => {
    assert.equal(milestoneDump.includes(heading), false, `milestone polluted by ${heading}`);
  });
  assert.equal(milestoneDump.includes(colorsFixture.SEP), false, "milestone polluted by separator");
  assert.equal(
    parsed.unrecognized.some((row) => /^Activity\s+\d+$/i.test(row.body || "") || /^Activity\s+\d+$/i.test(row.heading || "")),
    false,
    JSON.stringify(parsed.unrecognized),
  );
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    (parsed.dailyPlans[day].items || []).forEach((item) => {
      const blob = [
        item.objective, item.description, item.setup, item.steps, item.teacherLanguage,
        item.observationOpportunities, item.safetyNotes, item.cleanupTips, item.preparation,
      ].join("\n");
      headings.forEach((heading) => {
        assert.equal(blob.includes(heading), false, `${item.title} polluted by ${heading}`);
      });
      assert.doesNotMatch(blob, /^Activity\s+\d+$/m, `${item.title} polluted by Activity N`);
      assert.equal(blob.includes(colorsFixture.SEP), false, `${item.title} polluted by separator`);
    });
  });
}

function assertColorsAllAroundUsMasterPaste() {
  const paste = colorsFixture.colorsAllAroundUsMasterPaste();
  const parsed = parseFullLessonStructurePaste(paste);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.lesson.title, colorsFixture.COLORS_LESSON_TITLE);
  assert.equal(parsed.lesson.age, colorsFixture.COLORS_AGE_BAND);
  assert.match(parsed.lesson.weeklyOverview, /looking, reaching, tracking/);
  assert.match(parsed.lesson.teacherPreparation, /Prepare visual materials before babies arrive/);
  assert.equal(parsed.activityCount, 15);
  const expectedNames = colorsFixture.namesByDay();
  WEEKDAYS.forEach((label) => {
    const day = label.toLowerCase();
    const titles = (parsed.dailyPlans[day].items || []).map((item) => item.title);
    assert.deepEqual(titles, expectedNames[label], `${label} order`);
    assert.equal(titles.length, 3, `${label} count`);
  });
  assert.deepEqual(flattenActivityTitles(parsed), colorsFixture.ACTIVITIES.map((row) => row.title));
  assert.equal(
    parsed.unrecognized.some((row) => /Activity weekday was missing/i.test(row.body || "")),
    false,
    JSON.stringify(parsed.unrecognized),
  );
  assertNoWeekdayOrSeparatorPollution(parsed);
  colorsFixture.ACTIVITIES.forEach((spec) => {
    const day = spec.day.toLowerCase();
    const item = (parsed.dailyPlans[day].items || []).find((row) => row.title === spec.title);
    assert.ok(item, spec.title);
    assert.equal(item.activityCategory, spec.category, spec.title);
    assert.equal(item.durationMinutes, spec.durationMinutes, spec.title);
    assert.ok((item.objective || "").includes(spec.objective), spec.title);
    assert.ok((item.description || "").includes(spec.description), spec.title);
    assert.ok((item.setup || "").includes(spec.setup), spec.title);
    assert.ok((item.steps || "").includes(spec.steps), spec.title);
    colorsFixture.ACTIVITIES.filter((other) => other.title !== spec.title).forEach((other) => {
      ["objective", "description", "setup", "steps"].forEach((field) => {
        assert.equal(
          String(item[field] || "").includes(other.steps),
          false,
          `${spec.title} ${field} leaked ${other.title} steps`,
        );
      });
    });
  });
  const preview = formatActivityPreview(parsed);
  WEEKDAYS.forEach((label) => {
    assert.match(preview, new RegExp(`${label} — 3`));
  });
  assert.match(preview, /TOTAL ACTIVITIES: 15/);
  console.log("PASS  Colors All Around Us exact Master Paste parses 15 activities with field boundaries");
}

function assertColorsAllAroundUsCombinedTitleAgePaste() {
  const paste = colorsFixture.colorsAllAroundUsCombinedTitleAgePaste();
  const parsed = parseFullLessonStructurePaste(paste);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.lesson.title, colorsFixture.COLORS_LESSON_TITLE);
  assert.equal(parsed.lesson.age, colorsFixture.COLORS_AGE_BAND);
  assert.match(parsed.lesson.weeklyOverview, /looking, tracking, reaching/);
  assert.match(parsed.lesson.teacherPreparation, /Sanitize cloths/);
  assert.equal(parsed.activityCount, 15);
  const expectedNames = colorsFixture.namesByDayFrom(colorsFixture.COMBINED_TITLE_AGE_ACTIVITIES);
  WEEKDAYS.forEach((label) => {
    const day = label.toLowerCase();
    const titles = (parsed.dailyPlans[day].items || []).map((item) => item.title);
    assert.deepEqual(titles, expectedNames[label], `${label} order`);
    assert.equal(titles.length, 3, `${label} count`);
  });
  assert.ok(!parsed.lesson.rejectedMilestones.includes("Monday — Looking at Bright Colors"));
  assert.ok(!parsed.lesson.rejectedMilestones.includes(colorsFixture.SEP));
  assert.ok(parsed.lesson.milestones.includes("Social-emotional"));
  assert.ok(parsed.lesson.rejectedMilestones.includes("Cognition"));
  colorsFixture.COMBINED_TITLE_AGE_ACTIVITIES.forEach((spec) => {
    const day = spec.day.toLowerCase();
    const item = (parsed.dailyPlans[day].items || []).find((row) => row.title === spec.title);
    assert.ok(item, spec.title);
    assert.equal(item.activityCategory, spec.category, spec.title);
    assert.match(item.objective || "", new RegExp(`${spec.token} objective only`), spec.title);
    assert.match(item.setup || "", new RegExp(`${spec.token} setup only`), spec.title);
    assert.match(item.steps || "", new RegExp(`${spec.token} step one`), spec.title);
    colorsFixture.COMBINED_TITLE_AGE_ACTIVITIES.filter((other) => other.token !== spec.token).forEach((other) => {
      ["objective", "description", "setup", "steps"].forEach((field) => {
        assert.doesNotMatch(String(item[field] || ""), new RegExp(other.token), `${spec.title} ${field} leaked ${other.token}`);
      });
    });
    assert.equal(item.durationMinutes, 3, spec.title);
  });
  console.log("PASS  Colors All Around Us combined title—age paste still parses 15 activities");
}

function nameBlockActivity(name, { objective, safety } = {}) {
  return [
    "Name",
    name,
    "Duration",
    "15 minutes",
    "Age",
    "Preschool",
    "Category / developmental domain",
    "Creative Arts",
    "Objective",
    objective || `Children will explore ${name} with paint and movement.`,
    "What children will do",
    `Children will try ${name}. They will notice texture, color, and motion.`,
    "Materials",
    "Paper plates",
    "Washable paint",
    "Toy vehicles",
    "Teacher prep",
    "Cover the table. Set out one tray per pair.",
    "Setup",
    "Place paper and vehicles on a low table.",
    "Steps",
    "Invite children to roll a vehicle through paint.",
    "Ask what tracks they notice.",
    "Questions",
    "Which vehicle moves fastest? What sound does it make?",
    "Observation focus",
    `Watch grip, language, and turn-taking during ${name}.`,
    "Safety",
    safety || "Check every vehicle for loose parts.",
    "Cleanup",
    "Wash vehicles and wipe the table.",
    "Indoor/Outdoor options",
    "Indoor: table trays. Outdoor: driveway chalk tracks.",
    "Tips",
    "Keep groups small. Narrate the tracks.",
    "Substitutions",
    "If missing toy cars → use bottle caps.",
    "Support adaptations",
    "Offer a chunky handle or hand-over-hand help.",
    "Added challenge",
    "Invite a second color or a longer track.",
    "Mixed-age",
    "Toddlers stamp; preschoolers compare track shapes.",
    "Observation prompts",
    "Did the child name a vehicle? Did they wait for a turn?",
    "Vocabulary",
    "track",
    "roll",
    "vehicle",
    "Image request",
    "Setup + finished example",
    "Example images",
    "None yet",
  ].join("\n");
}

function largeNameBlockMasterPaste() {
  const byDay = {
    Monday: ["Monday Wheel Painting", "Monday Garage Collage"],
    Tuesday: ["Tuesday Ramp Rolling", "Tuesday Traffic Prints"],
    Wednesday: ["Wednesday Box Bus", "Wednesday Horn Painting"],
    Thursday: ["Thursday Map Marks", "Thursday Cargo Collage"],
    Friday: ["Friday Wash Station", "Friday Quiet Track Draw"],
  };
  const days = Object.keys(byDay).map((day) => (
    `${day}\n${byDay[day].map((name) => nameBlockActivity(name)).join("\n\n")}`
  )).join("\n\n");
  return `Lesson title
Things That Go: Art in Motion

Age band
Preschool

Weekly overview
Children explore vehicles through art, motion, and pretend play.

Learning objectives
Notice how wheels make tracks.
Practice sharing art tools.

Materials
Washable paint
Toy vehicles
Paper

Teacher preparation
Inspect every vehicle before the week begins. Keep paint covered until setup.

Observation focus
Watch how children describe motion and take turns.

Family connection
Ask families to notice wheels on the way to school.

${days}
`;
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
  rainbowCoffeeFilterArtFixture,
  weatherWatchersTwentyActivityFixture,
  RAINBOW_COFFEE_FILTER_ART_ACTIVITY,
  largeNameBlockMasterPaste,
  nameBlockActivity,
  colorsAllAroundUsMasterPaste: colorsFixture.colorsAllAroundUsMasterPaste,
  colorsAllAroundUsCombinedTitleAgePaste: colorsFixture.colorsAllAroundUsCombinedTitleAgePaste,
  COLORS_ALL_AROUND_US_FIXTURE: colorsFixture,
};
