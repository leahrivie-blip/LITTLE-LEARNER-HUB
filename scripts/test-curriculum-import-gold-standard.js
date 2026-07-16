#!/usr/bin/env node
/**
 * Admin import gold-standard paste checks.
 */
const assert = require("assert");
const {
  parseCurriculumLessonPlanImport,
} = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");
const { buildCurriculumImportPreview } = require("./curriculum-import-preview.js");

const GOOD_PASTE = `TITLE:
Ocean Explorers

AGE_GROUP:
Preschool

THEME:
Ocean Life

PLAN:
Pro

STATUS:
published

WEEKLY_OVERVIEW:
Preschoolers explore ocean animals through sensory play, literacy, math, STEM, and movement.

LEARNING_OBJECTIVES:
Identify ocean animals
Count and sort shells
Use ocean vocabulary

WEEKLY_MATERIALS:
Shells, trays, ocean animals, books

VOCABULARY:
ocean, shell, fish, wave

BOOKS:
Commotion in the Ocean | Giles Andreae

SONGS:
A Sailor Went to Sea

FAMILY_CONNECTION:
Talk about ocean words at bath time.

OBSERVATION_OPPORTUNITIES:
Ocean vocabulary and sorting

ADAPTATIONS:
Larger shells and visual steps

MONDAY

DAILY_THEME:
Ocean Life shell sorting

CIRCLE_TIME:
Ocean hello song

OUTDOOR_PLAY:
Crab walk race

ACTIVITY_NAME:
Shell Sorting Lab
CATEGORY:
STEM/Discovery
OBJECTIVE:
Sort shells by size with ocean words.
DESCRIPTION:
Children sort shells into trays and talk about ocean finds.
MATERIALS:
Shells, trays
SETUP:
Set trays at a table.
TEACHER_ROLE:
Ask open-ended ocean questions.
DIRECTIONS:
1. Show shells and name the ocean theme.
2. Sort by size.
3. Count each group.
4. Share one discovery.
5. Clean up.
LEARNING_GOALS:
Sorting
Counting
Ocean vocabulary
OBSERVATION_OPPORTUNITIES:
Uses ocean words
ADAPTATIONS:
Fewer categories
SAFETY_NOTES:
No choke-size shells

TUESDAY

ACTIVITY_NAME:
Ocean Movement Waves
CATEGORY:
Gross Motor & Movement
OBJECTIVE:
Move like ocean animals.
DESCRIPTION:
Children swim, float, and crab walk.
MATERIALS:
Open space, blue scarves
SETUP:
Clear floor space.
TEACHER_ROLE:
Model movements and ocean words.
DIRECTIONS:
1. Name an ocean animal.
2. Move like that animal.
3. Freeze on signal.
4. Switch animals.
5. Stretch and rest.
LEARNING_GOALS:
Gross motor
Listening
OBSERVATION_OPPORTUNITIES:
Joins movement
ADAPTATIONS:
Seated scarf waves
SAFETY_NOTES:
Clear pathways

WEDNESDAY

ACTIVITY_NAME:
Ocean Sensory Bin
CATEGORY:
Sensory Play
OBJECTIVE:
Explore ocean textures.
DESCRIPTION:
Children scoop ocean toys in a sensory bin.
MATERIALS:
Sensory bin, scoops, ocean toys
SETUP:
Fill bin before arrival.
TEACHER_ROLE:
Narrate ocean discoveries.
DIRECTIONS:
1. Invite children to the bin.
2. Scoop and pour.
3. Name ocean animals.
4. Share a favorite find.
5. Wash hands.
LEARNING_GOALS:
Sensory exploration
Vocabulary
OBSERVATION_OPPORTUNITIES:
Engages with materials
ADAPTATIONS:
Larger scoops
SAFETY_NOTES:
Supervise bin play

THURSDAY

ACTIVITY_NAME:
Ocean Name Writing Tray
CATEGORY:
Fine Motor
OBJECTIVE:
Trace ocean words.
DESCRIPTION:
Children finger-trace ocean words in sand.
MATERIALS:
Sand trays, letter cards
SETUP:
Prepare sand trays.
TEACHER_ROLE:
Model letter paths.
DIRECTIONS:
1. Show an ocean word card.
2. Trace with a finger.
3. Try a second word.
4. Wipe the tray.
5. Celebrate effort.
LEARNING_GOALS:
Fine motor
Letter awareness
OBSERVATION_OPPORTUNITIES:
Finger control
ADAPTATIONS:
Larger letters
SAFETY_NOTES:
No sand near eyes

FRIDAY

ACTIVITY_NAME:
Ocean Friend Share
CATEGORY:
Dramatic Play
OBJECTIVE:
Share a favorite ocean discovery with a friend.
DESCRIPTION:
Children take turns sharing ocean finds and kind words.
MATERIALS:
Ocean drawings or toys
SETUP:
Circle spots ready.
TEACHER_ROLE:
Coach turn-taking language.
DIRECTIONS:
1. Sit in a circle.
2. Share one ocean favorite.
3. Listen to a friend.
4. Give a kind compliment.
5. Sing a goodbye ocean song.
LEARNING_GOALS:
Turn taking
Kindness
OBSERVATION_OPPORTUNITIES:
Peer interaction
ADAPTATIONS:
Teacher models first share
SAFETY_NOTES:
Calm circle spacing
`;

const BAD_AGE_PASTE = `TITLE:
Random Craft Dump

THEME:
Dinosaurs

PLAN:
Free

STATUS:
draft

WEEKLY_OVERVIEW:
Something

MONDAY
ACTIVITY_NAME:
Worksheet Time
CATEGORY:
Art
DESCRIPTION:
Do worksheets with scissors and glue.
MATERIALS:
Worksheets, scissors, glue
DIRECTIONS:
1. Cut
2. Glue
3. Done
TEACHER_ROLE:
Watch
LEARNING_GOALS:
Cutting
`;

function testGoodPasteMapsAndConfirms() {
  const parsed = parseCurriculumLessonPlanImport(GOOD_PASTE, { mode: "v5" });
  assert.ok(parsed.ok, parsed.errors?.join("; "));
  assert.strictEqual(parsed.data.title, "Ocean Explorers");
  assert.strictEqual(parsed.data.theme, "Ocean Life");
  assert.match(parsed.data.age, /Preschool/i);
  assert.ok(parsed.data.dailyPlans.monday.items.length >= 1);

  const preview = buildCurriculumImportPreview(parsed, { formatVersion: 5 });
  assert.ok(preview.data.dailyPlans.monday.circleTime?.length || preview.data.dailyPlans.monday.outdoorPlay, "enrich should fill daily gaps");
  assert.ok(preview.canConfirm, `expected canConfirm, errors=${JSON.stringify(preview.errors)}`);
  console.log("✓ good ocean paste maps title/theme/age and can confirm");
}

function testMissingAgeBlocksConfirm() {
  const parsed = parseCurriculumLessonPlanImport(BAD_AGE_PASTE, { mode: "v5" });
  const preview = buildCurriculumImportPreview(parsed, { formatVersion: 5 });
  assert.strictEqual(preview.canConfirm, false);
  assert.ok(preview.errors.some((e) => /AGE_GROUP|THEME|age/i.test(e.message)));
  console.log("✓ missing age/theme blocks confirm");
}

function testOffThemeBlocked() {
  const paste = `TITLE:
Ocean Explorers

AGE_GROUP:
Preschool

THEME:
Ocean Life

PLAN:
Free

STATUS:
draft

WEEKLY_OVERVIEW:
Ocean week.

MONDAY
ACTIVITY_NAME:
Soccer Drill Only
CATEGORY:
Gross Motor & Movement
DESCRIPTION:
Children only practice soccer kicks on a field.
MATERIALS:
Soccer balls
DIRECTIONS:
1. Kick balls.
2. Run drills.
3. Score goals.
TEACHER_ROLE:
Coach soccer only.
LEARNING_GOALS:
Soccer skills

TUESDAY
ACTIVITY_NAME:
Basketball Layups
CATEGORY:
Gross Motor & Movement
DESCRIPTION:
Children only shoot basketballs indoors.
MATERIALS:
Basketballs
DIRECTIONS:
1. Shoot.
2. Rebound.
3. Repeat.
TEACHER_ROLE:
Coach basketball.
LEARNING_GOALS:
Shooting

WEDNESDAY
ACTIVITY_NAME:
Hockey Practice
CATEGORY:
Gross Motor & Movement
DESCRIPTION:
Children only practice hockey sticks.
MATERIALS:
Hockey sticks
DIRECTIONS:
1. Stickhandle.
2. Pass.
3. Shoot.
TEACHER_ROLE:
Coach hockey.
LEARNING_GOALS:
Hockey

THURSDAY
ACTIVITY_NAME:
Chess Tournament
CATEGORY:
Open-Ended Exploration
DESCRIPTION:
Children only play competitive chess matches.
MATERIALS:
Chess boards
DIRECTIONS:
1. Set boards.
2. Play matches.
3. Record winners.
TEACHER_ROLE:
Referee chess only.
LEARNING_GOALS:
Chess
`;
  const parsed = parseCurriculumLessonPlanImport(paste, { mode: "v5" });
  const preview = buildCurriculumImportPreview(parsed, { formatVersion: 5 });
  assert.strictEqual(preview.canConfirm, false);
  assert.ok(preview.errors.some((e) => /theme/i.test(e.message)), JSON.stringify(preview.errors));
  console.log("✓ off-theme activities blocked");
}

function main() {
  testGoodPasteMapsAndConfirms();
  testMissingAgeBlocksConfirm();
  testOffThemeBlocked();
  console.log("\nAll admin import gold-standard checks passed.");
}

main();
