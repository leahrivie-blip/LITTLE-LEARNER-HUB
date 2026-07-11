const crypto = require("crypto");

/**
 * @param {string} [suffix]
 * @returns {string}
 */
function uniqueE2eId(suffix = "") {
  const token = crypto.randomBytes(4).toString("hex");
  return suffix ? `E2E-${suffix}-${token}` : `E2E-${token}`;
}

/**
 * @param {string} unique
 * @returns {string}
 */
function buildE2eLessonImportText(unique) {
  const title = `E2E Publish Lesson ${unique}`;
  return `
TITLE:
${title}

AGE GROUP:
Toddler

THEME:
Rainbow Routines ${unique}

PLAN:
Free

STATUS:
draft

LEARNING DOMAINS:
Language & Literacy, Creative Arts

WEEKLY OVERVIEW:
Toddlers explore rainbow colors through songs, sensory bins, and cooperative art.

LEARNING OBJECTIVES:
Children will name three rainbow colors.
Children will practice sharing art materials with a peer.

WEEKLY MATERIALS:
Colored scarves, crayons, paper plates, glue sticks, rainbow picture cards

VOCABULARY:
red, orange, yellow, green, blue, rainbow, share

BOOKS:
Planting a Rainbow | Lois Ehlert | Color and garden vocabulary
Mouse Paint | Ellen Stoll Walsh | Color mixing fun

SONGS:
Rainbow Song | Sing color names while pointing to scarves
Color March | March and freeze on each color call

FAMILY CONNECTION:
Ask families to send one small rainbow-colored object for show and tell.

OBSERVATION OPPORTUNITIES:
Note color naming, turn-taking, and enthusiasm during group songs.

ADAPTATIONS:
Offer color cards for children who need visual prompts.

MONDAY:
ACTIVITY NAME:
Scarf Rainbow Dance
CATEGORY:
Music & Movement
MATERIALS:
Colored scarves, music speaker
SETUP:
Clear a small movement area and place scarves in a basket.
DIRECTIONS:
1. Hand each child a scarf.
2. Play music and invite color waves.
3. Freeze when the music stops.
LEARNING GOAL:
Move safely with music
Name colors during play

ACTIVITY NAME:
Plate Rainbow Glue
CATEGORY:
Fine Motor
MATERIALS:
Paper plates, glue sticks, tissue squares
SETUP:
Set out plates and sorted tissue colors at a table.
DIRECTIONS:
1. Model squeezing glue on the plate edge.
2. Children place tissue colors in rainbow order.
3. Let dry on a drying rack.
LEARNING GOAL:
Strengthen hand muscles
Explore color order

TUESDAY:
ACTIVITY NAME:
Color Card Hunt
CATEGORY:
Open-Ended Exploration
MATERIALS:
Rainbow picture cards, basket
SETUP:
Hide cards around the classroom.
DIRECTIONS:
1. Show one color card at a time.
2. Children search for matching items.
3. Place finds in the basket together.
LEARNING GOAL:
Practice color matching
Build cooperative search skills

WEDNESDAY:
ACTIVITY NAME:
Rainbow Sensory Bin
CATEGORY:
Sensory Play
MATERIALS:
Rice, scoops, rainbow items
SETUP:
Fill a bin with colored rice and tools.
DIRECTIONS:
1. Invite children to scoop and pour.
2. Name colors as they appear.
3. Model gentle sharing of scoops.
LEARNING GOAL:
Explore texture and color
Practice sharing tools

THURSDAY:
ACTIVITY NAME:
Helper Color March
CATEGORY:
Gross Motor
MATERIALS:
Floor dots, music
SETUP:
Place colored dots in a circle path.
DIRECTIONS:
1. March from dot to dot.
2. Call out each color name.
3. Stop and clap at the end.
LEARNING GOAL:
Coordinate steps with cues
Build color vocabulary

FRIDAY:
ACTIVITY NAME:
Rainbow Share Circle
CATEGORY:
Circle Time
MATERIALS:
Color cards, song chart
SETUP:
Children sit in a circle with cards in the middle.
DIRECTIONS:
1. Sing the rainbow song together.
2. Each child picks a card and names the color.
3. Thank the friend beside them.
LEARNING GOAL:
Participate in group time
Practice gratitude language
`.trim();
}

/**
 * Minimal lesson for error/edge-case tests.
 * @param {string} unique
 * @returns {string}
 */
function buildMinimalLessonImportText(unique) {
  return `
TITLE:
E2E Minimal Lesson ${unique}

AGE GROUP:
Preschool

THEME:
Sparse Theme ${unique}

PLAN:
Free

STATUS:
published

WEEKLY OVERVIEW:
Short overview only.

MONDAY:
ACTIVITY NAME:
Solo Monday Activity
CATEGORY:
Fine Motor
MATERIALS:
Crayons
DIRECTIONS:
1. Draw freely.
LEARNING GOAL:
Explore mark making
`.trim();
}

/**
 * Pro-tier lesson for access-control tests.
 * @param {string} unique
 * @returns {string}
 */
function buildProLessonImportText(unique) {
  return `
TITLE:
E2E Pro Locked Lesson ${unique}

AGE GROUP:
Preschool

THEME:
Pro Theme ${unique}

PLAN:
Pro

STATUS:
published

WEEKLY OVERVIEW:
Pro-only weekly overview for access testing.

MONDAY:
ACTIVITY NAME:
Pro Monday Activity
CATEGORY:
Sensory Play
MATERIALS:
Sensory bin
SETUP:
Prepare bin.
DIRECTIONS:
1. Explore textures.
LEARNING GOAL:
Explore sensory materials
`.trim();
}

/**
 * Lesson with many activities and long content.
 * @param {string} unique
 * @returns {string}
 */
function buildStressLessonImportText(unique) {
  const longText = "Long content line ".repeat(40);
  let text = `
TITLE:
E2E Stress Lesson ${unique}

AGE GROUP:
Preschool

THEME:
Stress Theme ${unique}

PLAN:
Free

STATUS:
published

WEEKLY OVERVIEW:
${longText}

WEEKLY MATERIALS:
${longText}

MONDAY:
`.trim();

  for (let i = 1; i <= 4; i += 1) {
    text += `

ACTIVITY NAME:
Monday Activity ${i} ${unique}
CATEGORY:
Fine Motor
MATERIALS:
Item ${i}
SETUP:
${longText.slice(0, 200)}
DIRECTIONS:
1. Step one for activity ${i}.
LEARNING GOAL:
Goal mon-${i}`;
  }

  return text;
}

module.exports = {
  uniqueE2eId,
  buildE2eLessonImportText,
  buildMinimalLessonImportText,
  buildProLessonImportText,
  buildStressLessonImportText,
};
