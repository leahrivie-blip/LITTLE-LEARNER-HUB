#!/usr/bin/env node
/**
 * Build V3 Pro import files for Preschool Family Connections Weeks 2–4.
 * Source: owner-provided Family Connections unit outline.
 *
 * Run: node scripts/build-preschool-family-connections-imports.js
 */
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "curriculum-preschool-family-connections-imports");

const LEARNING_DOMAINS = [
  "Social Emotional",
  "Language & Literacy",
  "Math",
  "Science",
  "Physical Development",
  "Creative Arts",
].join(", ");

function lines(items) {
  return items.map((item) => String(item).trim()).filter(Boolean).join("\n");
}

function activityBlock({
  name, category, objective, description, materials, setup, teacherRole, teacherLanguage,
  directions, learningGoals, observations, vocabulary, extensions, adaptations, safetyNotes, ageModifications,
}) {
  return [
    "ACTIVITY_NAME:", name, "CATEGORY:", category, "OBJECTIVE:", objective, "DESCRIPTION:", description,
    "MATERIALS:", materials, "SETUP:", setup, "TEACHER_ROLE:", teacherRole, "TEACHER_LANGUAGE:", teacherLanguage,
    "DIRECTIONS:", directions, "LEARNING_GOALS:", learningGoals, "OBSERVATION_OPPORTUNITIES:", observations,
    "VOCABULARY:", vocabulary, "EXTENSIONS:", extensions, "ADAPTATIONS:", adaptations,
    "SAFETY_NOTES:", safetyNotes, "AGE_MODIFICATIONS:", ageModifications, "",
  ].join("\n");
}

function dayBlock(day, data) {
  const parts = [
    day, "", "DAILY_THEME:", data.theme, "", "DAILY_OBJECTIVES:", lines(data.objectives), "",
    "DAILY_VOCABULARY:", data.vocabulary, "", "DAILY_MATERIALS:", lines(data.materials), "",
    "DAILY_LEARNING_DOMAINS:", data.domains || LEARNING_DOMAINS, "", "DAILY_BOOK:", data.book, "",
    "DAILY_SONG:", data.song, "", "CIRCLE_TIME:", data.circleTime, "", "OUTDOOR_PLAY:", data.outdoor, "",
    "DAILY_OBSERVATIONS:", data.observations, "", "DAILY_ADAPTATIONS:", data.adaptations, "",
    "SAFETY_NOTES:", data.safety, "",
  ];
  for (const act of data.activities) parts.push(activityBlock(act));
  return parts.join("\n");
}

function preschoolDefaults(themeWord) {
  return {
    teacherRole: "Facilitate discovery, model rich language, and guide preschoolers through cooperative play and problem-solving.",
    teacherLanguage: `"I notice you are exploring ${themeWord}. Tell me about your ideas. How can we work together?"`,
    setup: "Prepare interest areas and place materials within reach before group time begins.",
    extensions: "Offer extended challenges for older preschoolers or revisit during choice time.",
    adaptations: "Provide visual supports, sentence starters, and peer partners as needed.",
    safetyNotes: "Use preschool-safe materials. Supervise scissors, sensory, outdoor, and building activities.",
    ageModifications: "Younger Preschoolers (3 Years): picture routine cards, larger materials, teacher-supported writing, 3-step sequencing. Older Preschoolers (4–5 Years): independent writing, complex engineering, simple maps, expand measuring/graphing.",
  };
}

function mkActivity(overrides) {
  const defaults = preschoolDefaults(overrides.themeWord || "together");
  return {
    name: overrides.name, category: overrides.category, objective: overrides.objective,
    description: overrides.description, materials: overrides.materials,
    setup: overrides.setup || defaults.setup,
    teacherRole: overrides.teacherRole || defaults.teacherRole,
    teacherLanguage: overrides.teacherLanguage || defaults.teacherLanguage,
    directions: overrides.directions, learningGoals: overrides.learningGoals,
    observations: overrides.observations, vocabulary: overrides.vocabulary,
    extensions: overrides.extensions || defaults.extensions,
    adaptations: overrides.adaptations || defaults.adaptations,
    safetyNotes: overrides.safetyNotes || defaults.safetyNotes,
    ageModifications: overrides.ageModifications || defaults.ageModifications,
  };
}

const STD_DIR = [
  "Introduce the activity with a brief demonstration and theme vocabulary.",
  "Invite children to explore materials and share their ideas.",
  "Circulate to ask open-ended questions and support problem-solving.",
  "Encourage peer collaboration and respectful communication.",
  "Document observations and close with a brief reflection.",
].map((s, i) => `${i + 1}. ${s}`).join("\n");

function act(category, name, objective, description, materials, vocabulary, themeWord) {
  return mkActivity({
    themeWord: themeWord || "family",
    name,
    category,
    objective,
    description,
    materials,
    directions: STD_DIR,
    learningGoals: `${category} skills, language development, social-emotional growth, and active participation.`,
    observations: "Note engagement, vocabulary use, problem-solving, peer interactions, and independence.",
    vocabulary,
  });
}

function buildDay(d) {
  return {
    theme: d.theme,
    objectives: d.objectives,
    vocabulary: d.vocabulary,
    materials: d.materials,
    book: d.book,
    song: d.song,
    circleTime: d.circleTime,
    outdoor: d.outdoor,
    observations: d.observations,
    adaptations: d.adaptations,
    safety: d.safety,
    activities: d.acts.map((a) => act(a[0], a[1], a[2], a[3], a[4], a[5], a[6])),
  };
}

function buildWeek(meta) {
  const days = {};
  for (const [key, day] of Object.entries(meta.dayDefs)) days[key] = buildDay(day);
  return { ...meta, days };
}
const WEEKS = [
  buildWeek({
    file: "02-preschool-my-home-and-my-family-pro.txt",
    title: "My Home & My Family",
    theme: "Family Connections — My Home & My Family",
    overview: "Children explore home, family routines, responsibilities, and ways families spend time together through literacy, dramatic play, STEM, math, and creative experiences that build appreciation for home life and early academic and social-emotional skills.",
    objectives: ["Describe home and family routines.","Compare different types of homes.","Practice sequencing and storytelling.","Use early math skills for sorting, measuring, and counting.","Engineer and build homes through design challenges.","Cooperate through dramatic play and group projects."],
    materials: ["Wooden and foam blocks","Cardboard boxes","Craft sticks","Recycled building materials","Playdough","Measuring tapes","Toy furniture","Dollhouse","Construction paper","Paint","Markers","Glue","Scissors","Alphabet cards","Counting cubes","Dramatic play kitchen","Blank paper","Clipboards"],
    vocabulary: ["Home","Routine","Responsibility","Apartment","House","Neighbor","Bedroom","Kitchen","Build","Community"],
    books: ["Home | Carson Ellis","A House Is a House for Me","Homes Around the World","Big Sarah's Little Boots","At Home"],
    songs: ["This Is the Way","The More We Get Together","Clean Up Song","Hokey Pokey","If You're Happy and You Know It"],
    family: "Complete the Our Favorite Family Tradition page; bring a drawing or short story; talk about ways everyone helps at home.",
    observations: "Describe home, sequence routines, cooperate in dramatic play, build stable structures, use measurement vocabulary, write or dictate, count and compare, take responsibility for classroom jobs.",
    adaptations: "Younger Preschoolers (3 Years): picture routine cards, larger materials, teacher-supported writing, 3-step sequencing. Older Preschoolers (4–5 Years): independent writing, complex engineering, simple maps, expand measuring and graphing.",
    dayDefs: {
      MONDAY: {
        theme: "What Makes a Place Feel Like Home",
        objectives: ["Design and build homes using wooden blocks.","Draw a home and label rooms with teacher support.","Count and compare windows and doors on building models.","Engineer a stable structure that remains upright.","Create a painted dream home with colors and details.","Explore rocks, trucks, wood, and sand in a construction bin."],
        vocabulary: "Home, Build, House, Room, Bedroom, Kitchen, Draw, Count",
        materials: ["Wooden blocks","Foam blocks","Toy people","Road tape","Paper","Crayons","Markers","Alphabet cards","Block houses","Home photos","Counting cubes","Craft sticks","Recycled materials","Paint","Brushes","Construction paper","Aprons","Sand","Rocks","Wood pieces","Toy trucks","Scoops"],
        book: "Home | Carson Ellis",
        song: "This Is the Way",
        circleTime: "Morning meeting: What makes a place feel like home? Discuss rooms and spaces where families live, play, and rest.",
        outdoor: "Neighborhood walk to observe different homes and talk about what makes a house a home.",
        observations: "Notice home vocabulary, block building stability, room labeling, counting, and outdoor observations.",
        adaptations: "Younger: label rooms with pictures. Older: add details and simple maps to home drawings.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Open-Ended Exploration",
              "Build Homes with Wooden Blocks",
              "Design and build homes using wooden blocks.",
              "Children explore wooden blocks to create houses, apartments, and other dwellings.",
              "Wooden blocks\nFoam blocks\nToy people\nRoad tape",
              "Home, Build, House, Room",
              "home"
            ],
            [
              "Literacy",
              "Draw My Home and Label Rooms",
              "Draw a home and label rooms with teacher support.",
              "Children draw their home and label bedrooms, kitchen, and other rooms.",
              "Paper\nCrayons\nMarkers\nAlphabet cards",
              "Home, Bedroom, Kitchen, Draw",
              "home"
            ],
            [
              "STEM/Discovery",
              "Count Windows and Doors",
              "Count and compare windows and doors on building models.",
              "Children count windows and doors on block homes and classroom photos.",
              "Block houses\nHome photos\nCounting cubes",
              "Count, Window, Door, Compare",
              "home"
            ],
            [
              "STEM/Discovery",
              "Build a House That Stays Standing",
              "Engineer a stable structure that remains upright.",
              "Children test block designs to build a house that stays standing.",
              "Wooden blocks\nCraft sticks\nRecycled materials",
              "Build, Stable, Engineer, Test",
              "home"
            ],
            [
              "Art",
              "Paint My Dream Home",
              "Create a painted dream home with colors and details.",
              "Children paint their dream home using process art techniques.",
              "Paint\nBrushes\nConstruction paper\nAprons",
              "Paint, Dream, Home, Color",
              "home"
            ],
            [
              "Sensory Play",
              "Construction Sensory Bin",
              "Explore rocks, trucks, wood, and sand in a construction bin.",
              "Children scoop, pour, and build in a construction-themed sensory bin.",
              "Sand\nRocks\nWood pieces\nToy trucks\nScoops",
              "Scoop, Build, Sand, Truck",
              "home"
            ]
        ],
      },
      TUESDAY: {
        theme: "Family Routines",
        objectives: ["Explore home routines through kitchen and doll play.","Sequence morning and bedtime routine cards.","Sort household items into room categories.","Build furniture for a dollhouse using blocks and loose parts.","Create a collage of a favorite bedroom.","Shape playdough into furniture for a miniature home."],
        vocabulary: "Cook, Home, Family, Help, Routine, Morning, Bedtime, Order",
        materials: ["Dramatic play kitchen","Dolls","Dishes","Blankets","Routine picture cards","Pocket chart","Paper","Toy household items","Room labels","Sorting trays","Blocks","Loose parts","Dollhouse","Toy furniture","Magazines","Construction paper","Glue","Scissors","Playdough","Rolling pins","Craft sticks"],
        book: "A House Is a House for Me",
        song: "Clean Up Song",
        circleTime: "Morning meeting: Talk about family routines such as waking up, meals, playtime, and bedtime.",
        outdoor: "Pretend to deliver mail to classmates' homes during outdoor play.",
        observations: "Watch routine sequencing, household sorting, dramatic play cooperation, and furniture building.",
        adaptations: "Younger: use picture routine cards. Older: write or dictate longer routine sequences.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Home Dramatic Play Kitchen",
              "Explore home routines through kitchen and doll play.",
              "Children pretend to cook, care for dolls, and complete housekeeping tasks.",
              "Dramatic play kitchen\nDolls\nDishes\nBlankets",
              "Cook, Home, Family, Help",
              "routine"
            ],
            [
              "Literacy",
              "Sequence Daily Routines",
              "Sequence morning and bedtime routine cards.",
              "Children order picture cards showing daily routines from morning to bedtime.",
              "Routine picture cards\nPocket chart\nPaper",
              "Routine, Morning, Bedtime, Order",
              "routine"
            ],
            [
              "STEM/Discovery",
              "Sort Household Objects by Room",
              "Sort household items into room categories.",
              "Children sort toy household objects by bedroom, kitchen, and bathroom.",
              "Toy household items\nRoom labels\nSorting trays",
              "Sort, Room, Kitchen, Bedroom",
              "routine"
            ],
            [
              "STEM/Discovery",
              "Build Furniture with Blocks",
              "Build furniture for a dollhouse using blocks and loose parts.",
              "Children design beds, tables, and chairs with blocks and loose parts.",
              "Blocks\nLoose parts\nDollhouse\nToy furniture",
              "Build, Furniture, Design, Home",
              "routine"
            ],
            [
              "Art",
              "Bedroom Collage",
              "Create a collage of a favorite bedroom.",
              "Children cut and glue materials to design a cozy bedroom collage.",
              "Magazines\nConstruction paper\nGlue\nScissors",
              "Bedroom, Collage, Soft, Home",
              "routine"
            ],
            [
              "Sensory Play",
              "Playdough Furniture",
              "Shape playdough into furniture for a miniature home.",
              "Children roll and shape playdough into beds, chairs, and tables.",
              "Playdough\nRolling pins\nCraft sticks",
              "Roll, Furniture, Shape, Home",
              "routine"
            ]
        ],
      },
      WEDNESDAY: {
        theme: "How Families Help Care for Home",
        objectives: ["Explore homes and cultures through photos and pretend play.","Write or dictate about a favorite room at home.","Measure block houses using counting cubes.","Build the tallest stable house possible.","Paint a collaborative neighborhood mural.","Explore a rice tray with neighborhood elements."],
        vocabulary: "Home, Culture, World, Together, Room, Favorite, Write, Measure",
        materials: ["Home photos from cultures","Blocks","Fabric","Dolls","Paper","Pencils","Clipboards","Word cards","Counting cubes","Block houses","Recording sheet","Craft sticks","Measuring tape","Butcher paper","Paint","Brushes","Markers","Rice","Toy buildings","Vehicles","Scoops"],
        book: "Homes Around the World",
        song: "The More We Get Together",
        circleTime: "Morning meeting: Discuss how families help care for their homes and each other.",
        outdoor: "Neighborhood scavenger hunt to find signs of community and homes.",
        observations: "Notice cultural home comparisons, favorite room writing, measuring, and mural collaboration.",
        adaptations: "Younger: choose one favorite room with a picture. Older: measure and compare structures with cubes.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Homes Around the World Invitation",
              "Explore homes and cultures through photos and pretend play.",
              "Children explore photos of homes worldwide and recreate them in dramatic play.",
              "Home photos from cultures\nBlocks\nFabric\nDolls",
              "Home, Culture, World, Together",
              "community"
            ],
            [
              "Literacy",
              "Write About My Favorite Room",
              "Write or dictate about a favorite room at home.",
              "Children draw and write about their favorite room with teacher support.",
              "Paper\nPencils\nClipboards\nWord cards",
              "Room, Favorite, Write, Home",
              "community"
            ],
            [
              "STEM/Discovery",
              "Measure Block Houses with Cubes",
              "Measure block houses using counting cubes.",
              "Children measure the height and width of block houses with cubes.",
              "Counting cubes\nBlock houses\nRecording sheet",
              "Measure, Count, Tall, Wide",
              "community"
            ],
            [
              "STEM/Discovery",
              "Tallest House Challenge",
              "Build the tallest stable house possible.",
              "Children work in pairs to engineer the tallest house that stays standing.",
              "Blocks\nCraft sticks\nMeasuring tape",
              "Tall, Build, Challenge, Stable",
              "community"
            ],
            [
              "Art",
              "Neighborhood Mural",
              "Paint a collaborative neighborhood mural.",
              "Children add buildings, roads, and homes to a class neighborhood mural.",
              "Butcher paper\nPaint\nBrushes\nMarkers",
              "Neighborhood, Paint, Community, Together",
              "community"
            ],
            [
              "Sensory Play",
              "Rice Neighborhood Tray",
              "Explore a rice tray with neighborhood elements.",
              "Children scoop rice and arrange roads, buildings, and vehicles.",
              "Rice\nToy buildings\nVehicles\nScoops",
              "Scoop, Road, Neighborhood, Explore",
              "community"
            ]
        ],
      },
      THURSDAY: {
        theme: "Jobs People Do at Home",
        objectives: ["Role-play cooking, cleaning, caring for babies and pets.","Complete and illustrate the sentence My Family Helps By…","Graph favorite chores and classroom jobs.","Design a playground for the neighborhood.","Paint community buildings such as schools and stores.","Explore water play with toy houses and people."],
        vocabulary: "Help, Clean, Care, Responsibility, Family, Write, Graph, Count",
        materials: ["Kitchen props","Cleaning tools","Baby dolls","Pet toys","Paper","Crayons","Sentence starters","Chart paper","Stickers","Clipboards","Blocks","Loose parts","Markers","Paint","Brushes","Cardboard","Construction paper","Water table","Toy houses","People figures","Cups"],
        book: "At Home",
        song: "If You're Happy and You Know It",
        circleTime: "Morning meeting: Talk about jobs and responsibilities people do at home.",
        outdoor: "Teamwork games outdoors that practice helping and cooperating.",
        observations: "Observe responsibility dramatic play, sentence completion, graphing, and playground design.",
        adaptations: "Younger: finish sentences with teacher support. Older: create chore graphs independently.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Family Responsibility Dramatic Play",
              "Role-play cooking, cleaning, caring for babies and pets.",
              "Children take roles cooking, cleaning, caring for babies, pets, and organizing.",
              "Kitchen props\nCleaning tools\nBaby dolls\nPet toys",
              "Help, Clean, Care, Responsibility",
              "responsibility"
            ],
            [
              "Literacy",
              "My Family Helps By…",
              "Complete and illustrate the sentence My Family Helps By…",
              "Children finish the sentence and illustrate how their family helps at home.",
              "Paper\nCrayons\nSentence starters",
              "Help, Family, Write, Care",
              "responsibility"
            ],
            [
              "STEM/Discovery",
              "Chore Graphs",
              "Graph favorite chores and classroom jobs.",
              "Children survey peers and graph favorite ways to help at home.",
              "Chart paper\nStickers\nClipboards",
              "Graph, Count, Help, Job",
              "responsibility"
            ],
            [
              "STEM/Discovery",
              "Design a Playground Neighborhood",
              "Design a playground for the neighborhood.",
              "Children plan and build a playground everyone can enjoy.",
              "Blocks\nLoose parts\nPaper\nMarkers",
              "Design, Playground, Build, Plan",
              "responsibility"
            ],
            [
              "Art",
              "Paint Community Buildings",
              "Paint community buildings such as schools and stores.",
              "Children paint community buildings for a class town display.",
              "Paint\nBrushes\nCardboard\nConstruction paper",
              "Community, Paint, Building, Town",
              "responsibility"
            ],
            [
              "Sensory Play",
              "Water Play with Toy Houses",
              "Explore water play with toy houses and people.",
              "Children pour and splash with toy houses and community figures.",
              "Water table\nToy houses\nPeople figures\nCups",
              "Pour, Splash, Home, Play",
              "responsibility"
            ]
        ],
      },
      FRIDAY: {
        theme: "Review Homes and Families",
        objectives: ["Return to favorite home and building dramatic play choices.","Create a My Home Book keepsake with five pages.","Read and share home books with classmates.","Count and compare items in a neighborhood scene.","Complete a favorite engineering building challenge.","Revisit a favorite sensory experience from the week."],
        vocabulary: "Build, Play, Home, Favorite, Book, Family, Keepsake, Share",
        materials: ["Blocks","Kitchen","Dolls","Loose parts","Booklet pages","Crayons","Glue","Family photos","Completed books","Carpet area","Neighborhood photos","Counting cubes","Clipboards","Recycled materials","Measuring tools","Materials from prior days"],
        book: "Child's favorite book from the week (class vote)",
        song: "Favorite songs from the week",
        circleTime: "Morning meeting: Review homes, families, and favorite learning from the week.",
        outdoor: "Neighborhood obstacle course with cooperative challenges.",
        observations: "Notice keepsake book completion, sharing, counting, and celebration engagement.",
        adaptations: "Younger: dictate keepsake pages. Older: write independently and lead sharing.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Favorite Building Challenge Revisit",
              "Return to favorite home and building dramatic play choices.",
              "Children revisit favorite building and home dramatic play areas.",
              "Blocks\nKitchen\nDolls\nLoose parts",
              "Build, Play, Home, Favorite",
              "home"
            ],
            [
              "Art",
              "My Home Book Keepsake",
              "Create a My Home Book keepsake with five pages.",
              "Children assemble My Home Book pages: My House, Favorite Room, My Family, Favorite Family Activity, One Way I Help.",
              "Booklet pages\nCrayons\nGlue\nFamily photos",
              "Book, Home, Family, Keepsake",
              "home"
            ],
            [
              "Literacy",
              "Share My Home Books",
              "Read and share home books with classmates.",
              "Children share their keepsake books and favorite pages with peers.",
              "Completed books\nCarpet area",
              "Share, Read, Home, Family",
              "home"
            ],
            [
              "STEM/Discovery",
              "Neighborhood Counting",
              "Count and compare items in a neighborhood scene.",
              "Children count houses, trees, and vehicles in a neighborhood display.",
              "Neighborhood photos\nCounting cubes\nClipboards",
              "Count, Neighborhood, Compare, Number",
              "home"
            ],
            [
              "STEM/Discovery",
              "Favorite Building Challenge",
              "Complete a favorite engineering building challenge.",
              "Children choose a favorite building challenge and engineer a new structure.",
              "Blocks\nRecycled materials\nMeasuring tools",
              "Build, Engineer, Challenge, Design",
              "home"
            ],
            [
              "Sensory Play",
              "Favorite Sensory from the Week",
              "Revisit a favorite sensory experience from the week.",
              "Children vote on and explore a favorite sensory station from the week.",
              "Materials from prior days",
              "Favorite, Explore, Sensory, Choose",
              "home"
            ]
        ],
      }
    },
  }),
  buildWeek({
    file: "03-preschool-caring-hearts-pro.txt",
    title: "Caring Hearts",
    theme: "Family Connections — Caring Hearts",
    overview: "Children explore kindness, empathy, compassion, and helping through conversations, cooperative play, literacy, STEM, and arts that show how words and actions make others feel valued.",
    objectives: ["Recognize and name emotions.","Practice empathy and kindness.","Demonstrate helpful behaviors.","Use communication for conflict resolution.","Connect literacy, math, and STEM to kindness themes.","Build a positive classroom community."],
    materials: ["Emotion cards","Mirrors","Puppets","Chart paper","Construction paper","Paint","Crayons","Markers","Glue","Scissors","Blocks","Loose parts","Medical kit","Dolls","Bandages","Playdough","Counting cubes","Kindness stones","Heart stickers"],
    vocabulary: ["Kindness","Caring","Empathy","Respect","Helpful","Gentle","Friend","Feelings","Compassion","Encourage"],
    books: ["Have You Filled a Bucket Today?","The Rabbit Listened","Kindness Makes Us Strong","I Am Human","Be Kind"],
    songs: ["Skidamarink","The More We Get Together","If You're Happy and You Know It","This Little Light of Mine","Kindness Begins With Me"],
    family: "Complete the Kindness Challenge with home activities and share one act of kindness from home.",
    observations: "Notice empathy, emotion naming, conflict resolution, cooperation, feelings expression, writing and storytelling, STEM perseverance, and including peers.",
    adaptations: "Younger Preschoolers (3 Years): picture emotion cards, sentence starters, modeled conflict language, brief groups. Older Preschoolers (4–5 Years): independent journals, complex role-play, expanded graphing and patterns, lead kindness discussions and helper roles.",
    dayDefs: {
      MONDAY: {
        theme: "What Kindness Looks Like",
        objectives: ["Act out kind scenarios with puppets.","Draw or write one way to be kind.","Count kindness acts observed during the day.","Build a bridge so toy friends can cross together.","Decorate classroom kindness buckets.","Scoop and sort heart gems in a sensory bin."],
        vocabulary: "Kind, Puppet, Help, Friend, Write, Care, Count, Tally",
        materials: ["Puppets","Puppet theater","Kindness scenario cards","Paper","Crayons","Pencils","Sentence starters","Chart paper","Counting cubes","Stickers","Blocks","Craft sticks","Toy animals","Buckets","Markers","Paper hearts","Heart gems","Scoops","Sensory bin","Bowls"],
        book: "Have You Filled a Bucket Today?",
        song: "The More We Get Together",
        circleTime: "Morning meeting: What does kindness look like? Create a class list of kind actions.",
        outdoor: "Cooperative parachute games outdoors.",
        observations: "Watch kindness vocabulary, puppet play, bucket decorating, and peer inclusion.",
        adaptations: "Younger: draw one kind act. Older: count and record kindness acts throughout the day.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Kindness Puppet Theater",
              "Act out kind scenarios with puppets.",
              "Children use puppets to perform stories about filling buckets and helping friends.",
              "Puppets\nPuppet theater\nKindness scenario cards",
              "Kind, Puppet, Help, Friend",
              "kindness"
            ],
            [
              "Literacy",
              "Draw or Write One Way to Be Kind",
              "Draw or write one way to be kind.",
              "Children illustrate or write one kind action they can do at school.",
              "Paper\nCrayons\nPencils\nSentence starters",
              "Kind, Write, Help, Care",
              "kindness"
            ],
            [
              "STEM/Discovery",
              "Count Kindness Acts",
              "Count kindness acts observed during the day.",
              "Children use tally marks or cubes to count kind acts they notice.",
              "Chart paper\nCounting cubes\nStickers",
              "Count, Kind, Tally, Notice",
              "kindness"
            ],
            [
              "STEM/Discovery",
              "Bridge for Toy Friends",
              "Build a bridge so toy friends can cross together.",
              "Children engineer a bridge that helps toy friends reach each other.",
              "Blocks\nCraft sticks\nToy animals",
              "Bridge, Build, Friend, Help",
              "kindness"
            ],
            [
              "Art",
              "Decorate Kindness Buckets",
              "Decorate classroom kindness buckets.",
              "Children decorate buckets where classmates can leave kind notes.",
              "Buckets\nStickers\nMarkers\nPaper hearts",
              "Bucket, Kind, Decorate, Share",
              "kindness"
            ],
            [
              "Sensory Play",
              "Heart Gems Scoop Play",
              "Scoop and sort heart gems in a sensory bin.",
              "Children scoop, pour, and sort heart-shaped gems and scoops.",
              "Heart gems\nScoops\nSensory bin\nBowls",
              "Scoop, Heart, Gentle, Share",
              "kindness"
            ]
        ],
      },
      TUESDAY: {
        theme: "Helping Someone Who Feels Sad",
        objectives: ["Care for dolls and animals at a doctor's office.","Write or dictate I can help by… sentences.","Sort picture cards by emotion.","Build a cozy recovery space for an injured stuffed animal.","Create caring hands handprint art.","Shape playdough into emotion faces."],
        vocabulary: "Doctor, Care, Help, Gentle, Write, Friend, Feelings, Sort",
        materials: ["Medical kit","Dolls","Stuffed animals","Bandages","Paper","Pencils","Sentence frames","Emotion cards","Sorting mats","Blocks","Blankets","Fabric","Paint","Wipes","Markers","Playdough","Tools"],
        book: "The Rabbit Listened",
        song: "Kindness Begins With Me",
        circleTime: "Morning meeting: How can we help someone who feels sad?",
        outdoor: "Partner obstacle course that requires helping each other.",
        observations: "Observe doctor play empathy, emotion sorting, caring handprints, and partner cooperation.",
        adaptations: "Younger: sort two emotions at a time. Older: create comfortable homes for injured animals.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Doctor's Office for Dolls and Animals",
              "Care for dolls and animals at a doctor's office.",
              "Children bandage and comfort dolls and stuffed animals.",
              "Medical kit\nDolls\nStuffed animals\nBandages",
              "Doctor, Care, Help, Gentle",
              "caring"
            ],
            [
              "Literacy",
              "I Can Help By…",
              "Write or dictate I can help by… sentences.",
              "Children complete sentences about ways they can help others.",
              "Paper\nPencils\nSentence frames",
              "Help, Write, Care, Friend",
              "caring"
            ],
            [
              "STEM/Discovery",
              "Sort Emotions",
              "Sort picture cards by emotion.",
              "Children sort faces and scenarios into happy, sad, mad, and scared groups.",
              "Emotion cards\nSorting mats",
              "Feelings, Sort, Happy, Sad",
              "caring"
            ],
            [
              "STEM/Discovery",
              "Comfortable Home for Injured Stuffed Animal",
              "Build a cozy recovery space for an injured stuffed animal.",
              "Children design a soft, safe space for an injured stuffed animal to rest.",
              "Blocks\nBlankets\nStuffed animals\nFabric",
              "Comfort, Home, Care, Gentle",
              "caring"
            ],
            [
              "Art",
              "Caring Hands Handprints",
              "Create caring hands handprint art.",
              "Children make handprints and add words about how hands help others.",
              "Paint\nPaper\nWipes\nMarkers",
              "Hand, Care, Kind, Help",
              "caring"
            ],
            [
              "Sensory Play",
              "Playdough Emotion Faces",
              "Shape playdough into emotion faces.",
              "Children sculpt happy, sad, and caring faces in playdough.",
              "Playdough\nTools\nEmotion cards",
              "Face, Feelings, Shape, Soft",
              "caring"
            ]
        ],
      },
      WEDNESDAY: {
        theme: "Being a Good Friend",
        objectives: ["Build one large structure together as a class.","Make friendship cards for classmates.","Graph classmates' favorite ways to help.","Engineer a bench that fits two friends.","Add squares to a friendship quilt collage.","Explore water play with floating hearts."],
        vocabulary: "Friend, Build, Together, Share, Card, Kind, Write, Graph",
        materials: ["Blocks","Loose parts","Fabric","Tape","Construction paper","Markers","Stickers","Chart paper","Clipboards","Craft sticks","Measuring tape","Paper squares","Crayons","Glue","Butcher paper","Water table","Foam hearts","Cups","Boats"],
        book: "Kindness Makes Us Strong",
        song: "Skidamarink",
        circleTime: "Morning meeting: What does it mean to be a good friend?",
        outdoor: "Team relay games that require cooperation.",
        observations: "Notice friendship building, friendship cards, helping graphs, and bench engineering.",
        adaptations: "Younger: build with a partner. Older: lead friendship discussions.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Open-Ended Exploration",
              "Friendship Building Structure",
              "Build one large structure together as a class.",
              "Children collaborate to build one large friendship structure with blocks and loose parts.",
              "Blocks\nLoose parts\nFabric\nTape",
              "Friend, Build, Together, Share",
              "friendship"
            ],
            [
              "Literacy",
              "Friendship Cards",
              "Make friendship cards for classmates.",
              "Children write or draw kind messages on cards for friends.",
              "Construction paper\nMarkers\nStickers",
              "Friend, Card, Kind, Write",
              "friendship"
            ],
            [
              "STEM/Discovery",
              "Graph Favorite Ways to Help",
              "Graph classmates' favorite ways to help.",
              "Children survey peers and graph favorite helping actions.",
              "Chart paper\nStickers\nClipboards",
              "Graph, Help, Count, Friend",
              "friendship"
            ],
            [
              "STEM/Discovery",
              "Bench for Two Friends",
              "Engineer a bench that fits two friends.",
              "Children design and build a bench where two friends can sit together.",
              "Blocks\nCraft sticks\nMeasuring tape",
              "Bench, Build, Friend, Together",
              "friendship"
            ],
            [
              "Art",
              "Friendship Quilt Collage",
              "Add squares to a friendship quilt collage.",
              "Each child decorates a square for a class friendship quilt.",
              "Paper squares\nCrayons\nGlue\nButcher paper",
              "Quilt, Friend, Together, Art",
              "friendship"
            ],
            [
              "Sensory Play",
              "Water with Floating Hearts",
              "Explore water play with floating hearts.",
              "Children float heart shapes and practice gentle pouring together.",
              "Water table\nFoam hearts\nCups\nBoats",
              "Float, Heart, Pour, Gentle",
              "friendship"
            ]
        ],
      },
      THURSDAY: {
        theme: "How Words Make People Feel",
        objectives: ["Role-play solving common classroom problems kindly.","Dictate stories about helping a friend.","Create and extend kindness heart patterns.","Design a playground where everyone can play.","Paint a kindness flower garden mural.","Explore rainbow rice with friendship figures."],
        vocabulary: "Solve, Kind, Talk, Friend, Story, Help, Write, Pattern",
        materials: ["Problem scenario cards","Puppets","Props","Paper","Pencils","Clipboards","Heart cutouts","Pattern cards","Glue","Blocks","Markers","Loose parts","Butcher paper","Paint","Brushes","Rainbow rice","Friendship figures","Scoops"],
        book: "Be Kind",
        song: "If You're Happy and You Know It",
        circleTime: "Morning meeting: How do words make people feel? Practice kind language.",
        outdoor: "Bubble teamwork games outdoors.",
        observations: "Watch problem-solving role-play, helping stories, kindness patterns, and mural collaboration.",
        adaptations: "Younger: dictate helping stories. Older: create kindness heart patterns independently.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Solve Classroom Problems Role-Play",
              "Role-play solving common classroom problems kindly.",
              "Children act out scenarios and practice kind solutions to classroom challenges.",
              "Problem scenario cards\nPuppets\nProps",
              "Solve, Kind, Talk, Friend",
              "kindness"
            ],
            [
              "Literacy",
              "Stories About Helping a Friend",
              "Dictate stories about helping a friend.",
              "Children dictate and illustrate stories about helping a friend in need.",
              "Paper\nPencils\nClipboards",
              "Story, Help, Friend, Write",
              "kindness"
            ],
            [
              "STEM/Discovery",
              "Kindness Heart Patterns",
              "Create and extend kindness heart patterns.",
              "Children make AB and ABC patterns with heart manipulatives.",
              "Heart cutouts\nPattern cards\nGlue",
              "Pattern, Heart, Kind, Repeat",
              "kindness"
            ],
            [
              "STEM/Discovery",
              "Playground Everyone Can Play",
              "Design a playground where everyone can play.",
              "Children plan inclusive playground features everyone can enjoy.",
              "Blocks\nPaper\nMarkers\nLoose parts",
              "Play, Include, Design, Friend",
              "kindness"
            ],
            [
              "Art",
              "Kindness Flower Garden Mural",
              "Paint a kindness flower garden mural.",
              "Children add flowers and kind words to a collaborative mural.",
              "Butcher paper\nPaint\nBrushes\nMarkers",
              "Flower, Kind, Garden, Together",
              "kindness"
            ],
            [
              "Sensory Play",
              "Rainbow Rice with Friendship Figures",
              "Explore rainbow rice with friendship figures.",
              "Children bury and find friendship figures in rainbow rice.",
              "Rainbow rice\nFriendship figures\nScoops",
              "Scoop, Find, Friend, Color",
              "kindness"
            ]
        ],
      },
      FRIDAY: {
        theme: "Celebrate Kindness",
        objectives: ["Revisit favorite caring dramatic play areas.","Assemble a My Kindness Book keepsake.","Read kindness books aloud to friends.","Count kindness hearts collected during the week.","Revisit a favorite engineering challenge from the week.","Vote on and explore a favorite sensory station."],
        vocabulary: "Kind, Play, Care, Friend, Book, Pledge, Read, Share",
        materials: ["Doctor kit","Puppets","Kitchen","Blocks","Booklet pages","Crayons","Stickers","Kindness books","Carpet area","Heart cutouts","Chart paper","Counting cubes","Loose parts","Bridge materials","Materials from prior days"],
        book: "I Am Human",
        song: "Kindness celebration songs",
        circleTime: "Morning meeting: Celebrate kindness and share examples from classmates.",
        outdoor: "Friendship celebration games outdoors.",
        observations: "Notice keepsake completion, book sharing, heart counting, and celebration joy.",
        adaptations: "Younger: complete keepsake with support. Older: write Caring Heart pledge independently.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Kindness Celebration Play",
              "Revisit favorite caring dramatic play areas.",
              "Children return to favorite kindness and caring play stations.",
              "Doctor kit\nPuppets\nKitchen\nBlocks",
              "Kind, Play, Care, Friend",
              "kindness"
            ],
            [
              "Art",
              "My Kindness Book Keepsake",
              "Assemble a My Kindness Book keepsake.",
              "Children complete pages: I am kind when…, I help others by…, A friend helped me when…, favorite act this week, Caring Heart pledge.",
              "Booklet pages\nCrayons\nStickers",
              "Kind, Book, Pledge, Care",
              "kindness"
            ],
            [
              "Literacy",
              "Read Aloud to Classmates",
              "Read kindness books aloud to friends.",
              "Children take turns reading or retelling kindness books to classmates.",
              "Kindness books\nCarpet area",
              "Read, Share, Kind, Story",
              "kindness"
            ],
            [
              "STEM/Discovery",
              "Count Kindness Hearts This Week",
              "Count kindness hearts collected during the week.",
              "Children count and compare kindness hearts from the week.",
              "Heart cutouts\nChart paper\nCounting cubes",
              "Count, Heart, Week, Kind",
              "kindness"
            ],
            [
              "STEM/Discovery",
              "Favorite Engineering Revisit",
              "Revisit a favorite engineering challenge from the week.",
              "Children choose and repeat a favorite STEM kindness challenge.",
              "Blocks\nLoose parts\nBridge materials",
              "Build, Engineer, Kind, Try",
              "kindness"
            ],
            [
              "Sensory Play",
              "Favorite Sensory from the Week",
              "Vote on and explore a favorite sensory station.",
              "Children vote on a favorite sensory experience from the week.",
              "Materials from prior days",
              "Favorite, Choose, Sensory, Calm",
              "kindness"
            ]
        ],
      }
    },
  }),
  buildWeek({
    file: "04-preschool-we-belong-together-pro.txt",
    title: "We Belong Together",
    theme: "Family Connections — We Belong Together",
    overview: "Children build a caring classroom community where everyone belongs through friendship, teamwork, inclusion, respect, and collaborative literacy, STEM, dramatic play, and creative projects that culminate the Family Connections unit.",
    objectives: ["Build friendships through cooperative play.","Practice teamwork and problem-solving.","Respect similarities and differences.","Communicate clearly and show leadership.","Connect literacy, math, and STEM through collaboration.","Celebrate classroom community."],
    materials: ["Chart paper","Blocks","Magnetic tiles","Cardboard boxes","Loose parts","Paint","Construction paper","Glue","Scissors","Markers","Yarn","Friendship beads","Clipboards","Alphabet cards","Counting manipulatives","Parachute","Balls","Scarves","Bubbles","Classroom photos"],
    vocabulary: ["Belong","Community","Teamwork","Respect","Include","Cooperate","Friendship","Celebrate","Together","Welcome"],
    books: ["All Are Welcome | Alexandra Penfold","We're Better Together","The Invisible Boy","Strictly No Elephants","Whoever You Are"],
    songs: ["The More We Get Together","We're All in This Together","Skidamarink","Make New Friends","If You're Happy and You Know It"],
    family: "Write a short note about what your child learned during Family Connections; display the Growing Together board; send home a memory page.",
    observations: "Notice inclusion of peers, group project cooperation, conflict resolution, clear communication, leadership, collaborative STEM, community pride, and reflection on growth and friendships.",
    adaptations: "Younger Preschoolers (3 Years): buddy pairs, visual teamwork supports, shorter collaborative tasks. Older Preschoolers (4–5 Years): lead discussions and games, complete sentence writing, complex engineering, help plan the celebration.",
    dayDefs: {
      MONDAY: {
        theme: "What Belonging Means",
        objectives: ["Build a large classroom with blocks and loose parts.","Draw or write about favorite times with friends.","Count classmates and graph favorite centers.","Engineer a bridge wide enough for everyone.","Create puzzle pieces for a friendship mural.","Explore a community bin with people, buildings, and vehicles."],
        vocabulary: "Build, Classroom, Together, Belong, Friend, Write, Play, Count",
        materials: ["Blocks","Loose parts","Toy people","Signs","Paper","Crayons","Pencils","Chart paper","Stickers","Clipboards","Craft sticks","Measuring tape","Puzzle piece cutouts","Paint","Markers","Sensory base","People figures","Buildings","Vehicles"],
        book: "All Are Welcome | Alexandra Penfold",
        song: "The More We Get Together",
        circleTime: "Morning meeting: What does belonging mean? Brainstorm ways we welcome everyone.",
        outdoor: "Cooperative parachute games outdoors.",
        observations: "Watch large-scale building, friendship writing, classmate graphs, and bridge engineering.",
        adaptations: "Younger: draw with a buddy. Older: lead welcome brainstorm and measure bridge width.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Open-Ended Exploration",
              "Build a Large Classroom Together",
              "Build a large classroom with blocks and loose parts.",
              "Children collaborate to build a classroom community with blocks and loose parts.",
              "Blocks\nLoose parts\nToy people\nSigns",
              "Build, Classroom, Together, Belong",
              "belonging"
            ],
            [
              "Literacy",
              "Draw or Write About Friends",
              "Draw or write about favorite times with friends.",
              "Children illustrate and write about playing with friends at school.",
              "Paper\nCrayons\nPencils",
              "Friend, Write, Play, Together",
              "belonging"
            ],
            [
              "STEM/Discovery",
              "Count Classmates and Graph Centers",
              "Count classmates and graph favorite centers.",
              "Children count classmates and graph favorite learning centers.",
              "Chart paper\nStickers\nClipboards",
              "Count, Graph, Class, Friend",
              "belonging"
            ],
            [
              "STEM/Discovery",
              "Bridge Wide Enough for Everyone",
              "Engineer a bridge wide enough for everyone.",
              "Children build a bridge structure wide enough for the whole class concept.",
              "Blocks\nCraft sticks\nMeasuring tape",
              "Bridge, Wide, Build, Include",
              "belonging"
            ],
            [
              "Art",
              "Friendship Puzzle Mural Pieces",
              "Create puzzle pieces for a friendship mural.",
              "Each child decorates a puzzle piece for a class friendship mural.",
              "Puzzle piece cutouts\nPaint\nMarkers",
              "Puzzle, Friend, Together, Art",
              "belonging"
            ],
            [
              "Sensory Play",
              "Community Bin Exploration",
              "Explore a community bin with people, buildings, and vehicles.",
              "Children arrange people, buildings, roads, and vehicles in a community bin.",
              "Sensory base\nPeople figures\nBuildings\nVehicles",
              "Community, Road, Build, Explore",
              "belonging"
            ]
        ],
      },
      TUESDAY: {
        theme: "Including Someone Left Out",
        objectives: ["Run a restaurant where everyone has a role.","Write an invitation inviting a friend to play.","Create patterns with friendship bracelet beads.","Work in teams to build the tallest tower.","Decorate friendship bracelets to share.","Share playdough tools and create together."],
        vocabulary: "Include, Role, Restaurant, Friend, Invite, Write, Welcome, Pattern",
        materials: ["Play food","Menus","Aprons","Tables","Invitation templates","Crayons","Envelopes","Friendship beads","Yarn","Pattern cards","Blocks","Magnetic tiles","Timer","Beaded bracelets","Charms","Markers","Playdough","Tools","Rolling pins"],
        book: "The Invisible Boy",
        song: "Make New Friends",
        circleTime: "Morning meeting: How can we include someone who feels left out?",
        outdoor: "Partner obstacle course outdoors.",
        observations: "Notice restaurant role-play inclusion, invitations, bracelet patterns, and tower teamwork.",
        adaptations: "Younger: string large beads with help. Older: pattern complex friendship bracelets.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Restaurant Dramatic Play for Everyone",
              "Run a restaurant where everyone has a role.",
              "Children assign roles so every classmate is included in restaurant play.",
              "Play food\nMenus\nAprons\nTables",
              "Include, Role, Restaurant, Friend",
              "include"
            ],
            [
              "Literacy",
              "Write an Invitation to a Friend",
              "Write an invitation inviting a friend to play.",
              "Children write or dictate invitations to a classmate.",
              "Invitation templates\nCrayons\nEnvelopes",
              "Invite, Friend, Write, Welcome",
              "include"
            ],
            [
              "STEM/Discovery",
              "Friendship Bracelet Bead Patterns",
              "Create patterns with friendship bracelet beads.",
              "Children string beads in repeating patterns for friendship bracelets.",
              "Friendship beads\nYarn\nPattern cards",
              "Pattern, Bead, Friend, Make",
              "include"
            ],
            [
              "STEM/Discovery",
              "Teams Tallest Tower",
              "Work in teams to build the tallest tower.",
              "Teams cooperate to build the tallest stable tower.",
              "Blocks\nMagnetic tiles\nTimer",
              "Tower, Team, Build, Tall",
              "include"
            ],
            [
              "Art",
              "Decorate Friendship Bracelets",
              "Decorate friendship bracelets to share.",
              "Children decorate bracelets to give to a friend.",
              "Beaded bracelets\nCharms\nMarkers",
              "Bracelet, Friend, Gift, Decorate",
              "include"
            ],
            [
              "Sensory Play",
              "Playdough Teamwork Table",
              "Share playdough tools and create together.",
              "Children share playdough tools and build collaborative creations.",
              "Playdough\nTools\nRolling pins",
              "Share, Team, Roll, Together",
              "include"
            ]
        ],
      },
      WEDNESDAY: {
        theme: "Why Teamwork Matters",
        objectives: ["Teams build a town at a construction site.","Contribute a page to Our Classroom Family.","Measure and compare structures built by teams.","Design a playground the whole class can enjoy.","Paint a giant classroom community banner.","Explore water play with community helpers and buildings."],
        vocabulary: "Team, Build, Town, Work, Story, Class, Family, Write",
        materials: ["Hard hats","Blocks","Boxes","Road signs","Book pages","Markers","Glue","Photos","Measuring tape","Recording sheets","Loose parts","Paper","Butcher paper","Paint","Brushes","Water table","Helper figures","Buildings","Boats"],
        book: "We're Better Together",
        song: "We're All in This Together",
        circleTime: "Morning meeting: Why is teamwork important in our classroom?",
        outdoor: "Relay teamwork games outdoors.",
        observations: "Observe construction site teams, class story contributions, structure measuring, and banner painting.",
        adaptations: "Younger: contribute one page to class story. Older: measure and compare team structures.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Construction Site Teams Build a Town",
              "Teams build a town at a construction site.",
              "Children work in construction teams to build a classroom town.",
              "Hard hats\nBlocks\nBoxes\nRoad signs",
              "Team, Build, Town, Work",
              "teamwork"
            ],
            [
              "Literacy",
              "Our Classroom Family Class Story",
              "Contribute a page to Our Classroom Family.",
              "Each child contributes a page to a collaborative class story book.",
              "Book pages\nMarkers\nGlue\nPhotos",
              "Story, Class, Family, Write",
              "teamwork"
            ],
            [
              "STEM/Discovery",
              "Measure and Compare Team Structures",
              "Measure and compare structures built by teams.",
              "Teams measure height and width of their structures and compare results.",
              "Measuring tape\nBlocks\nRecording sheets",
              "Measure, Compare, Team, Tall",
              "teamwork"
            ],
            [
              "STEM/Discovery",
              "Playground Everyone Can Enjoy",
              "Design a playground the whole class can enjoy.",
              "Children design inclusive playground features for everyone.",
              "Blocks\nLoose parts\nPaper\nMarkers",
              "Playground, Design, Include, Plan",
              "teamwork"
            ],
            [
              "Art",
              "Giant Classroom Banner",
              "Paint a giant classroom community banner.",
              "Children paint a banner celebrating their classroom family.",
              "Butcher paper\nPaint\nBrushes\nMarkers",
              "Banner, Class, Paint, Together",
              "teamwork"
            ],
            [
              "Sensory Play",
              "Water with Community Helpers",
              "Explore water play with community helpers and buildings.",
              "Children float community helper figures and buildings in water play.",
              "Water table\nHelper figures\nBuildings\nBoats",
              "Float, Helper, Community, Pour",
              "teamwork"
            ]
        ],
      },
      THURSDAY: {
        theme: "Solving Problems Together",
        objectives: ["Role-play welcoming solutions to classroom challenges.","Write I help our classroom by… sentences.","Vote and graph favorite activities from the month.","Build a marble run as a team.","Add handprints to a friendship wreath.","Explore rainbow rice with community symbols."],
        vocabulary: "Solve, Welcome, Include, Talk, Help, Class, Write, Care",
        materials: ["Scenario cards","Props","Puppets","Paper","Pencils","Sentence starters","Chart paper","Stickers","Activity cards","Marble run pieces","Blocks","Marbles","Wreath form","Paint","Wipes","Rainbow rice","Community symbols","Scoops"],
        book: "Strictly No Elephants",
        song: "Skidamarink",
        circleTime: "Morning meeting: How do we solve problems together as a classroom family?",
        outdoor: "Cooperative ball games outdoors.",
        observations: "Watch welcoming role-play, classroom helper writing, activity graphs, and marble run teamwork.",
        adaptations: "Younger: vote with stickers. Older: lead marble run planning.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Solve Pretend Classroom Challenges",
              "Role-play welcoming solutions to classroom challenges.",
              "Children act out inclusive solutions to pretend classroom problems.",
              "Scenario cards\nProps\nPuppets",
              "Solve, Welcome, Include, Talk",
              "together"
            ],
            [
              "Literacy",
              "I Help Our Classroom By…",
              "Write I help our classroom by… sentences.",
              "Children write or dictate ways they help the classroom community.",
              "Paper\nPencils\nSentence starters",
              "Help, Class, Write, Care",
              "together"
            ],
            [
              "STEM/Discovery",
              "Graph Favorite Month Activities",
              "Vote and graph favorite activities from the month.",
              "Children vote on favorite Family Connections activities and graph results.",
              "Chart paper\nStickers\nActivity cards",
              "Graph, Vote, Favorite, Count",
              "together"
            ],
            [
              "STEM/Discovery",
              "Marble Run Team Project",
              "Build a marble run as a team.",
              "Teams design and build a marble run together.",
              "Marble run pieces\nBlocks\nMarbles",
              "Marble, Team, Build, Plan",
              "together"
            ],
            [
              "Art",
              "Class Handprint Friendship Wreath",
              "Add handprints to a friendship wreath.",
              "Each child adds a handprint to a class friendship wreath display.",
              "Wreath form\nPaint\nWipes",
              "Hand, Wreath, Friend, Together",
              "together"
            ],
            [
              "Sensory Play",
              "Rainbow Rice Community",
              "Explore rainbow rice with community symbols.",
              "Children search for community symbols in rainbow rice.",
              "Rainbow rice\nCommunity symbols\nScoops",
              "Scoop, Find, Community, Color",
              "together"
            ]
        ],
      },
      FRIDAY: {
        theme: "Celebrate Family Connections",
        objectives: ["Revisit favorite community dramatic play areas.","Create Our Classroom Family Memory Book.","Share memory pages with classmates.","Review and compare graphs from the week.","Revisit a favorite engineering challenge from the unit.","Vote on a favorite sensory experience from Family Connections."],
        vocabulary: "Play, Friend, Celebrate, Together, Memory, Book, Class, Keepsake",
        materials: ["Blocks","Kitchen","Dress-up","Props","Booklet pages","Crayons","Photos","Completed books","Carpet area","Charts from the week","Markers","Magnetic tiles","Loose parts","Materials from prior weeks"],
        book: "Whoever You Are",
        song: "Favorite songs from the unit",
        circleTime: "Morning meeting: Celebrate completing the Family Connections unit and reflect on growth.",
        outdoor: "Friendship celebration with bubbles, music, and parachute outdoors.",
        observations: "Notice memory book sharing, graph review, engineering revisit, and celebration joy.",
        adaptations: "Younger: dictate memory pages. Older: help plan celebration and lead sharing.",
        safety: "Use preschool-safe materials. Supervise building, sensory, art, scissors, and outdoor activities.",
        acts: [
            [
              "Dramatic Play",
              "Friendship Celebration Play",
              "Revisit favorite community dramatic play areas.",
              "Children choose favorite friendship and community play areas to celebrate.",
              "Blocks\nKitchen\nDress-up\nProps",
              "Play, Friend, Celebrate, Together",
              "belonging"
            ],
            [
              "Art",
              "Our Classroom Family Memory Book Keepsake",
              "Create Our Classroom Family Memory Book.",
              "Children complete pages: favorite memory, favorite activity, a good friend is…, I help others by…, favorite thing about our classroom.",
              "Booklet pages\nCrayons\nPhotos",
              "Memory, Book, Class, Keepsake",
              "belonging"
            ],
            [
              "Literacy",
              "Share Memory Pages",
              "Share memory pages with classmates.",
              "Children read and share their memory book pages with the class.",
              "Completed books\nCarpet area",
              "Share, Memory, Read, Friend",
              "belonging"
            ],
            [
              "STEM/Discovery",
              "Review and Compare Week Graphs",
              "Review and compare graphs from the week.",
              "Children review graphs created during the week and discuss findings.",
              "Charts from the week\nMarkers",
              "Graph, Compare, Review, Count",
              "belonging"
            ],
            [
              "STEM/Discovery",
              "Favorite Engineering Revisit",
              "Revisit a favorite engineering challenge from the unit.",
              "Children choose a favorite collaborative engineering challenge to repeat.",
              "Blocks\nMagnetic tiles\nLoose parts",
              "Build, Engineer, Favorite, Team",
              "belonging"
            ],
            [
              "Sensory Play",
              "Vote on Favorite Sensory from the Month",
              "Vote on a favorite sensory experience from Family Connections.",
              "Children vote on and explore a favorite sensory station from the month.",
              "Materials from prior weeks",
              "Favorite, Vote, Sensory, Celebrate",
              "belonging"
            ]
        ],
      }
    },
  })
];

function renderWeek(week) {
  const dayOrder = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  return [
    "TITLE:", week.title, "", "AGE_GROUP:", "Preschool", "", "THEME:", week.theme, "",
    "PLAN:", "Pro", "", "STATUS:", "published", "", "LEARNING_DOMAINS:", LEARNING_DOMAINS, "",
    "WEEKLY_OVERVIEW:", week.overview, "", "LEARNING_OBJECTIVES:", lines(week.objectives), "",
    "WEEKLY_MATERIALS:", lines(week.materials), "", "VOCABULARY:", lines(week.vocabulary), "",
    "BOOKS:", lines(week.books), "", "SONGS:", lines(week.songs), "", "FAMILY_CONNECTION:", week.family, "",
    "OBSERVATION_OPPORTUNITIES:", week.observations, "", "ADAPTATIONS:", week.adaptations, "",
    ...dayOrder.map((day) => dayBlock(day, week.days[day])),
  ].join("\n");
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const week of WEEKS) {
    const outPath = path.join(OUT_DIR, week.file);
    fs.writeFileSync(outPath, `${renderWeek(week).trim()}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
  }
  console.log(`Built ${WEEKS.length} Family Connections preschool Pro imports.`);
}

main();
