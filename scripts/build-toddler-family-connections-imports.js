#!/usr/bin/env node
/**
 * Build V3 Pro import files for Toddler Family Connections Weeks 1–4.
 * Source: owner-provided Family Connections unit outline.
 *
 * Run: node scripts/build-toddler-family-connections-imports.js
 */
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "curriculum-toddler-family-connections-imports");

const LEARNING_DOMAINS = [
  "Social Emotional",
  "Language & Literacy",
  "Physical Development",
  "Science",
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

function toddlerDefaults(themeWord) {
  return {
    teacherRole: "Stay nearby, model language, and support toddlers as they explore, share, and try new skills.",
    teacherLanguage: `"Look. ${themeWord}. You are trying. I see you working. We can do it together."`,
    setup: "Prepare materials at child height and clear enough space for movement before toddlers arrive.",
    extensions: "Invite children to revisit the activity later during choice time or with a peer partner.",
    adaptations: "Offer more one-on-one support and simpler steps for younger toddlers; extend conversations and independence for older toddlers.",
    safetyNotes: "Use washable, toddler-safe materials. Supervise closely during movement, sensory, and art activities.",
    ageModifications: "Younger Toddlers (12–24 Months): shorter groups, larger manipulatives, more teacher modeling, and simpler choices. Older Toddlers (24–36 Months): longer conversations, sorting/matching, cooperative play, and more independent exploration.",
  };
}

function mkActivity(overrides) {
  const defaults = toddlerDefaults(overrides.themeWord || "together");
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
  "Set out materials at child height and invite toddlers to explore.",
  "Model the first step with simple words and gestures.",
  "Support each child as they try, naming actions and vocabulary.",
  "Encourage turn-taking, effort, and peer awareness when appropriate.",
  "Clean up together and transition with a short song or routine.",
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
    observations: "Note engagement, vocabulary use, motor skills, peer interactions, and independence.",
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
    file: "01-toddler-the-people-who-love-me-pro.txt",
    title: "The People Who Love Me",
    theme: "Family Connections — The People Who Love Me",
    overview: "Toddlers explore important people through stories, songs, dramatic play, art, and hands-on experiences. Every family is unique as children build communication, social-emotional skills, and a sense of belonging.",
    objectives: ["Recognize and talk about family members.","Build positive relationships with peers and teachers.","Strengthen communication and vocabulary.","Develop fine and gross motor skills.","Explore art, sensory, and dramatic play.","Participate in group activities."],
    materials: ["Family photos","Baby dolls","Doll clothes","Blankets","Toy kitchen","Toy phones","Mirrors","Play houses","Washable paint","Cardstock","Dot markers","Playdough","Cookie cutters","Blocks","Scarves","Instruments","Sensory bin materials","Large paper","Crayons","Glue sticks","Stickers"],
    vocabulary: ["Family","Love","Home","Together","Friend"],
    books: ["The Family Book | Todd Parr","Families, Families, Families! | Suzanne Lang","I Love You Through and Through | Bernadette Rossetti-Shustak","My Family, Your Family | Lisa Bullard","Everywhere Babies | Susan Meyers"],
    songs: ["Skidamarink","Finger Family Song","The More We Get Together","If You're Happy and You Know It","You Are My Sunshine"],
    family: "Ask families to send a favorite family photo and share one tradition. Display photos at child height.",
    observations: "Observe family vocabulary, dramatic play, social interactions, fine motor, gross motor, communication, songs/stories, and interest in family photos.",
    adaptations: "Younger Toddlers (12–24 Months): one-on-one support, simpler art, shorter groups, larger manipulatives. Older Toddlers (24–36 Months): longer conversations, sorting/matching, independence, and imaginative dramatic play.",
    dayDefs: {
      MONDAY: {
              "theme": "Family Photos and Loving Faces",
              "objectives": [
                      "Look at family photos and name people they see.",
                      "Explore family dramatic play materials.",
                      "Practice fine and gross motor skills through art and movement."
              ],
              "vocabulary": "Family, Love, Home, Together, Friend",
              "materials": [
                      "Family photos",
                      "Baby dolls",
                      "Blankets",
                      "Toy kitchen",
                      "Crayons",
                      "Paper",
                      "Playdough",
                      "Cookie cutters",
                      "Stickers",
                      "Scarves"
              ],
              "book": "The Family Book | Todd Parr",
              "song": "Skidamarink",
              "circleTime": "Look at family photos together and invite each child to share who they see. Read The Family Book and pause for names, smiles, and simple responses.",
              "outdoor": "Take a neighborhood walk to look at homes and talk about families who live inside.",
              "observations": "Notice family vocabulary, photo interest, dramatic play, fine motor grasping, and movement participation.",
              "adaptations": "Younger toddlers: one photo at a time and hand-over-hand support. Older toddlers: encourage naming and longer conversations.",
              "safety": "Secure photos and supervise kitchen props; use washable art materials only.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Family Dramatic Play Invitation",
                              "Explore family roles through doll and kitchen play.",
                              "Toddlers pretend to care for baby dolls, cook, and create family routines with blankets and kitchen props.",
                              "Baby dolls\nDoll clothes\nBlankets\nToy kitchen\nToy phones",
                              "Family, Baby, Cook, Home"
                      ],
                      [
                              "Art",
                              "Draw My Family",
                              "Create a family drawing using crayons.",
                              "Toddlers draw people who love them on large paper with crayons while teachers label names.",
                              "Large paper\nCrayons\nFamily photo reference",
                              "Family, Draw, Love, Together"
                      ],
                      [
                              "Sensory Play",
                              "Playdough Family Shapes",
                              "Explore playdough with family-themed cutters.",
                              "Toddlers squeeze, roll, and cut playdough using family and heart cookie cutters.",
                              "Playdough\nFamily cookie cutters\nTray",
                              "Squeeze, Roll, Family, Soft"
                      ],
                      [
                              "Fine Motor",
                              "Family Sticker Collage",
                              "Peel and place stickers to build a family scene.",
                              "Toddlers peel stickers and place them on paper to represent family members.",
                              "Stickers\nPaper\nTray",
                              "Stick, Family, Put, Together"
                      ],
                      [
                              "Gross Motor",
                              "Family Movement Walk",
                              "Move like family members through walk, jump, crawl, and tiptoe.",
                              "Toddlers move through a simple path using different family-inspired movements.",
                              "Open space\nFloor markers (optional)",
                              "Walk, Jump, Crawl, Tiptoe"
                      ],
                      [
                              "Music & Movement",
                              "Skidamarink Scarf Dance",
                              "Dance with scarves to Skidamarink.",
                              "Toddlers wave scarves and move to Skidamarink while teachers model loving gestures.",
                              "Scarves\nMusic player",
                              "Dance, Love, Wave, Together"
                      ]
              ]
      },
      TUESDAY: {
              "theme": "Who Lives in Our Homes",
              "objectives": [
                      "Talk about people who live in homes.",
                      "Practice cooking and caring in dramatic play.",
                      "Strengthen fine motor through beading and art."
              ],
              "vocabulary": "Family, Home, Cook, Together, Help",
              "materials": [
                      "Toy kitchen",
                      "Rice sensory bin",
                      "Family figures",
                      "Sponges",
                      "Paint",
                      "Pipe cleaners",
                      "Large beads",
                      "Puppets"
              ],
              "book": "Families, Families, Families! | Suzanne Lang",
              "song": "Finger Family Song",
              "circleTime": "Talk about who lives in homes using photos and simple questions. Read Families, Families, Families! and sing the Finger Family Song with puppets.",
              "outdoor": "Collect leaves and flowers for a nature collage about homes and families.",
              "observations": "Watch for home vocabulary, pretend cooking, sponge painting, beading, and obstacle movement.",
              "adaptations": "Younger toddlers: larger beads and shorter obstacle paths. Older toddlers: sort family figures and extend pretend play.",
              "safety": "Supervise rice bin play and ensure beads are large enough for toddler use.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Cook Dinner for Family",
                              "Pretend to cook and serve meals for a family.",
                              "Toddlers use the toy kitchen to cook dinner and serve family members.",
                              "Toy kitchen\nPlay food\nPlates\nSpoons",
                              "Cook, Eat, Family, Home"
                      ],
                      [
                              "Art",
                              "Sponge Paint Family Picture",
                              "Create a family picture using sponge painting.",
                              "Toddlers sponge paint a family scene on cardstock with teacher support.",
                              "Sponges\nWashable paint\nCardstock\nWipes",
                              "Paint, Family, Dab, Color"
                      ],
                      [
                              "Sensory Play",
                              "Rice Bin Family Figures",
                              "Explore rice while finding and naming family figures.",
                              "Toddlers scoop rice and discover toy family figures hidden inside.",
                              "Rice\nSensory bin\nToy family figures\nScoops",
                              "Scoop, Find, Family, Pour"
                      ],
                      [
                              "Fine Motor",
                              "Thread Beads on Pipe Cleaners",
                              "Thread large beads onto pipe cleaners.",
                              "Toddlers thread large beads onto pipe cleaners to make family bracelets.",
                              "Large beads\nPipe cleaners\nTray",
                              "Thread, Bead, Family, Make"
                      ],
                      [
                              "Gross Motor",
                              "Obstacle Visit to Family",
                              "Move through an obstacle course to visit family.",
                              "Toddlers crawl, step, and balance through a simple obstacle course.",
                              "Soft cushions\nTunnels (optional)\nCones",
                              "Go, Over, Through, Family"
                      ],
                      [
                              "Music & Movement",
                              "Finger Family Song Puppets",
                              "Sing Finger Family Song with finger puppets.",
                              "Toddlers sing and move finger puppets for each family member.",
                              "Finger puppets\nMusic player",
                              "Sing, Family, Finger, Together"
                      ]
              ]
      },
      WEDNESDAY: {
              "theme": "Things Families Do Together",
              "objectives": [
                      "Talk about activities families enjoy together.",
                      "Pack a pretend picnic in dramatic play.",
                      "Build homes with blocks and explore water play."
              ],
              "vocabulary": "Family, Picnic, Together, Home, Share",
              "materials": [
                      "Picnic basket",
                      "Play food",
                      "Blocks",
                      "Paint",
                      "Water table",
                      "Cups",
                      "Toy people",
                      "Parachute"
              ],
              "book": "I Love You Through and Through | Bernadette Rossetti-Shustak",
              "song": "The More We Get Together",
              "circleTime": "Talk about things families do together such as eating, playing, and hugging. Read I Love You Through and Through.",
              "outdoor": "Enjoy an outdoor picnic snack together and talk about sharing food with family.",
              "observations": "Notice picnic pretend play, handprint art effort, block building, parachute participation, and water pouring.",
              "adaptations": "Younger toddlers: hand-over-hand support for handprints. Older toddlers: build taller block homes and pour independently.",
              "safety": "Supervise water table closely; use non-slip mats around wet areas.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Pack a Family Picnic",
                              "Pretend to pack food and picnic with family.",
                              "Toddlers pack a basket and pretend to picnic with dolls and friends.",
                              "Picnic basket\nPlay food\nBlanket\nPlates",
                              "Picnic, Pack, Family, Eat"
                      ],
                      [
                              "Art",
                              "Handprint Family Tree",
                              "Create a family tree using handprints.",
                              "Toddlers add handprints to a classroom family tree display.",
                              "Washable paint\nLarge paper\nWipes",
                              "Hand, Tree, Family, Love"
                      ],
                      [
                              "Sensory Play",
                              "Water Table Family Play",
                              "Pour and scoop water with cups and toy people.",
                              "Toddlers pour, scoop, and play with toy people at the water table.",
                              "Water table\nCups\nBowls\nToy people",
                              "Pour, Splash, Family, Water"
                      ],
                      [
                              "Fine Motor",
                              "Build Homes with Blocks",
                              "Stack blocks to build homes for families.",
                              "Toddlers stack blocks to create homes for toy family members.",
                              "Wooden blocks\nToy people",
                              "Build, Home, Stack, Family"
                      ],
                      [
                              "Gross Motor",
                              "Parachute Together Play",
                              "Move and shake the parachute as a group.",
                              "Toddlers hold the parachute edge and shake, lift, and lower together.",
                              "Parachute or large sheet\nSoft balls (optional)",
                              "Up, Down, Together, Shake"
                      ],
                      [
                              "Music & Movement",
                              "Move Like Family Members",
                              "Move like different family members to music.",
                              "Toddlers walk, rock, and dance like moms, dads, grandparents, and babies.",
                              "Music player\nOpen space",
                              "Move, Family, Dance, Together"
                      ]
              ]
      },
      THURSDAY: {
              "theme": "Ways We Help Our Families",
              "objectives": [
                      "Identify simple ways to help family members.",
                      "Practice caring routines in dramatic play.",
                      "Strengthen fine motor with clothespins and dot markers."
              ],
              "vocabulary": "Help, Family, Care, Clean, Together",
              "materials": [
                      "Doll clothes",
                      "Laundry basket",
                      "Dot markers",
                      "Bubble foam",
                      "Clothespins",
                      "Stuffed animals",
                      "Instruments"
              ],
              "book": "Everywhere Babies | Susan Meyers",
              "song": "If You're Happy and You Know It",
              "circleTime": "Talk about ways we help our families such as cleaning, caring, and sharing. Read Everywhere Babies.",
              "outdoor": "Play Follow My Family on the playground with a leader and followers.",
              "observations": "Watch helping language, laundry pretend play, dot marker control, clothespin squeezing, and instrument play.",
              "adaptations": "Younger toddlers: larger clothespins and fewer clothing items. Older toddlers: sort doll clothes by color or type.",
              "safety": "Supervise bubble foam and ensure clothespins are toddler-appropriate size.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Laundry and Doll Care",
                              "Wash, fold, and care for doll clothes.",
                              "Toddlers pretend to do laundry and dress baby dolls with teacher support.",
                              "Doll clothes\nLaundry basket\nBaby dolls\nWashcloths",
                              "Wash, Help, Care, Family"
                      ],
                      [
                              "Art",
                              "Dot Marker Family Portraits",
                              "Create family portraits with dot markers.",
                              "Toddlers use dot markers to make colorful family portraits.",
                              "Dot markers\nCardstock",
                              "Dot, Face, Family, Color"
                      ],
                      [
                              "Sensory Play",
                              "Bubble Foam Exploration",
                              "Explore soft bubble foam with hands and tools.",
                              "Toddlers scoop, squeeze, and explore bubble foam in a sensory bin.",
                              "Bubble foam\nSensory bin\nScoops",
                              "Foam, Soft, Scoop, Feel"
                      ],
                      [
                              "Fine Motor",
                              "Clothespin Laundry Hang",
                              "Squeeze clothespins to hang doll clothes.",
                              "Toddlers clip doll clothes onto a clothesline using clothespins.",
                              "Clothespins\nDoll clothes\nClothesline or string",
                              "Pin, Hang, Squeeze, Help"
                      ],
                      [
                              "Gross Motor",
                              "Carry Stuffed Animals Obstacle",
                              "Carry stuffed animals through a simple obstacle course.",
                              "Toddlers carry stuffed animals over, under, and around obstacles.",
                              "Stuffed animals\nSoft obstacles\nOpen space",
                              "Carry, Help, Over, Go"
                      ],
                      [
                              "Music & Movement",
                              "Instrument Play and Movement",
                              "Play instruments while moving to family songs.",
                              "Toddlers shake and tap instruments to upbeat family-themed songs.",
                              "Musical instruments\nMusic player",
                              "Shake, Tap, Music, Happy"
                      ]
              ]
      },
      FRIDAY: {
              "theme": "Celebrating the People Who Love Me",
              "objectives": [
                      "Review family vocabulary and favorite books.",
                      "Create a family keepsake handprint.",
                      "Celebrate the week with movement and music."
              ],
              "vocabulary": "Family, Love, Favorite, Together, Friend",
              "materials": [
                      "Family photos",
                      "Paint",
                      "Cardstock",
                      "Puzzles",
                      "Bubbles",
                      "Favorite sensory materials",
                      "Instruments"
              ],
              "book": "Child's favorite book from the week (class vote)",
              "song": "You Are My Sunshine",
              "circleTime": "Review vocabulary and let children vote on their favorite book from the week.",
              "outdoor": "Enjoy neighborhood or playground time with bubbles and cooperative games.",
              "observations": "Notice vocabulary recall, keepsake participation, puzzle persistence, and celebration engagement.",
              "adaptations": "Younger toddlers: footprint option for keepsake. Older toddlers: help lead the book vote and puzzle sorting.",
              "safety": "Supervise paint keepsake and bubble play closely.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Classroom Family Celebration",
                              "Revisit favorite family dramatic play choices.",
                              "Toddlers return to favorite family play areas such as kitchen, dolls, or picnic.",
                              "Baby dolls\nToy kitchen\nBlankets\nPlay food",
                              "Family, Play, Together, Home"
                      ],
                      [
                              "Art",
                              "My Family Loves Me Handprint Keepsake",
                              "Create a handprint keepsake for families.",
                              "Each toddler makes a painted handprint keepsake titled My Family Loves Me.",
                              "Washable paint\nCardstock\nWipes",
                              "Hand, Love, Family, Gift"
                      ],
                      [
                              "Sensory Play",
                              "Favorite Sensory Station",
                              "Choose a favorite sensory material from the week.",
                              "Toddlers revisit a favorite sensory station such as playdough, rice, or water.",
                              "Playdough, rice, or water materials\nTools",
                              "Feel, Play, Favorite, Soft"
                      ],
                      [
                              "Fine Motor",
                              "Family Puzzle Play",
                              "Complete simple family-themed puzzles.",
                              "Toddlers work on family or home puzzles with peer and teacher support.",
                              "Toddler puzzles\nTray",
                              "Fit, Turn, Family, Together"
                      ],
                      [
                              "Gross Motor",
                              "Bubble Chasing Games",
                              "Run, reach, and pop bubbles outdoors or in gym.",
                              "Toddlers chase and pop bubbles while practicing running and reaching.",
                              "Bubble machine or wands\nOpen space",
                              "Run, Pop, Reach, Go"
                      ],
                      [
                              "Music & Movement",
                              "Classroom Family Dance Party",
                              "Dance to favorite songs from the week.",
                              "Toddlers dance together to favorite classroom family songs.",
                              "Music player\nScarves (optional)",
                              "Dance, Happy, Together, Family"
                      ]
              ]
      },
    },
  }),
  buildWeek({
    file: "02-toddler-my-home-and-my-family-pro.txt",
    title: "My Home & My Family",
    theme: "Family Connections — My Home & My Family",
    overview: "Toddlers explore the people, routines, and spaces that make home safe and special. Every family and home is unique as children build belonging through play, art, and movement.",
    objectives: ["Identify familiar people and places at home.","Build language about home and family routines.","Strengthen fine and gross motor skills.","Engage in dramatic play with household roles.","Practice social-emotional and cooperative skills.","Create process art with creativity and expression."],
    materials: ["Toy kitchen","Baby dolls","Doll accessories","Toy furniture","Family photos","Cardboard boxes","Blocks","Washable paint","Dot markers","Crayons","Glue sticks","Construction paper","Playdough","Toy phones","Stuffed animals","Blankets","Bubble machine","Instruments","Rice/bean sensory","Toy dishes"],
    vocabulary: ["Home","Family","Bedroom","Kitchen","Together"],
    books: ["Home | Carson Ellis","The Family Book | Todd Parr","Goodnight Moon | Margaret Wise Brown","A House for Hermit Crab | Eric Carle","Everywhere Babies | Susan Meyers"],
    songs: ["Skidamarink","Twinkle Twinkle","The More We Get Together","If You're Happy and You Know It","Wheels on the Bus (family version)"],
    family: "Share one favorite thing you enjoy together at home and talk about it during circle time.",
    observations: "Observe talks about family, dramatic play, new vocabulary, fine motor, gross motor balance, social skills, problem-solving, and engagement with books and songs.",
    adaptations: "Younger Toddlers (12–24 Months): shorter activities, larger materials, more guidance, and simple dramatic play. Older Toddlers (24–36 Months): storytelling, role-play, independence, and extended home conversations.",
    dayDefs: {
      MONDAY: {
              "theme": "Homes and Who Lives Inside",
              "objectives": [
                      "Talk about what homes look like and who lives inside.",
                      "Explore pretend home play.",
                      "Paint and build homes through art and blocks."
              ],
              "vocabulary": "Home, Family, Bedroom, Kitchen, Together",
              "materials": [
                      "Family photos",
                      "Dolls",
                      "Blankets",
                      "Toy furniture",
                      "Sponges",
                      "Paint",
                      "Playdough",
                      "Blocks",
                      "Scarves"
              ],
              "book": "The Family Book | Todd Parr",
              "song": "Skidamarink",
              "circleTime": "Talk about homes and who lives inside using photos and simple questions. Read The Family Book.",
              "outdoor": "Take a neighborhood walk to look at different homes.",
              "observations": "Notice home vocabulary, pretend play, sponge painting, block building, and scarf dancing.",
              "adaptations": "Younger toddlers: larger blocks and hand-over-hand painting. Older toddlers: name rooms and extend pretend routines.",
              "safety": "Supervise paint and ensure furniture props are stable.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Pretend Home with Dolls",
                              "Explore home routines with dolls, blankets, and furniture.",
                              "Toddlers create a pretend home with dolls, blankets, and toy furniture.",
                              "Baby dolls\nBlankets\nToy furniture\nToy phones",
                              "Home, Baby, Sleep, Family"
                      ],
                      [
                              "Art",
                              "Sponge Paint a House",
                              "Create a house painting using sponges.",
                              "Toddlers sponge paint a house shape on construction paper.",
                              "Sponges\nWashable paint\nConstruction paper",
                              "House, Paint, Home, Color"
                      ],
                      [
                              "Sensory Play",
                              "Playdough House and Heart Cutters",
                              "Shape playdough homes and hearts with cutters.",
                              "Toddlers roll and cut playdough into house and heart shapes.",
                              "Playdough\nHouse and heart cutters\nTray",
                              "Squeeze, Home, Heart, Soft"
                      ],
                      [
                              "Fine Motor",
                              "Build Houses with Blocks",
                              "Stack blocks to build homes.",
                              "Toddlers stack blocks to build houses for toy people.",
                              "Wooden blocks\nToy people",
                              "Build, Stack, Home, Up"
                      ],
                      [
                              "Gross Motor",
                              "Pretend Clean the House",
                              "Crawl, stretch, and move while pretending to clean.",
                              "Toddlers crawl, stretch, and move through a pretend cleaning routine.",
                              "Soft cloths\nToy brooms\nOpen space",
                              "Clean, Crawl, Stretch, Help"
                      ],
                      [
                              "Music & Movement",
                              "Skidamarink Scarf Dance",
                              "Dance with scarves to Skidamarink.",
                              "Toddlers wave scarves and dance to Skidamarink.",
                              "Scarves\nMusic player",
                              "Dance, Love, Wave, Home"
                      ]
              ]
      },
      TUESDAY: {
              "theme": "Favorite Rooms at Home",
              "objectives": [
                      "Talk about favorite rooms such as bedrooms.",
                      "Explore bedtime routines in dramatic play.",
                      "Practice stacking and carrying through fine and gross motor."
              ],
              "vocabulary": "Home, Bedroom, Sleep, Soft, Night",
              "materials": [
                      "Dolls",
                      "Stuffed animals",
                      "Stickers",
                      "Crayons",
                      "Rice bin",
                      "Cups",
                      "Stuffed animals for carrying"
              ],
              "book": "Goodnight Moon | Margaret Wise Brown",
              "song": "Twinkle Twinkle",
              "circleTime": "Talk about favorite rooms at home and bedtime routines. Read Goodnight Moon.",
              "outdoor": "Collect nature items to create a house collage.",
              "observations": "Watch bedtime pretend play, sticker art, rice scooping, cup stacking, and obstacle carrying.",
              "adaptations": "Younger toddlers: fewer stickers and larger cups. Older toddlers: describe bedroom items and extend lullaby singing.",
              "safety": "Supervise rice bin and ensure stuffed animals are clean.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Bedtime with Dolls and Stuffed Animals",
                              "Practice bedtime routines with dolls.",
                              "Toddlers tuck dolls and stuffed animals into bed with blankets.",
                              "Baby dolls\nStuffed animals\nBlankets\nSmall beds or mats",
                              "Sleep, Night, Soft, Home"
                      ],
                      [
                              "Art",
                              "Decorate a Paper Bedroom",
                              "Decorate a bedroom scene with stickers and crayons.",
                              "Toddlers decorate a paper bedroom with stickers and crayons.",
                              "Paper\nStickers\nCrayons",
                              "Bed, Room, Stick, Color"
                      ],
                      [
                              "Sensory Play",
                              "Rice Bin Household Items",
                              "Explore rice with household items.",
                              "Toddlers scoop rice and find household items in the sensory bin.",
                              "Rice\nSensory bin\nToy dishes\nSpoons",
                              "Scoop, Pour, Home, Find"
                      ],
                      [
                              "Fine Motor",
                              "Stack Cup Towers",
                              "Stack cups into tall towers.",
                              "Toddlers stack plastic cups into towers and knock them down.",
                              "Plastic cups\nTray",
                              "Stack, Up, Cup, Build"
                      ],
                      [
                              "Gross Motor",
                              "Obstacle Carry Stuffed Animals Home",
                              "Carry stuffed animals through obstacles to get home.",
                              "Toddlers carry stuffed animals through a simple obstacle path home.",
                              "Stuffed animals\nSoft obstacles",
                              "Carry, Home, Go, Help"
                      ],
                      [
                              "Music & Movement",
                              "Lullaby Scarf Movement",
                              "Move gently with scarves to a lullaby.",
                              "Toddlers sway and move scarves slowly to Twinkle Twinkle.",
                              "Scarves\nMusic player",
                              "Soft, Sleep, Sway, Night"
                      ]
              ]
      },
      WEDNESDAY: {
              "theme": "Things Families Do Together at Home",
              "objectives": [
                      "Talk about family activities at home.",
                      "Cook pretend meals together.",
                      "Explore water scooping and pouring."
              ],
              "vocabulary": "Home, Cook, Eat, Together, Family",
              "materials": [
                      "Toy kitchen",
                      "Paint",
                      "Water table",
                      "Bowls",
                      "Grocery bags",
                      "Play food"
              ],
              "book": "Everywhere Babies | Susan Meyers",
              "song": "The More We Get Together",
              "circleTime": "Talk about things families do together at home such as cooking and eating. Read Everywhere Babies.",
              "outdoor": "Enjoy a family picnic outdoors.",
              "observations": "Notice kitchen pretend play, handprint house art, water pouring, grocery pretend, and marching.",
              "adaptations": "Younger toddlers: hand-over-hand scooping. Older toddlers: lead pretend grocery shopping.",
              "safety": "Supervise water table and kitchen props.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Cook Dinner in the Kitchen",
                              "Pretend to cook dinner for family.",
                              "Toddlers cook and serve pretend meals in the toy kitchen.",
                              "Toy kitchen\nPlay food\nPlates\nUtensils",
                              "Cook, Eat, Family, Kitchen"
                      ],
                      [
                              "Art",
                              "Family Handprint House",
                              "Create a house collage with family handprints.",
                              "Toddlers add handprints to a collaborative family house art piece.",
                              "Washable paint\nLarge paper\nWipes",
                              "Hand, House, Family, Home"
                      ],
                      [
                              "Sensory Play",
                              "Water Table Scoop and Pour",
                              "Scoop and pour water with cups and bowls.",
                              "Toddlers scoop and pour water at the water table.",
                              "Water table\nCups\nBowls\nSpoons",
                              "Pour, Splash, Water, Scoop"
                      ],
                      [
                              "Fine Motor",
                              "Scoop and Pour Practice",
                              "Practice scooping and pouring with tools.",
                              "Toddlers practice scooping and pouring with cups and spoons.",
                              "Cups\nSpoons\nSensory bin materials",
                              "Scoop, Pour, Fill, Empty"
                      ],
                      [
                              "Gross Motor",
                              "Pretend Grocery Shopping",
                              "Walk and carry bags during pretend grocery shopping.",
                              "Toddlers carry grocery bags through a pretend store path.",
                              "Reusable bags\nPlay food\nCones or markers",
                              "Shop, Carry, Walk, Home"
                      ],
                      [
                              "Music & Movement",
                              "March with Grocery Bags",
                              "March to music while carrying grocery bags.",
                              "Toddlers march around the room carrying lightweight grocery bags.",
                              "Lightweight bags\nMusic player",
                              "March, Bag, Go, Home"
                      ]
              ]
      },
      THURSDAY: {
              "theme": "Helping at Home",
              "objectives": [
                      "Talk about ways to help at home.",
                      "Practice washing and caring for dolls.",
                      "Strengthen fine motor with clothespins and dot markers."
              ],
              "vocabulary": "Help, Home, Wash, Clean, Family",
              "materials": [
                      "Baby dolls",
                      "Washcloths",
                      "Dot markers",
                      "Bubble foam",
                      "Clothespins",
                      "Doll clothes",
                      "Brooms"
              ],
              "book": "A House for Hermit Crab | Eric Carle",
              "song": "If You're Happy and You Know It",
              "circleTime": "Talk about helping at home and caring for others. Read A House for Hermit Crab.",
              "outdoor": "Sweep the playground with child-size brooms.",
              "observations": "Watch doll washing, dot marker art, bubble foam play, clothespin squeezing, and clothesline hanging.",
              "adaptations": "Younger toddlers: larger clothespins. Older toddlers: sort clothes and describe helping jobs.",
              "safety": "Supervise water play with dolls and bubble foam.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Wash Baby Dolls",
                              "Practice gentle washing and caring for baby dolls.",
                              "Toddlers wash and dry baby dolls with washcloths and tubs.",
                              "Baby dolls\nWashcloths\nSmall tubs\nTowels",
                              "Wash, Care, Baby, Help"
                      ],
                      [
                              "Art",
                              "Dot Marker Family Home",
                              "Create a family home picture with dot markers.",
                              "Toddlers use dot markers to decorate a family home scene.",
                              "Dot markers\nLarge paper",
                              "Dot, Home, Family, Color"
                      ],
                      [
                              "Sensory Play",
                              "Bubble Foam Sensory Bin",
                              "Explore bubble foam with hands and scoops.",
                              "Toddlers explore bubble foam in a sensory bin.",
                              "Bubble foam\nSensory bin\nScoops",
                              "Foam, Soft, Feel, Scoop"
                      ],
                      [
                              "Fine Motor",
                              "Clothespin Laundry",
                              "Clip doll clothes onto a clothesline.",
                              "Toddlers squeeze clothespins to hang doll laundry.",
                              "Clothespins\nDoll clothes\nClothesline",
                              "Pin, Hang, Squeeze, Help"
                      ],
                      [
                              "Gross Motor",
                              "Hang Doll Clothes on Clothesline",
                              "Reach and hang clothes on a low clothesline.",
                              "Toddlers reach up and hang doll clothes on a child-height clothesline.",
                              "Doll clothes\nLow clothesline\nClothespins",
                              "Hang, Reach, Up, Help"
                      ],
                      [
                              "Music & Movement",
                              "Instrument Play",
                              "Play instruments while singing favorite songs.",
                              "Toddlers shake and tap instruments during group music time.",
                              "Musical instruments\nMusic player",
                              "Shake, Tap, Sing, Happy"
                      ]
              ]
      },
      FRIDAY: {
              "theme": "Welcome to My Home Celebration",
              "objectives": [
                      "Review home and family vocabulary.",
                      "Create a Welcome to My Home keepsake.",
                      "Celebrate with favorite sensory and music activities."
              ],
              "vocabulary": "Home, Family, Favorite, Together, Love",
              "materials": [
                      "Photos",
                      "Paint",
                      "Cardstock",
                      "Puzzles",
                      "Bubbles",
                      "Parachute",
                      "Favorite sensory materials"
              ],
              "book": "Child's favorite book from the week (class choice)",
              "song": "Wheels on the Bus (family version)",
              "circleTime": "Review the week and let children choose their favorite home story.",
              "outdoor": "Take a nature walk or playground time with bubbles.",
              "observations": "Notice vocabulary recall, keepsake participation, puzzle work, parachute play, and celebration joy.",
              "adaptations": "Younger toddlers: teacher-assisted photo gluing. Older toddlers: describe their keepsake to a friend.",
              "safety": "Supervise keepsake art and bubble play.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Favorite Home Play Choices",
                              "Revisit favorite home dramatic play areas.",
                              "Toddlers choose favorite home play such as kitchen, bedtime, or cleaning.",
                              "Toy kitchen\nDolls\nBlankets\nCleaning props",
                              "Home, Play, Family, Together"
                      ],
                      [
                              "Art",
                              "Welcome to My Home House Keepsake",
                              "Create a house keepsake with photo or self-portrait.",
                              "Toddlers decorate a house keepsake with a family photo or self-portrait.",
                              "Cardstock house cutouts\nPhotos or mirrors\nCrayons\nGlue sticks",
                              "Home, Welcome, Family, Love"
                      ],
                      [
                              "Sensory Play",
                              "Favorite Sensory Station",
                              "Revisit a favorite sensory material from the week.",
                              "Toddlers explore a favorite sensory station from the week.",
                              "Playdough, rice, or water materials",
                              "Feel, Play, Favorite, Soft"
                      ],
                      [
                              "Fine Motor",
                              "Family Puzzle Play",
                              "Work on family-themed puzzles.",
                              "Toddlers complete simple family puzzles with support.",
                              "Toddler puzzles",
                              "Fit, Turn, Family, Together"
                      ],
                      [
                              "Gross Motor",
                              "Bubbles and Parachute Play",
                              "Play with bubbles and parachute together.",
                              "Toddlers chase bubbles and shake the parachute as a group.",
                              "Bubbles\nParachute or sheet",
                              "Pop, Up, Down, Together"
                      ],
                      [
                              "Music & Movement",
                              "Favorite Songs from the Week",
                              "Sing and dance to favorite classroom songs.",
                              "Toddlers sing and dance to favorite songs from the week.",
                              "Music player\nScarves",
                              "Sing, Dance, Happy, Home"
                      ]
              ]
      },
    },
  }),
  buildWeek({
    file: "03-toddler-caring-hearts-pro.txt",
    title: "Caring Hearts",
    theme: "Family Connections — Caring Hearts",
    overview: "Toddlers explore kindness, empathy, and caring through helping, sharing, comforting, art, music, books, and daily routines.",
    objectives: ["Recognize and express kind behaviors.","Build empathy for others.","Strengthen communication and social-emotional skills.","Develop fine and gross motor skills.","Create process art with expression.","Practice helping during classroom routines."],
    materials: ["Baby dolls","Stuffed animals","Doctor kit","Bandages","Blankets","Washcloths","Toy kitchen","Play food","Blocks","Playdough","Washable paint","Cardstock","Dot markers","Stickers","Glue sticks","Sensory bin","Pom-poms","Scoops","Instruments","Scarves","Bubble machine"],
    vocabulary: ["Kind","Help","Share","Friend","Care"],
    books: ["Kindness Makes Us Strong | Pat Zietlow Miller","Hands Are Not for Hitting | Martine Agassi","Llama Llama Time to Share | Anna Dewdney","Bear Says Thanks | Karma Wilson","Have You Filled a Bucket Today? | Carol McCloud"],
    songs: ["Skidamarink","The More We Get Together","If You're Happy and You Know It","You Are My Sunshine","This Little Light of Mine"],
    family: "Do one act of kindness together each day and share a favorite kindness moment with the class.",
    observations: "Observe kindness behaviors, sharing, kind words, dramatic play, fine and gross motor skills, communication, and emotional regulation.",
    adaptations: "Younger Toddlers (12–24 Months): simple helping tasks, teacher-modeled sharing, larger manipulatives, and brief groups. Older Toddlers (24–36 Months): role-play conversations, cooperative games, independent helping, and expanded feelings talk.",
    dayDefs: {
      MONDAY: {
              "theme": "Kind to Friends and Teachers",
              "objectives": [
                      "Talk about ways to be kind.",
                      "Practice caring for baby dolls.",
                      "Explore pom-poms and caring movement."
              ],
              "vocabulary": "Kind, Help, Share, Friend, Care",
              "materials": [
                      "Baby dolls",
                      "Blankets",
                      "Bottles",
                      "Sponges",
                      "Paint",
                      "Pom-poms",
                      "Tongs",
                      "Scoops",
                      "Scarves"
              ],
              "book": "Kindness Makes Us Strong | Pat Zietlow Miller",
              "song": "Skidamarink",
              "circleTime": "Talk about ways to be kind to friends and teachers. Read Kindness Makes Us Strong.",
              "outdoor": "Help in nature by picking up sticks and leaves together.",
              "observations": "Notice kind words, doll care, sponge painting, pom-pom transfer, and scarf dancing.",
              "adaptations": "Younger toddlers: hand-over-hand doll care. Older toddlers: describe kind actions.",
              "safety": "Supervise pom-pom play and ensure tools are toddler-safe.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Care for Baby Dolls",
                              "Feed, rock, and comfort baby dolls with blankets.",
                              "Toddlers feed, rock, and cover baby dolls with blankets.",
                              "Baby dolls\nBlankets\nBottles\nToy food",
                              "Care, Baby, Kind, Help"
                      ],
                      [
                              "Art",
                              "Heart Sponge Painting",
                              "Create heart art using sponge painting.",
                              "Toddlers sponge paint hearts on cardstock.",
                              "Heart sponges\nWashable paint\nCardstock",
                              "Heart, Paint, Kind, Love"
                      ],
                      [
                              "Sensory Play",
                              "Soft Pom-Pom Bin",
                              "Explore a bin of soft pom-poms.",
                              "Toddlers scoop, squeeze, and explore soft pom-poms.",
                              "Pom-poms\nSensory bin\nScoops",
                              "Soft, Feel, Pom-pom, Kind"
                      ],
                      [
                              "Fine Motor",
                              "Transfer Pom-Poms with Tongs",
                              "Transfer pom-poms using tongs and scoops.",
                              "Toddlers transfer pom-poms between containers with tongs and scoops.",
                              "Pom-poms\nTongs\nScoops\nBowls",
                              "Pick, Move, Help, Care"
                      ],
                      [
                              "Gross Motor",
                              "Carry Dolls Obstacle Course",
                              "Carry dolls carefully through obstacles.",
                              "Toddlers carry baby dolls through a gentle obstacle course.",
                              "Baby dolls\nSoft obstacles",
                              "Carry, Care, Go, Help"
                      ],
                      [
                              "Music & Movement",
                              "Skidamarink Scarf Dance",
                              "Dance with scarves to Skidamarink.",
                              "Toddlers dance with scarves to Skidamarink.",
                              "Scarves\nMusic player",
                              "Dance, Kind, Love, Together"
                      ]
              ]
      },
      TUESDAY: {
              "theme": "Kind Words and Gentle Hands",
              "objectives": [
                      "Practice using kind words.",
                      "Explore doctor caring play.",
                      "Move like animals who help friends."
              ],
              "vocabulary": "Kind, Gentle, Help, Friend, Care",
              "materials": [
                      "Doctor kit",
                      "Dolls",
                      "Stuffed animals",
                      "Stickers",
                      "Dot markers",
                      "Bubbles",
                      "Large beads",
                      "Instruments"
              ],
              "book": "Hands Are Not for Hitting | Martine Agassi",
              "song": "If You're Happy and You Know It",
              "circleTime": "Talk about kind words and gentle hands. Read Hands Are Not for Hitting.",
              "outdoor": "Play Help a Friend relay with soft toys.",
              "observations": "Watch doctor pretend play, heart decorating, beading, animal movement, and instrument marching.",
              "adaptations": "Younger toddlers: larger beads. Older toddlers: use kind words during doctor play.",
              "safety": "Sanitize doctor kit items between uses.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Pretend Doctor Caring",
                              "Care for dolls and stuffed animals at a doctor station.",
                              "Toddlers bandage and care for dolls and stuffed animals.",
                              "Doctor kit\nBandages\nDolls\nStuffed animals",
                              "Doctor, Help, Care, Kind"
                      ],
                      [
                              "Art",
                              "Decorate Paper Hearts",
                              "Decorate hearts with stickers and dot markers.",
                              "Toddlers decorate paper hearts with stickers and dot markers.",
                              "Paper hearts\nStickers\nDot markers",
                              "Heart, Stick, Kind, Love"
                      ],
                      [
                              "Sensory Play",
                              "Bubble Sensory Play",
                              "Explore and pop bubbles together.",
                              "Toddlers reach, clap, and pop bubbles in a sensory experience.",
                              "Bubbles\nWands or machine",
                              "Pop, Bubble, Reach, Fun"
                      ],
                      [
                              "Fine Motor",
                              "Thread Large Beads",
                              "Thread large beads for a kindness bracelet.",
                              "Toddlers thread large beads onto string with teacher help.",
                              "Large beads\nString or pipe cleaners",
                              "Thread, Bead, Make, Kind"
                      ],
                      [
                              "Gross Motor",
                              "Animal Movement Helping Friends",
                              "Move like animals who help their friends.",
                              "Toddlers hop, crawl, and walk like animals helping friends.",
                              "Open space\nAnimal picture cards (optional)",
                              "Hop, Crawl, Help, Friend"
                      ],
                      [
                              "Music & Movement",
                              "March with Instruments",
                              "March and play instruments together.",
                              "Toddlers march and shake instruments to upbeat music.",
                              "Instruments\nMusic player",
                              "March, Shake, Music, Happy"
                      ]
              ]
      },
      WEDNESDAY: {
              "theme": "Helping Our Families",
              "objectives": [
                      "Talk about helping family members.",
                      "Cook pretend meals together.",
                      "Create a friendship handprint mural."
              ],
              "vocabulary": "Help, Family, Share, Friend, Together",
              "materials": [
                      "Toy kitchen",
                      "Paint",
                      "Water table",
                      "Cups",
                      "Bowls",
                      "Grocery props"
              ],
              "book": "Bear Says Thanks | Karma Wilson",
              "song": "The More We Get Together",
              "circleTime": "Talk about ways we help our families. Read Bear Says Thanks.",
              "outdoor": "Enjoy a pretend picnic outdoors.",
              "observations": "Notice kitchen helping play, handprint mural, water pouring, grocery pretend, and freeze dance.",
              "adaptations": "Younger toddlers: hand-over-hand pouring. Older toddlers: lead pretend grocery shopping.",
              "safety": "Supervise water table and kitchen play.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Pretend Meals in the Kitchen",
                              "Prepare and share pretend meals.",
                              "Toddlers cook and serve pretend meals in the kitchen.",
                              "Toy kitchen\nPlay food\nPlates",
                              "Cook, Share, Help, Eat"
                      ],
                      [
                              "Art",
                              "Friendship Handprint Mural",
                              "Add handprints to a friendship mural.",
                              "Toddlers add handprints to a classroom friendship mural.",
                              "Washable paint\nLarge paper\nWipes",
                              "Hand, Friend, Together, Kind"
                      ],
                      [
                              "Sensory Play",
                              "Water Table Scoop and Pour",
                              "Scoop and pour water with cups and bowls.",
                              "Toddlers scoop and pour water at the water table.",
                              "Water table\nCups\nBowls",
                              "Pour, Water, Scoop, Share"
                      ],
                      [
                              "Fine Motor",
                              "Scoop and Pour Practice",
                              "Practice scooping and pouring with tools.",
                              "Toddlers practice scooping and pouring into containers.",
                              "Cups\nSpoons\nSensory materials",
                              "Scoop, Pour, Fill, Help"
                      ],
                      [
                              "Gross Motor",
                              "Pretend Grocery Shopping",
                              "Walk and carry items during pretend grocery shopping.",
                              "Toddlers carry baskets and bags during pretend grocery shopping.",
                              "Baskets\nPlay food\nBags",
                              "Shop, Carry, Help, Go"
                      ],
                      [
                              "Music & Movement",
                              "Freeze Dance Friendship Songs",
                              "Dance and freeze to friendship songs.",
                              "Toddlers dance and freeze to friendship-themed songs.",
                              "Music player\nOpen space",
                              "Dance, Stop, Friend, Fun"
                      ]
              ]
      },
      THURSDAY: {
              "theme": "Sharing and Working Together",
              "objectives": [
                      "Talk about sharing toys.",
                      "Build together with blocks.",
                      "Practice teamwork with parachute play."
              ],
              "vocabulary": "Share, Help, Friend, Together, Kind",
              "materials": [
                      "Blocks",
                      "Paint",
                      "Cardboard",
                      "Playdough",
                      "Cookie cutters",
                      "Rolling pins",
                      "Parachute",
                      "Balls",
                      "Scarves"
              ],
              "book": "Llama Llama Time to Share | Anna Dewdney",
              "song": "You Are My Sunshine",
              "circleTime": "Talk about sharing toys and taking turns. Read Llama Llama Time to Share.",
              "outdoor": "Play cooperative ball games with friends.",
              "observations": "Watch block cooperation, kindness rock painting, playdough sharing, parachute teamwork, and partner dancing.",
              "adaptations": "Younger toddlers: build together with teacher support. Older toddlers: negotiate turns with peers.",
              "safety": "Supervise block building and ball games.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Build Together with Blocks",
                              "Build structures together with peers.",
                              "Toddlers build block structures together with teacher facilitation.",
                              "Wooden blocks\nToy people",
                              "Build, Share, Together, Help"
                      ],
                      [
                              "Art",
                              "Paint Kindness Rocks",
                              "Paint kindness messages on paper or cardboard rocks.",
                              "Toddlers paint kindness rocks on paper or cardboard.",
                              "Paint\nCardboard or paper rocks\nBrushes",
                              "Paint, Kind, Share, Care"
                      ],
                      [
                              "Sensory Play",
                              "Playdough Sharing Table",
                              "Share playdough tools and create together.",
                              "Toddlers share playdough, cutters, and rolling pins.",
                              "Playdough\nCookie cutters\nRolling pins",
                              "Share, Roll, Soft, Together"
                      ],
                      [
                              "Fine Motor",
                              "Cookie Cutters and Rolling Pins",
                              "Roll and cut playdough shapes.",
                              "Toddlers roll and cut playdough with cookie cutters.",
                              "Playdough\nCookie cutters\nRolling pins",
                              "Roll, Cut, Press, Share"
                      ],
                      [
                              "Gross Motor",
                              "Parachute Teamwork",
                              "Work together to move the parachute.",
                              "Toddlers shake and lift the parachute together.",
                              "Parachute or sheet\nSoft balls",
                              "Up, Down, Team, Together"
                      ],
                      [
                              "Music & Movement",
                              "Partner Dancing with Scarves",
                              "Dance with a partner using scarves.",
                              "Toddlers dance with a partner while waving scarves.",
                              "Scarves\nMusic player",
                              "Dance, Partner, Friend, Together"
                      ]
              ]
      },
      FRIDAY: {
              "theme": "Kindness Celebration",
              "objectives": [
                      "Review kindness vocabulary.",
                      "Create a kindness keepsake.",
                      "Celebrate with bubbles and dance."
              ],
              "vocabulary": "Kind, Help, Share, Friend, Care",
              "materials": [
                      "Paint",
                      "Cardstock",
                      "Puzzles",
                      "Bubbles",
                      "Favorite sensory materials",
                      "Music player"
              ],
              "book": "Child's favorite kindness book from the week (class choice)",
              "song": "This Little Light of Mine",
              "circleTime": "Review kindness words and let children choose their favorite story.",
              "outdoor": "Take a nature walk and share beautiful things you find.",
              "observations": "Notice kindness recall, keepsake participation, puzzle cooperation, bubble chasing, and dance party joy.",
              "adaptations": "Younger toddlers: footprint flower option. Older toddlers: help a friend with puzzles.",
              "safety": "Supervise paint keepsake and bubble play.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Kindness Role Play Review",
                              "Revisit favorite caring dramatic play stations.",
                              "Toddlers return to favorite caring play areas.",
                              "Dolls\nDoctor kit\nKitchen\nBlankets",
                              "Care, Kind, Help, Friend"
                      ],
                      [
                              "Art",
                              "Kindness Grows Here Handprint Flower",
                              "Create a handprint flower kindness keepsake.",
                              "Each toddler adds a handprint petal to a Kindness Grows Here flower.",
                              "Washable paint\nCardstock\nWipes",
                              "Hand, Flower, Kind, Grow"
                      ],
                      [
                              "Sensory Play",
                              "Favorite Sensory Station",
                              "Choose a favorite sensory activity from the week.",
                              "Toddlers explore a favorite sensory station.",
                              "Playdough, pom-poms, or water materials",
                              "Feel, Play, Favorite, Soft"
                      ],
                      [
                              "Fine Motor",
                              "Puzzles with a Friend",
                              "Complete puzzles alongside a friend.",
                              "Toddlers work on puzzles with peer and teacher support.",
                              "Toddler puzzles",
                              "Fit, Turn, Friend, Together"
                      ],
                      [
                              "Gross Motor",
                              "Bubble Chase Games",
                              "Chase and pop bubbles together.",
                              "Toddlers run and reach to pop bubbles.",
                              "Bubbles\nOpen space",
                              "Run, Pop, Reach, Fun"
                      ],
                      [
                              "Music & Movement",
                              "Kindness Dance Party",
                              "Dance to kindness and friendship songs.",
                              "Toddlers dance to kindness and friendship songs.",
                              "Music player\nScarves",
                              "Dance, Kind, Happy, Friend"
                      ]
              ]
      },
    },
  }),
  buildWeek({
    file: "04-toddler-we-belong-together-pro.txt",
    title: "We Belong Together",
    theme: "Family Connections — We Belong Together",
    overview: "Toddlers celebrate friendships and relationships at school through cooperative play, sharing, and kindness that creates a caring classroom community where everyone belongs.",
    objectives: ["Build friendships with classmates.","Practice sharing and taking turns.","Strengthen communication and cooperation.","Develop fine and gross motor skills.","Create open-ended art together.","Build confidence and a sense of belonging."],
    materials: ["Large butcher paper","Washable paint","Dot markers","Crayons","Glue sticks","Stickers","Blocks","Baby dolls","Instruments","Parachute or sheet","Bubbles","Bean bags","Balls","Playdough","Cardboard boxes","Scarves","Family and classroom photos","Friendship books","Sensory bin materials"],
    vocabulary: ["Friend","Together","Share","Help","Belong"],
    books: ["The Invisible String | Patrice Karst","Best Friends Busy Friends | Susan Rollings","Should I Share My Ice Cream? | Mo Willems","The More We Get Together | Maryann Cocca-Leffler","Friends Stick Together | Hannah E. Harrison"],
    songs: ["The More We Get Together","If You're Happy and You Know It","Skidamarink","Make New Friends","Hokey Pokey"],
    family: "Ask families about a new friend this month and continue kindness, helping, and friendship talk at home.",
    observations: "Observe cooperative play, sharing, kind words, group participation, friendship building, fine and gross motor skills, and communication.",
    adaptations: "Younger Toddlers (12–24 Months): shorter groups, simple partner play, larger materials, and extra support. Older Toddlers (24–36 Months): cooperative problem-solving, peer conversations, independent choices, and extended dramatic play.",
    dayDefs: {
      MONDAY: {
              "theme": "What Makes a Good Friend",
              "objectives": [
                      "Talk about qualities of a good friend.",
                      "Build a block town together.",
                      "Create a friendship mural."
              ],
              "vocabulary": "Friend, Together, Share, Help, Belong",
              "materials": [
                      "Blocks",
                      "Paint",
                      "Butcher paper",
                      "Rainbow rice",
                      "Scoops",
                      "Balls",
                      "Scarves"
              ],
              "book": "Best Friends Busy Friends | Susan Rollings",
              "song": "The More We Get Together",
              "circleTime": "Talk about what makes a good friend. Read Best Friends Busy Friends.",
              "outdoor": "Play bubble catching games with friends.",
              "observations": "Notice cooperative building, mural participation, rice scooping, partner ball rolling, and scarf dancing.",
              "adaptations": "Younger toddlers: roll balls with teacher. Older toddlers: describe friends' qualities.",
              "safety": "Supervise block building and outdoor bubble play.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Build a Block Town Together",
                              "Build a town together with blocks.",
                              "Toddlers build a block town together with teacher support.",
                              "Wooden blocks\nToy people\nCars (optional)",
                              "Build, Town, Friend, Together"
                      ],
                      [
                              "Art",
                              "Friendship Mural with Handprints",
                              "Add handprints and fingerprints to a friendship mural.",
                              "Toddlers add handprints and fingerprints to a large friendship mural.",
                              "Butcher paper\nWashable paint\nWipes",
                              "Hand, Friend, Together, Belong"
                      ],
                      [
                              "Sensory Play",
                              "Rainbow Rice Scoop Play",
                              "Scoop and pour rainbow rice with cups.",
                              "Toddlers scoop and pour rainbow rice in a sensory bin.",
                              "Rainbow rice\nSensory bin\nCups\nScoops",
                              "Scoop, Pour, Color, Share"
                      ],
                      [
                              "Fine Motor",
                              "Build Towers Together",
                              "Stack blocks into towers with a friend.",
                              "Toddlers build block towers together.",
                              "Wooden blocks\nTray",
                              "Stack, Up, Friend, Together"
                      ],
                      [
                              "Gross Motor",
                              "Roll Balls with a Partner",
                              "Roll balls back and forth with a partner.",
                              "Toddlers roll balls back and forth with a partner.",
                              "Soft balls\nOpen space",
                              "Roll, Ball, Partner, Share"
                      ],
                      [
                              "Music & Movement",
                              "Friendship Scarf Dance",
                              "Dance with scarves to friendship songs.",
                              "Toddlers dance with scarves to friendship songs.",
                              "Scarves\nMusic player",
                              "Dance, Friend, Wave, Together"
                      ]
              ]
      },
      TUESDAY: {
              "theme": "Kind Words for Classmates",
              "objectives": [
                      "Practice kind words for friends.",
                      "Build together with cardboard boxes.",
                      "Make friendship bracelets."
              ],
              "vocabulary": "Friend, Share, Kind, Help, Together",
              "materials": [
                      "Cardboard boxes",
                      "Large beads",
                      "Yarn",
                      "Playdough",
                      "Pipe cleaners",
                      "Parachute"
              ],
              "book": "Should I Share My Ice Cream? | Mo Willems",
              "song": "Make New Friends",
              "circleTime": "Practice kind words for classmates. Read Should I Share My Ice Cream?",
              "outdoor": "Play follow-the-leader with friends.",
              "observations": "Watch box building cooperation, bracelet making, bead threading, partner obstacles, and parachute games.",
              "adaptations": "Younger toddlers: teacher-assisted bracelet making. Older toddlers: lead follow-the-leader.",
              "safety": "Ensure beads are large and yarn is supervised.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Build with Cardboard Boxes Together",
                              "Create structures together with boxes.",
                              "Toddlers build forts and structures with cardboard boxes.",
                              "Cardboard boxes\nTape (teacher use)\nMarkers",
                              "Build, Box, Friend, Together"
                      ],
                      [
                              "Art",
                              "Friendship Bracelets",
                              "Make friendship bracelets with large beads and yarn.",
                              "Toddlers string large beads on yarn with teacher assistance.",
                              "Large beads\nYarn\nTape for ends",
                              "Bead, Friend, Make, Share"
                      ],
                      [
                              "Sensory Play",
                              "Playdough Sharing Table",
                              "Share playdough and tools with friends.",
                              "Toddlers share playdough and tools at a group table.",
                              "Playdough\nRolling pins\nCutters",
                              "Share, Roll, Soft, Friend"
                      ],
                      [
                              "Fine Motor",
                              "Thread Beads for Friends",
                              "Thread beads onto pipe cleaners or yarn.",
                              "Toddlers thread beads to make gifts for friends.",
                              "Large beads\nPipe cleaners or yarn",
                              "Thread, Bead, Gift, Friend"
                      ],
                      [
                              "Gross Motor",
                              "Partner Obstacle Course",
                              "Move through obstacles with a partner.",
                              "Toddlers complete a simple obstacle course with a partner.",
                              "Soft obstacles\nCones",
                              "Go, Partner, Help, Together"
                      ],
                      [
                              "Music & Movement",
                              "Parachute Games",
                              "Play parachute games together.",
                              "Toddlers play up-and-down parachute games together.",
                              "Parachute or sheet\nSoft balls",
                              "Up, Down, Together, Friend"
                      ]
              ]
      },
      WEDNESDAY: {
              "theme": "Helping Each Other",
              "objectives": [
                      "Talk about helping classmates.",
                      "Practice classroom helper roles.",
                      "Paint a classroom friendship tree."
              ],
              "vocabulary": "Help, Friend, Together, Share, Belong",
              "materials": [
                      "Helper props",
                      "Paint",
                      "Water table",
                      "Pom-poms",
                      "Scoops",
                      "Bean bags",
                      "Instruments"
              ],
              "book": "Friends Stick Together | Hannah E. Harrison",
              "song": "Skidamarink",
              "circleTime": "Talk about helping each other at school. Read Friends Stick Together.",
              "outdoor": "Take a nature walk with a buddy.",
              "observations": "Notice helper role play, friendship tree painting, pom-pom transfer, bean bag tossing, and instrument marching.",
              "adaptations": "Younger toddlers: walk with teacher buddy. Older toddlers: take turns as classroom helper.",
              "safety": "Supervise water table and bean bag toss.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Classroom Helper Station",
                              "Practice classroom helper jobs.",
                              "Toddlers pretend to be classroom helpers with simple jobs.",
                              "Helper vests\nSmall brooms\nSpray bottles (empty)\nTowels",
                              "Help, Job, Friend, Care"
                      ],
                      [
                              "Art",
                              "Paint a Classroom Friendship Tree",
                              "Paint a friendship tree for the classroom.",
                              "Toddlers paint a large classroom friendship tree together.",
                              "Large paper tree outline\nPaint\nBrushes",
                              "Paint, Tree, Friend, Together"
                      ],
                      [
                              "Sensory Play",
                              "Water Table Shared Pouring",
                              "Pour and share water play together.",
                              "Toddlers pour and share water play at the table.",
                              "Water table\nCups\nPitchers",
                              "Pour, Share, Water, Friend"
                      ],
                      [
                              "Fine Motor",
                              "Transfer Pom-Poms with Scoops",
                              "Transfer pom-poms between containers.",
                              "Toddlers transfer pom-poms with scoops and tongs.",
                              "Pom-poms\nScoops\nTongs\nBowls",
                              "Scoop, Move, Share, Help"
                      ],
                      [
                              "Gross Motor",
                              "Bean Bag Toss with a Partner",
                              "Toss bean bags to a partner.",
                              "Toddlers toss bean bags back and forth with a partner.",
                              "Bean bags\nTargets or hoops",
                              "Toss, Catch, Partner, Friend"
                      ],
                      [
                              "Music & Movement",
                              "March with Instruments",
                              "March and play instruments as a group.",
                              "Toddlers march and play instruments together.",
                              "Instruments\nMusic player",
                              "March, Shake, Together, Friend"
                      ]
              ]
      },
      THURSDAY: {
              "theme": "Things We Enjoy Together",
              "objectives": [
                      "Talk about favorite activities with friends.",
                      "Enjoy a pretend classroom picnic.",
                      "Create heart art with classmates."
              ],
              "vocabulary": "Friend, Together, Share, Love, Belong",
              "materials": [
                      "Picnic props",
                      "Paint",
                      "Paper hearts",
                      "Bubble foam",
                      "Stickers",
                      "Chalk"
              ],
              "book": "The Invisible String | Patrice Karst",
              "song": "If You're Happy and You Know It",
              "circleTime": "Talk about things we enjoy doing together and connections that keep us close. Read The Invisible String (simplified).",
              "outdoor": "Draw friendship chalk pictures on the playground.",
              "observations": "Watch picnic pretend play, fingerprint hearts, bubble foam play, sticker collages, and freeze dance.",
              "adaptations": "Younger toddlers: teacher-assisted fingerprints. Older toddlers: choose favorite songs for music time.",
              "safety": "Supervise bubble foam and chalk play.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Pretend Classroom Picnic",
                              "Set up and enjoy a pretend picnic with friends.",
                              "Toddlers set up blankets and enjoy a pretend classroom picnic.",
                              "Blankets\nPlay food\nPlates\nCups",
                              "Picnic, Share, Friend, Eat"
                      ],
                      [
                              "Art",
                              "Paper Hearts with Classmate Fingerprints",
                              "Decorate hearts with classmates' fingerprints.",
                              "Toddlers add fingerprints to paper hearts for classmates.",
                              "Paper hearts\nWashable ink or paint\nWipes",
                              "Heart, Friend, Press, Together"
                      ],
                      [
                              "Sensory Play",
                              "Bubble Foam Exploration",
                              "Explore bubble foam together.",
                              "Toddlers explore bubble foam in a shared sensory bin.",
                              "Bubble foam\nSensory bin\nScoops",
                              "Foam, Soft, Feel, Share"
                      ],
                      [
                              "Fine Motor",
                              "Sticker Collage for Friends",
                              "Create sticker collages to share.",
                              "Toddlers make sticker collages for friends or the classroom.",
                              "Stickers\nPaper\nTray",
                              "Stick, Share, Friend, Make"
                      ],
                      [
                              "Gross Motor",
                              "Dance and Freeze Game",
                              "Dance together and freeze when the music stops.",
                              "Toddlers dance together and freeze when the music stops.",
                              "Music player\nOpen space",
                              "Dance, Stop, Friend, Fun"
                      ],
                      [
                              "Music & Movement",
                              "Favorite Songs Children Choose",
                              "Sing favorite songs chosen by the children.",
                              "Toddlers vote on and sing favorite classroom songs.",
                              "Music player\nSong picture cards (optional)",
                              "Sing, Choose, Happy, Together"
                      ]
              ]
      },
      FRIDAY: {
              "theme": "Celebrating Our Classroom Family",
              "objectives": [
                      "Celebrate families, kindness, and friendship.",
                      "Create a classroom friendship canvas keepsake.",
                      "Enjoy a month-end celebration."
              ],
              "vocabulary": "Friend, Together, Belong, Share, Love",
              "materials": [
                      "Paint",
                      "Canvas or large paper",
                      "Puzzles",
                      "Bubbles",
                      "Favorite sensory materials",
                      "Music player"
              ],
              "book": "Child's favorite book from the month (class vote)",
              "song": "Hokey Pokey",
              "circleTime": "Celebrate families, kindness, and friendship from the month. Vote on a favorite story.",
              "outdoor": "Enjoy a celebration with bubbles, music, and cooperative games.",
              "observations": "Notice celebration engagement, collaborative keepsake participation, puzzle building, bubble dancing, and group joy.",
              "adaptations": "Younger toddlers: individual keepsake page. Older toddlers: help plan celebration choices.",
              "safety": "Supervise paint canvas and outdoor celebration activities.",
              "acts": [
                      [
                              "Dramatic Play",
                              "Classroom Family Celebration Play",
                              "Revisit favorite friendship dramatic play areas.",
                              "Toddlers choose favorite friendship play areas to celebrate the month.",
                              "Blocks\nDolls\nKitchen\nHelper props",
                              "Friend, Play, Together, Belong"
                      ],
                      [
                              "Art",
                              "Our Classroom Family Friendship Canvas",
                              "Add handprints to a collaborative friendship canvas.",
                              "Each toddler adds a handprint to Our Classroom Family Friendship Canvas.",
                              "Canvas or large paper\nWashable paint\nWipes",
                              "Hand, Friend, Family, Together"
                      ],
                      [
                              "Sensory Play",
                              "Favorite Sensory from the Month",
                              "Revisit a favorite sensory activity from the month.",
                              "Toddlers explore a favorite sensory station from the month.",
                              "Materials from prior weeks",
                              "Feel, Play, Favorite, Friend"
                      ],
                      [
                              "Fine Motor",
                              "Friendship Puzzle Building",
                              "Build puzzles together with friends.",
                              "Toddlers work on friendship-themed puzzles together.",
                              "Toddler puzzles",
                              "Fit, Build, Friend, Together"
                      ],
                      [
                              "Gross Motor",
                              "Bubble Dance Party",
                              "Dance and chase bubbles together.",
                              "Toddlers dance and chase bubbles in a celebration dance party.",
                              "Bubbles\nMusic player\nOpen space",
                              "Dance, Pop, Happy, Friend"
                      ],
                      [
                              "Music & Movement",
                              "Month Favorite Songs Celebration",
                              "Sing and dance to favorite songs from the month.",
                              "Toddlers sing and dance to favorite songs from the Family Connections month.",
                              "Music player\nScarves",
                              "Sing, Dance, Celebrate, Together"
                      ]
              ]
      },
    },
  }),
];
function renderWeek(week) {
  const dayOrder = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  return [
    "TITLE:", week.title, "", "AGE_GROUP:", "Toddler", "", "THEME:", week.theme, "",
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
  console.log(`Built ${WEEKS.length} Family Connections toddler Pro imports.`);
}

main();
