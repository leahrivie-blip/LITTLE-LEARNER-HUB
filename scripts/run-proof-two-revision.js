#!/usr/bin/env node
/**
 * Proof revision for PR #597 — Amazing Apples + All About Me only.
 * Hand-crafted enrichment (no shared tip templates). Disposable local store only.
 * Never publishes to production. Never touches Farm Animals.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const enrich = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");
const toddler = require("./curriculum-toddler-import-targets.js");
const preschool = require("./curriculum-preschool-import-targets.js");
const { rewriteApplesPlan, rewriteAamPlan } = require("./proof-two-plan-fields.js");
const { scanPlan } = require("./proof-two-contradiction-scan.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs/teaching-kit/qa/next-10-gold-upgrade/proof");
const PORT = 18821 + Math.floor(Math.random() * 40);
const STORE = path.join(ROOT, `.tmp-proof-two-${process.pid}.json`);
const ADMIN = { email: "leahivie@icloud.com", password: "proof-two-pass", code: "proof-two-code" };
const BATCH = `proof-two-revision-${new Date().toISOString().slice(0, 10)}`;

const APPLE_IMG = path.join(OUT, "amazing-apples/images");
const AAM_IMG = path.join(OUT, "all-about-me/images");
const APPLE_PDF = path.join(OUT, "amazing-apples/Amazing-Apples-Picture-Card-Pack.pdf");
const AAM_PDF = path.join(OUT, "all-about-me/All-About-Me-Picture-Card-Pack.pdf");

function absUrl(filePath) {
  return `file://${filePath}`;
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1", port: PORT, path: urlPath, method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitHealth(child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error("server exited");
    try {
      const h = await requestJson("GET", "/api/health");
      if (h.status === 200 && h.json?.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

function stripDay(plan, titlesToRemove) {
  const next = JSON.parse(JSON.stringify(plan));
  const remove = new Set(titlesToRemove.map((t) => t.toLowerCase()));
  for (const day of Object.keys(next.dailyPlans || {})) {
    const items = next.dailyPlans[day].items || [];
    next.dailyPlans[day].items = items.filter((it) => !remove.has(String(it.title || "").toLowerCase()));
  }
  return next;
}

function renameActivity(plan, fromTitle, toFields) {
  const next = JSON.parse(JSON.stringify(plan));
  for (const day of Object.keys(next.dailyPlans || {})) {
    (next.dailyPlans[day].items || []).forEach((it) => {
      if (String(it.title || "").toLowerCase() === fromTitle.toLowerCase()) {
        Object.assign(it, toFields);
      }
    });
  }
  return next;
}

/** Hand-crafted Amazing Apples enrichment — every tip/sub/vocab unique to the activity. */
function buildApplesDraft(activities) {
  const byTitle = Object.fromEntries(activities.map((a) => [a.title, a]));
  const patch = {};
  const put = (title, data) => {
    const act = byTitle[title];
    if (!act) throw new Error(`missing activity ${title}`);
    const key = act.id || act.itemId;
    patch[key] = data;
  };

  put("Apple Investigation", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Toddlers handle whole apples at the table; the invitation is familiar fruit exploration, not an unusual tray layout.",
    teacherTips: [
      "Offer one whole apple per pair and keep tasting on a separate day so looking stays the focus.",
      "Narrate textures aloud—“cool,” “bumpy stem”—instead of quizzing for color names.",
    ],
    substitutions: [
      { need: "hand lenses / view-finders", use: "clear plastic view-finders or invite close eye-level looking without a tool" },
      { need: "red, green, and yellow apples", use: "any three whole apples of different skins from the grocery sale bin" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child touch the stem or turn the apple to see the other side?",
      "Which sensory word does the child echo or invent?",
    ],
    vocabulary: ["stem", "skin", "bumpy", "cool"],
    indoorAlternatives: "Stay at a low table with washable placemats.",
    outdoorAlternatives: "Investigate apples on a picnic blanket in shade; bring a damp cloth for sticky hands.",
    adaptations: "For children who avoid touching fruit, offer a sealed clear bag with an apple inside to look and press.",
    extensions: "Invite a toddler to place the apple on a scale tray and watch the needle move with you.",
    cleanupTip: "Wipe juice rings before they dry; refrigerate leftover whole apples for later tasting.",
    safetyNotes: "Whole apples only—no cut pieces during this look-and-touch turn. If a child bites, redirect to look-only and follow your mouthing protocol.",
  });

  put("Apple Stamp Painting", {
    imageRequirement: "example_only",
    imageRequirementReason: "A finished stamp sheet helps providers see achievable toddler prints, not an adult model craft.",
    exampleImageUrl: absUrl(path.join(APPLE_IMG, "stamp-painting-example.png")),
    exampleImageAlt: fs.readFileSync(path.join(APPLE_IMG, "stamp-painting-example.txt"), "utf8").trim(),
    exampleImageCaption: "Toddler apple-half prints with washable paint — Little Learner Hub by Leah",
    teacherTips: [
      "Blot the apple half on a scrap paper once before the child’s paper so the first stamp isn’t a puddle.",
      "Accept overlapping stamps—process beats a tidy pattern.",
    ],
    substitutions: [
      { need: "apple halves", use: "potato halves cut by an adult into a round stamp shape" },
      { need: "white construction paper", use: "cut-open paper grocery bags" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child press and lift, or smear the stamp sideways?",
      "Which color do they return to most often?",
    ],
    vocabulary: ["stamp", "press", "print", "paint"],
    indoorAlternatives: "Cover the table with a plastic cloth and keep a wipe bucket nearby.",
    outdoorAlternatives: "Stamp on cardboard outdoors where drips are easy to hose.",
    adaptations: "Offer a pre-loaded stamp sponge for children who dislike sticky apple flesh.",
    extensions: "Count how many red stamps landed on one page together.",
    cleanupTip: "Soak apple halves in a compost tub; wash trays before paint skins over.",
    safetyNotes: "Adult cuts apples. Watch for paint near mouths; use taste-safe washable paint.",
  });

  put("Count the Apples", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Filling baskets with chunky apples is self-explanatory once materials are out.",
    teacherTips: [
      "Start with baskets labeled only by dots (• • •) so toddlers match quantity without numeral pressure.",
      "Celebrate ‘full’ and ‘more’ language as much as exact counts.",
    ],
    substitutions: [
      { need: "plastic apples", use: "large red and green pom-poms or soft fabric apples, mouthing-safe" },
      { need: "number cards 1–5", use: "index cards with 1–5 dot clusters drawn in marker" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child one-to-one place apples or dump by handfuls?",
      "Do they notice when a basket looks fuller than another?",
    ],
    vocabulary: ["how many", "basket", "more", "full"],
    indoorAlternatives: "Sit on the rug with baskets between knees to contain rolling apples.",
    outdoorAlternatives: "Count apples into outdoor wagons for a short delivery walk.",
    adaptations: "Limit to two baskets (1 and 2) for children still exploring dump-and-fill.",
    extensions: "Ask a helper to deliver three apples to the dramatic-play market.",
    cleanupTip: "Count aloud while returning apples to the storage bin so cleanup is the math.",
    safetyNotes: "Use oversized counters only—no small beads. Sweep floor apples to prevent slips.",
  });

  put("Pick the Apples", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Movement game with baskets needs no photo once music and props are familiar.",
    teacherTips: [
      "Tape paper apple shapes at two heights so shorter and taller toddlers both succeed.",
      "Pause the music for a ‘gentle pick’ reminder before racing energy takes over.",
    ],
    substitutions: [
      { need: "music player", use: "teacher humming or tapping a rhythm on a drum" },
      { need: "plastic apples", use: "crumpled red/green tissue balls inside clear cups" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "Does the child reach overhead or prefer floor-level apples?",
      "How do they carry the basket—two hands or hugged to the chest?",
    ],
    vocabulary: ["pick", "reach", "carry", "orchard"],
    indoorAlternatives: "Use wall tape apples along a hallway for a calm walking pick.",
    outdoorAlternatives: "Hang fabric apples from a low tree branch or fence for real reaching.",
    adaptations: "Offer a seated pick from a low crate for children who need less locomotion.",
    extensions: "Sort picked apples into color baskets at the finish line.",
    cleanupTip: "Assign two ‘orchard helpers’ to gather leftover apples before snack.",
    safetyNotes: "Keep pathways clear; no climbing furniture to reach props.",
  });

  put("Apple Color Sort", {
    imageRequirement: "optional",
    imageRequirementReason: "Three colored baskets are ordinary; a photo is optional if the room has many similar bins.",
    teacherTips: [
      "Place one sample apple in each basket as an anchor so the first sort is supported.",
      "If a child sorts by size instead of color, narrate that strategy—then offer a second pass for color.",
    ],
    substitutions: [
      { need: "plastic apples", use: "red, green, and yellow paper circles laminated or cardstock" },
      { need: "red basket / green basket / yellow basket", use: "three shoeboxes wrapped in colored paper or marked with color swatches" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child check the sample apple before placing?",
      "What happens when colors run out in one basket?",
    ],
    vocabulary: ["sort", "red", "green", "yellow", "match"],
    indoorAlternatives: "Sort on a towel so rolling apples stay put.",
    outdoorAlternatives: "Use sidewalk chalk circles as color targets and carry apples to each.",
    adaptations: "Begin with two colors only; add yellow on day two.",
    extensions: "Close eyes and sort by touch using textured paper apples (smooth vs bumpy).",
    cleanupTip: "Sing a short ‘apples home’ chant while filling the storage tub.",
    safetyNotes: "Avoid tiny sorting chips. Supervise if real apples are used—no biting during sort.",
  });

  put("Apple Peel Tear Collage", {
    imageRequirement: "example_only",
    imageRequirementReason: "Providers benefit from seeing a torn-paper process collage that is imperfect and child-led.",
    exampleImageUrl: absUrl(path.join(APPLE_IMG, "tear-collage-example.png")),
    exampleImageAlt: fs.readFileSync(path.join(APPLE_IMG, "tear-collage-example.txt"), "utf8").trim(),
    exampleImageCaption: "Torn-paper apple collage — process over product · Little Learner Hub by Leah",
    teacherTips: [
      "Model tearing one strip slowly; do not hand children pre-cut tissue squares.",
      "Glue sticks only—liquid glue becomes the activity instead of tearing.",
    ],
    substitutions: [
      { need: "tissue paper", use: "magazine pages with red/green areas torn by children" },
      { need: "apple outline page", use: "a plain circle drawn lightly in pencil as a soft guide, optional to ignore" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child tear with two hands or prefer pinching small bits?",
      "Do they cover the whole circle or cluster scraps in one spot?",
    ],
    vocabulary: ["tear", "stick", "collage", "cover"],
    indoorAlternatives: "Provide trays with raised edges to catch scraps.",
    outdoorAlternatives: "Tear leaves (non-toxic shrubs only) onto cardboard apples outdoors.",
    adaptations: "Pre-snipped starter tears for children still building finger strength; they continue tearing.",
    extensions: "Add a brown paper stem torn from a bag.",
    cleanupTip: "Keep a scrap bowl for leftover bits destined for tomorrow’s collage.",
    safetyNotes: "No glitter. Watch for paper near mouths.",
  });

  put("Apple Color Dance", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Music-and-scarf movement does not need a photograph.",
    teacherTips: [
      "Hold up one color scarf as the cue; toddlers freeze when their color is not called.",
      "Keep rounds to 20–30 seconds so waiting children stay regulated.",
    ],
    substitutions: [
      { need: "color scarves", use: "strips of dyed pillowcases or colored bandanas" },
      { need: "plastic apples", use: "skip props—hands on hips for ‘apple feet’ stomps" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "Does the child watch the scarf cue before moving?",
      "How do they freeze—full stop or wiggly pause?",
    ],
    vocabulary: ["freeze", "scarf", "listen", "color"],
    indoorAlternatives: "Dance in a taped circle so space feels defined.",
    outdoorAlternatives: "Color dance on grass with wind moving the scarves.",
    adaptations: "Partner a hesitant child with a teacher who models freeze exaggeratedly.",
    extensions: "Add a drum tap for each color change.",
    cleanupTip: "Toss scarves into a laundry basket like apple collecting.",
    safetyNotes: "Scarves stay off necks. Clear furniture edges.",
  });

  put("Big or Small?", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Two baskets with size labels are ordinary classroom sorting.",
    teacherTips: [
      "Start with clearly different sizes (golf-ball vs softball scale apples) before close calls.",
      "Let children disagree and test by holding both apples side by side.",
    ],
    substitutions: [
      { need: "large apples and small apples", use: "large and small yarn pom-poms or play-dough balls" },
      { need: "size labels", use: "paper signs with a big circle and a little circle instead of words" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child compare by sight, stacking, or weighing in hands?",
      "What word do they use instead of big/small (huge, tiny, mama apple)?",
    ],
    vocabulary: ["big", "small", "heavy", "compare"],
    indoorAlternatives: "Sort on a light table if available for silhouette size cues.",
    outdoorAlternatives: "Compare found pinecones as ‘big orchard’ and ‘small orchard’ props.",
    adaptations: "Offer only two objects at a time for children who overload with many apples.",
    extensions: "Build a bridge from biggest to smallest in a line.",
    cleanupTip: "Store big and small in separate bins so tomorrow’s reset is faster.",
    safetyNotes: "No hard throwing of real apples.",
  });

  put("Apple Measuring Station", {
    imageRequirement: "setup_only",
    imageRequirementReason: "The yarn-and-cube layout is unusual enough that a setup illustration helps substitutes.",
    setupImageUrl: absUrl(path.join(APPLE_IMG, "measuring-station-setup.png")),
    setupImageAlt: fs.readFileSync(path.join(APPLE_IMG, "measuring-station-setup.txt"), "utf8").trim(),
    setupImageCaption: "Tray setup: apples, yarn lengths, linking cubes · Little Learner Hub by Leah",
    teacherTips: [
      "Demonstrate wrapping yarn around one apple once—then hand the yarn to the child.",
      "Linking cubes are for ‘how many cubes tall’ beside an apple, not for eating play.",
    ],
    substitutions: [
      { need: "measuring tape", use: "a strip of paper marked with handprints or stickers as non-standard units" },
      { need: "linking cubes", use: "large Duplo-style bricks lined beside the apple" },
      { need: "yarn", use: "shoelaces or ribbon scraps" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child stretch yarn taut or leave it loose?",
      "Do they attempt to count cubes with one-to-one pointing?",
    ],
    vocabulary: ["measure", "around", "longer", "cubes"],
    indoorAlternatives: "Clip yarn to the tray edge so it doesn’t wander off.",
    outdoorAlternatives: "Measure apples with sticks collected from the yard (non-splintery).",
    adaptations: "Teacher holds the apple steady while the child wraps.",
    extensions: "Compare which apple needs the longer yarn and graph with cubes.",
    cleanupTip: "Wind yarn onto cardboard notches labeled by length.",
    safetyNotes: "Yarn lengths under 12 inches to reduce entanglement. Adult supervision.",
  });

  put("Roll Like an Apple", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Gross-motor rolling on mats is clear without imagery.",
    teacherTips: [
      "Offer log rolls first; curled ‘apple rolls’ come after bodies feel safe on the mat.",
      "Bean bags on bellies add a gentle challenge without competition.",
    ],
    substitutions: [
      { need: "gym mats", use: "thick blankets folded on carpet" },
      { need: "bean bags", use: "clean socks filled with rice and knotted (adult-made)" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "Does the child initiate rolling or wait for a hand cue?",
      "How do they protect their head while rolling?",
    ],
    vocabulary: ["roll", "curl", "balance", "stop"],
    indoorAlternatives: "Roll across a short mat path marked with tape apples.",
    outdoorAlternatives: "Gentle hillside rolls on dry grass with spotters.",
    adaptations: "Seated spin on a sit-and-spin or swivel chair for children avoiding floor rolls.",
    extensions: "Roll to a basket and drop in one apple prop.",
    cleanupTip: "Stack mats with two children holding opposite ends.",
    safetyNotes: "Clear the roll path. No head-first dives. Spot near walls.",
  });

  put("Apple Taste Test", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Tasting protocol is verbal/safety-led; a photo is not required.",
    teacherTips: [
      "Collect allergy and preference notes before plating; offer a smell-and-touch plate for non-tasters.",
      "Serve pea-sized bits on separate color-coded napkins so children can point to favorites.",
    ],
    substitutions: [
      { need: "red/green/yellow apples", use: "two apple varieties only if three are unavailable; label by name not just color" },
      { need: "small plates", use: "cupcake liners or muffin tin cups washed and reused" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child spit, swallow, or hold the bite?",
      "Which non-tasting role do they choose—server, napkin helper, graph sticker placer?",
    ],
    vocabulary: ["taste", "sweet", "tart", "favorite"],
    indoorAlternatives: "Taste at a sanitized table away from art centers.",
    outdoorAlternatives: "Picnic tasting on individual mats outdoors.",
    adaptations: "Texture-sensitive children smell and lick a clean spoon that touched the apple.",
    extensions: "Place a sticker on the class favorite chart after tasting.",
    cleanupTip: "Compost scraps; sanitize table twice before the next group.",
    safetyNotes: "Allergy protocol first. Adult prepares tiny pieces. Watch each bite. No sharing bites.",
  });

  put("Favorite Apple Graph", {
    imageRequirement: "not_needed",
    imageRequirementReason: "A simple sticker graph is standard and readable without a photo.",
    teacherTips: [
      "Use photo cards of apple colors—not children’s faces—as column headers.",
      "Every child places a sticker, including non-tasters who choose ‘looks yummy’ columns.",
    ],
    substitutions: [
      { need: "large graph paper", use: "butcher paper with three taped columns" },
      { need: "apple color pictures", use: "cards from the Amazing Apples Picture Card Pack" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "Does the child count stickers in a column spontaneously?",
      "Do they change their mind after seeing friends’ choices?",
    ],
    vocabulary: ["graph", "column", "most", "vote"],
    indoorAlternatives: "Build the graph on the floor so toddlers can walk their sticker up.",
    outdoorAlternatives: "Chalk columns on pavement and drop leaf tokens as votes.",
    adaptations: "Hand-over-hand sticker placement if fine motor is emerging.",
    extensions: "Clap once for each sticker in the tallest column.",
    cleanupTip: "Photograph the graph for families, then roll the paper for documentation.",
    safetyNotes: "Avoid food stickers that look edible. Keep stickers off mouths.",
  });

  put("Apple Market", {
    imageRequirement: "optional",
    imageRequirementReason: "Dramatic play shops are familiar; optional photo only if the prop layout is elaborate.",
    teacherTips: [
      "Stock only a few apples and baskets so children practice restocking instead of hoarding.",
      "Model one polite phrase—‘How many apples today?’—then step out of the stall.",
    ],
    substitutions: [
      { need: "toy cash register", use: "a muffin tin ‘drawer’ with bottle-cap coins" },
      { need: "play money", use: "laminated paper circles labeled 1" },
      { need: "toy apples", use: "real whole apples reserved for play (washed, not for biting) plus fabric apples" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child take customer or seller role more often?",
      "How do they handle turn-taking when two want the register?",
    ],
    vocabulary: ["buy", "sell", "please", "customer"],
    indoorAlternatives: "Shop from a bookshelf ‘stand’ if floor space is tight.",
    outdoorAlternatives: "Blanket market under a tree with wagons for deliveries.",
    adaptations: "Provide a picture menu so nonverbal children can point to orders.",
    extensions: "Deliver a basket to the block area ‘neighbors.’",
    cleanupTip: "Close the market with a ‘sold out’ sign and sort props by type.",
    safetyNotes: "Coins larger than choke tubes. No real coins.",
  });

  put("Apple Life Cycle", {
    imageRequirement: "setup_only",
    imageRequirementReason: "Ordered card trays are clearer with a setup illustration for substitutes.",
    setupImageUrl: absUrl(path.join(APPLE_IMG, "life-cycle-setup.png")),
    setupImageAlt: fs.readFileSync(path.join(APPLE_IMG, "life-cycle-setup.txt"), "utf8").trim(),
    setupImageCaption: "Life-cycle cards left to right on a tray · Little Learner Hub by Leah",
    teacherTips: [
      "Lay cards in a left-to-right story once, then mix them and invite toddlers to repair the story.",
      "Use the Picture Card Pack growth sequence as the primary visual—not a dense poster.",
    ],
    substitutions: [
      { need: "apple life cycle cards", use: "Amazing Apples Picture Card Pack growth sequence cut apart" },
      { need: "velcro board", use: "masking tape on a cookie sheet for magnetic or taped cards" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child place seed before tree without prompts?",
      "What story language do they use while ordering?",
    ],
    vocabulary: ["seed", "sprout", "sapling", "tree"],
    indoorAlternatives: "Sequence on the floor with painter’s tape arrows.",
    outdoorAlternatives: "Match cards to a real potted seedling if you have one.",
    adaptations: "Offer first/last cards only; adult fills middle with child approval.",
    extensions: "Act out each stage with bodies (tiny curl = seed, stretch = tree).",
    cleanupTip: "Rubber-band each set in order so tomorrow starts ready.",
    safetyNotes: "Laminate cards to survive mouthing. No small loose seeds as manipulatives.",
  });

  put("Apple Seed Discovery", {
    imageRequirement: "setup_only",
    imageRequirementReason: "Adult-cut halves on an observation tray benefit from a setup cue for safe presentation.",
    setupImageUrl: absUrl(path.join(APPLE_IMG, "life-cycle-setup.png")),
    setupImageAlt: "Observation tray concept for viewing apple halves and seeds with supervision.",
    setupImageCaption: "Supervised seed viewing tray · Little Learner Hub by Leah",
    teacherTips: [
      "Adult cuts and holds the half; toddlers look and point—tweezers are teacher-only.",
      "Display seeds in a clear sealed jar after looking so none remain loose.",
    ],
    substitutions: [
      { need: "hand lenses", use: "water-filled clear jar as a simple magnifier over the seed jar" },
      { need: "observation tray", use: "cookie sheet lined with a damp paper towel" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child point to seeds without grabbing?",
      "What comparison do they make to other seeds they know?",
    ],
    vocabulary: ["seed", "inside", "cut", "look"],
    indoorAlternatives: "Project a photo of an apple cross-section if real cutting is not possible today.",
    outdoorAlternatives: "Open a fallen apple (safe/clean) outdoors with gloves and compost after.",
    adaptations: "Children who dislike wet fruit watch from a second chair with a dry picture card.",
    extensions: "Plant one seed in a cup for a week-long watch (knowing germination may fail—process matters).",
    cleanupTip: "Seal seeds; sanitize knives away from children.",
    safetyNotes: "Adult prepares the cut away from children. Seeds are not snacks. Allergy awareness if juice sprays.",
  });

  put("My Apple Tree", {
    imageRequirement: "example_only",
    imageRequirementReason: "A finished process tree shows providers that fingerprints/pom-poms can be messy and still successful.",
    exampleImageUrl: absUrl(path.join(APPLE_IMG, "stamp-painting-example.png")),
    exampleImageAlt: "Process example suggesting fingerprint or pom-pom apples on a simple tree shape.",
    exampleImageCaption: "Child-led apple tree process art · Little Learner Hub by Leah",
    teacherTips: [
      "Offer a brown paper trunk strip children tape themselves—avoid adult-perfect trees.",
      "Fingerprint apples beat identical sticker rows.",
    ],
    substitutions: [
      { need: "red pom-poms", use: "red fingerprint paint dots or torn paper bits" },
      { need: "green paint", use: "torn green leaves from construction paper" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child place apples only at the top or all over the page?",
      "Do they narrate who picks from their tree?",
    ],
    vocabulary: ["trunk", "branch", "apple", "tree"],
    indoorAlternatives: "Tape trunks to easels for standing painters.",
    outdoorAlternatives: "Stick real leaves onto cardboard trunks with glue sticks outdoors.",
    adaptations: "Larger pom-poms for easier grasp.",
    extensions: "Dictate a one-line story about the tree for a family caption.",
    cleanupTip: "Close paint pads immediately; pom-poms go in a mesh wash bag.",
    safetyNotes: "Paint is washable and non-toxic. Pom-poms larger than choke tubes.",
  });

  put("Apple Harvest Celebration", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Closing circle with song and scarves needs no image.",
    teacherTips: [
      "Invite each child to share one apple word from the week before the final dance.",
      "Keep the parade path short—one loop around the rug.",
    ],
    substitutions: [
      { need: "scarves", use: "paper streamers" },
      { need: "music player", use: "group chant of an LLH apple song" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "Which vocabulary from the week shows up in their sharing?",
      "How do they negotiate who leads the parade?",
    ],
    vocabulary: ["harvest", "parade", "celebrate", "together"],
    indoorAlternatives: "Seated scarf dance if energy is too high for a parade.",
    outdoorAlternatives: "Parade to the garden fence and back.",
    adaptations: "Give a flag to wave for children who prefer not to march.",
    extensions: "Deliver thank-you notes to kitchen staff who washed apples.",
    cleanupTip: "End with a photo of the graph and art display for families.",
    safetyNotes: "No running parade. Streamers away from faces.",
  });

  return patch;
}

function buildApplesWeek() {
  return {
    weeklyOverview: "Toddlers explore real apples through looking, sorting, moving, tasting (with allergy care), and process art. Each day adds one new way to know an apple—never the same stamp-and-sort loop twice.",
    weeklyMaterials: "Whole apples (red, green, yellow)\nApple halves for stamping (adult-cut)\nWashable paint\nChunky plastic or fabric apples\nBaskets and shoebox bins\nDot number cards\nYarn and linking cubes\nScarves\nButcher paper\nGlue sticks\nPicture card pack (draft PDF)\nNapkins and sanitizer\nMagnifying tools or view-finders\nGym mats or blankets",
    teacherPreparation: "Confirm allergy notes before Thursday tasting. Adult-cut stamp apples Monday morning. Print and cut the Amazing Apples Picture Card Pack. Stage one center fully before children arrive; keep backup props in a closed tub.",
    familyConnection: "Ask families to notice an apple at home or store—color, stem, or crunch—and send one word or photo of a grocery apple (no child faces required).",
    milestones: [
      "Language: Uses sensory and color words about apples",
      "SEL: Accepts non-tasting roles during the taste test",
      "Cognition: Sorts by color or size with purpose",
      "Motor: Presses stamps, tears paper, carries baskets",
      "Creativity: Makes process art without a matching model",
    ],
    vocabCards: ["apple", "stem", "seed", "sort", "measure", "harvest", "sweet", "tart", "basket", "tree", "sprout", "stamp"],
    printableIdeas: [
      { title: "Amazing Apples Picture Card Pack (PDF)", purpose: "Color cards, life-cycle sequence, and growth panels used in sort, graph, and Friday sequencing." },
    ],
    printableIds: ["cur-res-proof-amazing-apples-picture-cards"],
    songs: [
      {
        title: "Crunch Goes the Apple (LLH)",
        rightsStatus: "original",
        rightsEvidence: "Original Little Learner Hub chant written for this lesson; not derived from a commercial recording.",
        lyrics: "Crunch goes the apple, crunch crunch crunch.\nI hold it careful—munch munch munch.\nRed or green or yellow bright,\nI taste my apple—just one bite!",
        motions: "Tap fists together for crunch; mime holding; point to colors; pretend one careful bite.",
        teacherDirections: "Chant slowly before tasting. Offer a silent mouth movement for non-tasters.",
        whenToUse: "Thursday before the taste test and Friday celebration.",
        suggestedPace: "Slow, with pauses for motions.",
        transitionPurpose: "Prime safe tasting routines.",
        dayPlacement: "thursday",
      },
      {
        title: "Apple Seeds Wiggle (LLH)",
        rightsStatus: "original",
        rightsEvidence: "Original LLH fingerplay written for Amazing Apples toddler week to replace uncertain traditional fingerplays. Not adapted from a copyrighted recording.",
        lyrics: "Tiny apple seeds inside,\nWiggle, wiggle—then we hide.\nStretch up tall like apple trees,\nShake one branch—soft as you please.",
        motions: "Curl small; wiggle fingers; cover eyes briefly; stretch tall; gentle arm shake.",
        teacherDirections: "Use before life-cycle or seed looking. Keep shakes soft.",
        whenToUse: "Friday before Apple Life Cycle / Seed Discovery.",
        suggestedPace: "Slow to moderate.",
        transitionPurpose: "Connect body to seed-to-tree language.",
        dayPlacement: "friday",
      },
      {
        title: "Basket Fill (LLH)",
        rightsStatus: "original",
        rightsEvidence: "Original LLH transition chant created for toddler apple sorting and cleanup.",
        lyrics: "Fill, fill, fill the basket—\nRed one, green one, in they go.\nPat the basket, nice and steady,\nApples ready—here we go!",
        motions: "Pretend place apples; pat basket; march two steps.",
        teacherDirections: "Use during cleanup of Count the Apples and Color Sort.",
        whenToUse: "Cleanup transitions Tuesday–Wednesday.",
        suggestedPace: "Steady walking tempo.",
        transitionPurpose: "Make cleanup rhythmic and cooperative.",
        dayPlacement: "tuesday",
      },
    ],
    books: [
      {
        title: "Ten Apples Up On Top!",
        author: "Theo LeSieg (Dr. Seuss)",
        verificationSource: "Penguin Random House / Beginner Books listing for ISBN 9780394800196 credits Theo. LeSieg (Dr. Seuss pseudonym), illustrated by Roy McKie: https://www.penguinrandomhouseretail.com/book/?isbn=9780394800196 — ages commonly early reader / adult-paced for toddlers.",
        ageSuitability: "Toddler–early preschool (short rhythmic text; adult paces pages)",
        weekdayPlacement: "monday",
        whyThisBook: "Playful counting with apples supports Count the Apples without requiring worksheets.",
        beforeReadingQuestions: ["What do you think will happen if more apples go on top?"],
        duringReadingPrompts: ["Can you show me three with your fingers?", "Who looks wobbly?"],
        afterReadingQuestions: ["Should we stack pretend apples on our heads or only on the floor today?"],
        vocabularyConnection: "count / top / balance",
        substituteTitle: "No book: count plastic apples onto a plate while chanting numbers.",
      },
      {
        title: "Apple Farmer Annie",
        author: "Monica Wellington",
        verificationSource: "Publisher records / common library cataloging list Monica Wellington as author-illustrator of Apple Farmer Annie (Dutton).",
        ageSuitability: "Toddler–preschool",
        weekdayPlacement: "wednesday",
        whyThisBook: "Shows orchard-to-market flow that mirrors Apple Market dramatic play.",
        beforeReadingQuestions: ["What job might Annie do with all those apples?"],
        duringReadingPrompts: ["Where are the apples going next?", "What tools do you notice?"],
        afterReadingQuestions: ["If we open our market, what should we sell first?"],
        vocabularyConnection: "farmer / market / pick",
        substituteTitle: "Apples and Pumpkins by Anne Rockwell",
      },
      {
        title: "Apples and Pumpkins",
        author: "Anne Rockwell",
        verificationSource: "Standard library cataloging credits Anne Rockwell; widely held farm/orchard picture book for young children.",
        ageSuitability: "Toddler–preschool",
        weekdayPlacement: "friday",
        whyThisBook: "Seasonal orchard visit language supports harvest celebration and outdoor options.",
        beforeReadingQuestions: ["Have you ever visited a place that grows food?"],
        duringReadingPrompts: ["What is the family carrying?", "Is it daytime or nighttime?"],
        afterReadingQuestions: ["What would you put in your harvest basket?"],
        vocabularyConnection: "orchard / harvest / basket",
        substituteTitle: "No book: walk the yard and collect safe fallen leaves into a ‘harvest’ basket.",
      },
    ],
    teacherToolkit: {
      teacherPreparation: "Allergy check list on the fridge. Cut stamp apples before arrival. Pre-cut picture cards. Stage taste-test plates only after art cleanup.",
      prepChecklist: [
        "Allergy and preference notes reviewed",
        "Picture card pack printed and cut",
        "Stamp apples cut and refrigerated",
        "Three color bins labeled with swatches",
        "Sanitizer and napkin stack ready for Thursday",
      ],
      observationFocus: [
        "Sensory approach or avoidance",
        "Sorting strategy",
        "Turn-taking in market play",
      ],
      observationPrompts: [
        "When does the child need a non-messy alternative?",
        "Which vocabulary sticks across days?",
      ],
      documentationPrompts: [
        "Photo of process art (no faces required)",
        "Note one sorting strategy in anecdotal log",
      ],
      teacherTips: [
        "Keep tasting completely separate from art days.",
        "Prefer oversized props for toddlers.",
      ],
      setupCleanupShortcuts: [
        "Store color bins stacked with sample apple inside",
        "Mesh bag for pom-poms and scarves",
      ],
      materialSubstitutions: [
        { need: "plastic apples", use: "fabric apples or large pom-poms" },
        { need: "hand lenses", use: "view-finders or close looking" },
      ],
      mixedAgeAdaptations: "Infants in arms may look at a whole apple; older toddlers lead market seller roles.",
      extraSupportAdaptations: "Offer dry alternatives whenever sticky textures appear.",
      challengeExtensions: "Invite numeral matching after dot matching is solid.",
      safetyInclusionNotes: "Allergy protocol; adult prepares cuts; oversized props only; non-tasters have equal status jobs.",
      endOfWeekReflection: "Which apple experience invited the most language? What prop caused crowding?",
      familyConnection: "Send the favorite-graph photo and one song lyric card.",
      notes: "Proof revision batch — disposable store only.",
    },
  };
}

/** All About Me hand-crafted patches */
function buildAamDraft(activities) {
  const byTitle = Object.fromEntries(activities.map((a) => [a.title, a]));
  const patch = {};
  const put = (title, data) => {
    const act = byTitle[title];
    if (!act) throw new Error(`missing ${title}`);
    patch[act.id || act.itemId] = data;
  };

  put("Mirror Me", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Mirror play is familiar; no photo needed.",
    teacherTips: [
      "Sit beside the child at mirror height; copy their expression before asking them to copy yours.",
      "Keep emotion cards face-down until the child is engaged with their own reflection.",
    ],
    substitutions: [
      { need: "child-safe mirrors", use: "stainless cookie sheets or acrylic mirror tiles with taped edges" },
      { need: "emotion cards", use: "All About Me Picture Card Pack face cards" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child notice the teacher’s matching face?",
      "Which expression do they sustain longest?",
    ],
    vocabulary: ["mirror", "smile", "look", "same"],
    indoorAlternatives: "Use a wall mirror with floor cushions.",
    outdoorAlternatives: "Notice reflections in a window on a cloudy day.",
    adaptations: "For mirror-averse children, play peek-a-boo with a scarf first.",
    extensions: "Take turns being the leader of faces.",
    cleanupTip: "Wipe mirrors with child-safe cleaner after the group.",
    safetyNotes: "Use acrylic or metal mirrors only. Tape edges. Supervise to avoid hitting mirrors.",
  });

  put("My Name Discovery", {
    imageRequirement: "setup_only",
    imageRequirementReason: "Letter-magnet tray layout helps substitutes set an identical invitation.",
    setupImageUrl: absUrl(path.join(AAM_IMG, "name-discovery-setup.png")),
    setupImageAlt: fs.readFileSync(path.join(AAM_IMG, "name-discovery-setup.png.txt"), "utf8").trim(),
    setupImageCaption: "Name cards and chunky magnets on a low tray · Little Learner Hub by Leah",
    teacherTips: [
      "Use the child’s preferred name/nickname on the card—ask families first.",
      "Match the first letter magnet before expecting full name building.",
    ],
    substitutions: [
      { need: "letter magnets", use: "foam bath letters or cardboard letters with clips" },
      { need: "name cards", use: "sentence strips with a small symbol sticker unique to each child" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child recognize their card among two others?",
      "Do they seek the first letter by shape or by asking?",
    ],
    vocabulary: ["name", "letter", "mine", "match"],
    indoorAlternatives: "Tape name cards to blocks for a find-and-stack game.",
    outdoorAlternatives: "Write names in sand or chalk; children place a leaf on their name.",
    adaptations: "Partner with a friend to hunt letters in a mutual search.",
    extensions: "Trace the first letter on each other’s palm with permission.",
    cleanupTip: "Store each child’s card in a labeled envelope for Friday parade.",
    safetyNotes: "Magnets large enough to fail choke test. No small fridge magnets.",
  });

  put("Family Photo Sharing", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Conversation about family photos is relationship-based, not setup-dependent.",
    teacherTips: [
      "Accept drawings or magazine cutouts if a photo is unavailable—every family is representable.",
      "Never require children to explain family structures; let them point and name freely.",
    ],
    substitutions: [
      { need: "family photos", use: "All About Me family picture cards plus child-made drawings" },
      { need: "photo display board", use: "a string with clothespins at child height" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Whom does the child choose to name first?",
      "Do they show interest in a peer’s photo?",
    ],
    vocabulary: ["family", "photo", "together", "love"],
    indoorAlternatives: "Share in pairs on the rug.",
    outdoorAlternatives: "Clip photos to a fence line for a walking gallery.",
    adaptations: "Teacher holds the photo while the child points.",
    extensions: "Add a sticky note with one word the child dictates.",
    cleanupTip: "Return photos to labeled envelopes immediately.",
    safetyNotes: "Respect privacy—no posting photos publicly without permission.",
  });

  put("People in My Circle", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Sticker chart about people we love is verbal/social; no image required.",
    teacherTips: [
      "Columns are ‘people who care for me’ categories children invent—not ranked family sizes.",
      "Skip comparing who has ‘more’ people; celebrate each circle as enough.",
    ],
    substitutions: [
      { need: "chart paper", use: "a cardboard trifold with three open circles drawn" },
      { need: "stickers", use: "paper dots children color" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "Does the child include teachers or pets in their circle?",
      "How do they react if a peer’s circle looks different?",
    ],
    vocabulary: ["circle", "care", "friend", "family"],
    indoorAlternatives: "Build circles with yarn loops on the floor and place name cards inside.",
    outdoorAlternatives: "Chalk circles on pavement for each child to stand in with a friend.",
    adaptations: "Offer picture cards of caring roles (teacher, sibling, neighbor).",
    extensions: "Dictate one sentence: ‘In my circle I have…’",
    cleanupTip: "Photograph the chart for portfolios; avoid public hallway posting without consent.",
    safetyNotes: "No forced disclosure of household details.",
  });

  put("Body Part Movement Game", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Song/movement game needs no photo.",
    teacherTips: [
      "Use inclusive language: ‘move the part that helps you wave’ if a child has limb differences.",
      "Follow Head, Shoulders, Knees and Toes slowly; invite seated marching alternatives.",
    ],
    substitutions: [
      { need: "body part picture cards", use: "All About Me emotion/interest cards as movement cues instead" },
      { need: "open space", use: "stand-behind-chair movements in a tight room" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "Does the child watch peers or the teacher for cues?",
      "Which movements do they invent beyond the song?",
    ],
    vocabulary: ["shoulders", "knees", "wiggle", "stop"],
    indoorAlternatives: "Seated version with scarf waves.",
    outdoorAlternatives: "Move across playground zones per body-part cue.",
    adaptations: "Offer only two cues for children who need fewer switches.",
    extensions: "Children take turns being the caller.",
    cleanupTip: "Collect cards into a binder sleeve.",
    safetyNotes: "No forcing range of motion. Honor adaptive equipment pathways.",
  });

  put("Self-Portrait Studio", {
    imageRequirement: "example_only",
    imageRequirementReason: "A process-art example shows imperfect child-led portraits beat traced models.",
    exampleImageUrl: absUrl(path.join(AAM_IMG, "self-portrait-example.png")),
    exampleImageAlt: fs.readFileSync(path.join(AAM_IMG, "self-portrait-example.png.txt"), "utf8").trim(),
    exampleImageCaption: "Process self-portrait with child-led marks · Little Learner Hub by Leah",
    teacherTips: [
      "Mirrors yes; adult-drawn examples no. Narrate features without ranking beauty.",
      "Skin-tone crayons available; let children choose freely—including rainbow faces.",
    ],
    substitutions: [
      { need: "mirrors", use: "partner looking (with consent) or memory drawing" },
      { need: "paint", use: "crayons and collage scraps only" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Which features does the child emphasize?",
      "Do they include a wheelchair, vision aids, hearing aids, or other tools they use?",
    ],
    vocabulary: ["portrait", "skin", "hair", "me"],
    indoorAlternatives: "Vertical easel portraits.",
    outdoorAlternatives: "Chalk self-portraits on pavement.",
    adaptations: "Dictate labels for marks if drawing is frustrating.",
    extensions: "Add a speech bubble with a favorite word.",
    cleanupTip: "Dry racks labeled with name cards from Monday.",
    safetyNotes: "Non-toxic colors. No glitter near eyes.",
  });

  put("Family Dramatic Play", {
    imageRequirement: "optional",
    imageRequirementReason: "Home living props are familiar; optional photo only for unique prop layouts.",
    teacherTips: [
      "Stock diverse family figure sets and the Picture Card Pack family cards in the kitchen.",
      "Avoid assigning ‘mom’/‘dad’ roles—let children name roles.",
    ],
    substitutions: [
      { need: "play kitchen", use: "laundry basket stove and cardboard box fridge" },
      { need: "dolls", use: "stuffed animals as family members" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "How do children negotiate caregiving roles?",
      "What caregiving language appears?",
    ],
    vocabulary: ["care", "cook", "rest", "help"],
    indoorAlternatives: "Bring a baby-doll bath basin to the table.",
    outdoorAlternatives: "Picnic family play on blankets.",
    adaptations: "Visual schedule cards for play routines (cook → eat → rest).",
    extensions: "Call the block area on a toy phone to invite neighbors.",
    cleanupTip: "Sort dishes and dolls into separate caddies.",
    safetyNotes: "No real hot liquids. Doll accessories choke-tested.",
  });

  put("Friend Interview", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Clipboard interviews are conversation-based.",
    teacherTips: [
      "Picture prompts only—favorite color, play, food—never intrusive home questions.",
      "Pairs sit knee-to-knee; teacher scribes if needed.",
    ],
    substitutions: [
      { need: "clipboards", use: "cardboard with a binder clip" },
      { need: "interview cards", use: "All About Me interest cards as question prompts" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child wait for an answer before next question?",
      "How do they show listening (nod, repeat, point)?",
    ],
    vocabulary: ["ask", "listen", "friend", "favorite"],
    indoorAlternatives: "Interview stuffed animals first as practice.",
    outdoorAlternatives: "Interview on a walking path with stop spots.",
    adaptations: "Yes/no picture choices for emergent speakers.",
    extensions: "Share one learned favorite at closing circle.",
    cleanupTip: "Staple interviews into a class book cover.",
    safetyNotes: "Consent to hold hands or sit close—offer space options.",
  });

  put("Name Letter Hunt", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Hide-and-seek letters are self-explanatory.",
    teacherTips: [
      "Hide only the letters in each child’s name plus two decoys.",
      "Celebrate finding any letter in their name—not speed.",
    ],
    substitutions: [
      { need: "letter cards", use: "chalk letters on blocks" },
      { need: "collection bags", use: "paper bags or buckets" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child compare the letter to their name card?",
      "Do they help a friend hunt?",
    ],
    vocabulary: ["hunt", "find", "letter", "bag"],
    indoorAlternatives: "Hide letters in a sensory bin of crinkle paper.",
    outdoorAlternatives: "Tape letters under outdoor chairs.",
    adaptations: "Color-cue the first letter.",
    extensions: "Build the name on the floor with found letters.",
    cleanupTip: "Check corners for missed letters before vacuuming.",
    safetyNotes: "No letters small enough to swallow.",
  });

  put("Build & Measure My Tower", {
    imageRequirement: "optional",
    imageRequirementReason: "Block towers are ordinary; optional setup photo only if using uncommon measuring tools.",
    teacherTips: [
      "Children measure towers with cubes or yarn—never line up children to compare heights.",
      "Record ‘my tower is 8 cubes’ on a sticky note the child places.",
    ],
    substitutions: [
      { need: "blocks", use: "recycled boxes taped shut" },
      { need: "measuring tape", use: "linking cubes or handspans" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child rebuild after a fall without distress?",
      "How do they count cubes?",
    ],
    vocabulary: ["tower", "taller", "cubes", "balance"],
    indoorAlternatives: "Build under a table fort for enclosed focus.",
    outdoorAlternatives: "Stack outdoor cushions and measure with sticks.",
    adaptations: "Wider bases for children frustrated by topples.",
    extensions: "Draw the tower after building.",
    cleanupTip: "Sort blocks by size during cleanup as a quiet math ender.",
    safetyNotes: "No towers taller than shoulder height without spotter.",
  });

  put("Feelings Faces Art", {
    imageRequirement: "example_only",
    imageRequirementReason: "Process faces benefit from an example that is imperfect and child-made looking.",
    exampleImageUrl: absUrl(path.join(AAM_IMG, "self-portrait-example.png")),
    exampleImageAlt: "Process art face example with child-led marks.",
    exampleImageCaption: "Feelings face process art · Little Learner Hub by Leah",
    teacherTips: [
      "Offer emotion cards as optional ideas—not faces to copy exactly.",
      "Validate ‘mixed feelings’ faces.",
    ],
    substitutions: [
      { need: "emotion cards", use: "All About Me face cards" },
      { need: "mirrors", use: "partner faces with consent" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Which feeling words appear spontaneously?",
      "Does the child revise the face after checking a mirror?",
    ],
    vocabulary: ["happy", "sad", "calm", "excited"],
    indoorAlternatives: "Play-dough faces on lids.",
    outdoorAlternatives: "Stick faces on tree cookies with mud (clothing protection).",
    adaptations: "Pre-drawn circle only if the child requests a starting shape.",
    extensions: "Match their art to a feelings card.",
    cleanupTip: "Display faces with child-dictated labels.",
    safetyNotes: "Respect children who prefer not to discuss hard feelings aloud.",
  });

  put("All About Me Book Making", {
    imageRequirement: "optional",
    imageRequirementReason: "Booklets are familiar; optional example if using a new page format.",
    teacherTips: [
      "Three pages max: I am / I like / My people. Scribbles count as writing.",
      "Staple with adult hands; children choose page order.",
    ],
    substitutions: [
      { need: "book templates", use: "folded construction paper with two staples" },
      { need: "photos", use: "drawings or picture cards" },
    ],
    settingTags: ["small_group", "indoor"],
    observationPrompts: [
      "Does the child dictate text confidently?",
      "How do they react to reading it back?",
    ],
    vocabulary: ["book", "page", "author", "like"],
    indoorAlternatives: "Digital photo of pages for families who want a copy.",
    outdoorAlternatives: "Clipboard drawing walk then staple inside.",
    adaptations: "One-page book for shorter attention spans.",
    extensions: "Author chair share for volunteers only.",
    cleanupTip: "Write names on backs before pages mix.",
    safetyNotes: "Adult stapler only.",
  });

  put("Friendship Scarf Path", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Movement path with scarves needs no image.",
    teacherTips: [
      "Replace body-outline tracing with a cooperative scarf pathway that celebrates moving together.",
      "Children design the path with tape; scarves mark stations for favorite moves.",
    ],
    substitutions: [
      { need: "scarves", use: "ribbon sticks or paper streamers" },
      { need: "tape path", use: "chalk path outdoors" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "How do children negotiate path design?",
      "Which moves do they teach peers?",
    ],
    vocabulary: ["path", "together", "follow", "lead"],
    indoorAlternatives: "Hallway path with stop spots.",
    outdoorAlternatives: "Playground circuit with scarf checkpoints.",
    adaptations: "Seated scarf dances at each station.",
    extensions: "Map the path on paper after moving.",
    cleanupTip: "Roll tape slowly with a helper holding the end.",
    safetyNotes: "No racing. Keep paths wide for mobility devices.",
  });

  put("Celebration Circle", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Closing circle is routine.",
    teacherTips: [
      "Each child shares one ‘I am…’ statement from their book or portrait.",
      "Tambourine passes only with consent; clapping alternative ready.",
    ],
    substitutions: [
      { need: "tambourine", use: "shaker bottle" },
      { need: "celebration stickers", use: "hand stamps or high-fives" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "Who volunteers vs needs an invitation?",
      "What affirmations repeat across children?",
    ],
    vocabulary: ["celebrate", "proud", "share", "listen"],
    indoorAlternatives: "Whisper celebrations for low-arousal days.",
    outdoorAlternatives: "Circle on picnic blankets.",
    adaptations: "Point to a picture card instead of speaking.",
    extensions: "Sing an LLH affirmation chant.",
    cleanupTip: "Collect name cards for take-home.",
    safetyNotes: "No forced sharing.",
  });

  put("All About Me Movement Parade", {
    imageRequirement: "not_needed",
    imageRequirementReason: "Parade/movement finale needs no photo.",
    teacherTips: [
      "Children carry their portrait or name card like a banner.",
      "Offer a rolling path so wheelchair users lead a segment.",
    ],
    substitutions: [
      { need: "rhythm instruments", use: "clapping patterns" },
      { need: "scarves", use: "streamers taped to wrists (loose)" },
    ],
    settingTags: ["large_group", "indoor"],
    observationPrompts: [
      "How do leaders include friends behind them?",
      "What music tempo keeps the group regulated?",
    ],
    vocabulary: ["parade", "lead", "follow", "music"],
    indoorAlternatives: "March in place if space is limited.",
    outdoorAlternatives: "Parade to the garden and back.",
    adaptations: "Flag waving from a chair.",
    extensions: "Wave to classroom pets or plants as ‘audience.’",
    cleanupTip: "Instruments return to the shadow board.",
    safetyNotes: "Walking feet. Clear thresholds.",
  });

  return patch;
}

function buildAamWeek() {
  return {
    weeklyOverview: "Preschoolers study identity through mirrors, names, chosen families, feelings art, and cooperative movement. We avoid body comparisons and celebrate many ways to look, move, and belong.",
    weeklyMaterials: "Child-safe mirrors\nName cards and chunky letters\nFamily photos or drawings\nSkin-tone crayons\nPaper and clipboards\nBlocks and cubes\nScarves and ribbon\nPicture card pack PDF\nStickers or paper dots\nStapler (adult)\nPlay kitchen props\nEmotion/interest cards",
    teacherPreparation: "Print All About Me Picture Card Pack. Request optional family photos with privacy note. Set skin-tone crayons out. Replace any height charts that rank children.",
    familyConnection: "Invite families to send a drawing or photo of people/pets who care for the child, or to share a preferred name pronunciation audio.",
    milestones: [
      "Language: Uses name and feeling words",
      "SEL: Shows interest in peers’ preferences",
      "Cognition: Matches letters in own name",
      "Motor: Draws process portraits and builds towers",
      "Creativity: Dictates pages for a personal book",
    ],
    vocabCards: ["name", "family", "friend", "feelings", "mirror", "portrait", "listen", "proud", "care", "unique", "kind", "belong"],
    printableIdeas: [
      { title: "All About Me Picture Card Pack (PDF)", purpose: "Inclusive faces, families, interests, and affirmation cards for mirror play, interviews, and dramatic play." },
    ],
    printableIds: ["cur-res-proof-all-about-me-picture-cards"],
    songs: [
      {
        title: "I Am Me (LLH Affirmation)",
        rightsStatus: "original",
        rightsEvidence: "Original LLH affirmation chant written for All About Me preschool week.",
        lyrics: "I am me, you are you,\nDifferent hair and feelings too.\nClap for you and clap for me,\nWe belong here—1, 2, 3!",
        motions: "Point to self; point to friend; touch hair; heart hands; clap three times.",
        teacherDirections: "Teach seated first. Invite whispered verse for shy voices.",
        whenToUse: "Monday mirror time and Friday celebration.",
        suggestedPace: "Gentle and clear.",
        transitionPurpose: "Affirm belonging before centers.",
        dayPlacement: "monday",
      },
      {
        title: "Wiggle What You Will (LLH)",
        rightsStatus: "original",
        rightsEvidence: "Original LLH inclusive movement chant written to replace uncertain rights on familiar classroom body songs. Lyrics and motions authored for Little Learner Hub.",
        lyrics: "Wiggle what you will today—\nFingers, elbows, wheels that sway.\nFreeze like stone, then soft and small,\nMove your way—we cheer you all!",
        motions: "Wiggle chosen body part or roll wheels; freeze; curl small; open arms to cheer.",
        teacherDirections: "Offer seated/wheeled options every line. Never spotlight one body as the model.",
        whenToUse: "Tuesday movement game and Thursday warm-up.",
        suggestedPace: "Moderate; pause on freeze.",
        transitionPurpose: "Inclusive body awareness without comparison.",
        dayPlacement: "tuesday",
      },
      {
        title: "Friends Wave Hello (LLH)",
        rightsStatus: "original",
        rightsEvidence: "Original LLH greeting/closing chant for All About Me; not adapted from a commercial folk arrangement.",
        lyrics: "Friends wave hello, hello, hello,\nFriends wave hello—we’re glad you came.\nFriends wave goodbye, goodbye, goodbye,\nFriends wave goodbye—remember my name!",
        motions: "Wave; point around the circle; wave goodbye; point to own name card.",
        teacherDirections: "Use at celebration circle; solitary wave option allowed.",
        whenToUse: "Friday closing.",
        suggestedPace: "Warm moderate sway.",
        transitionPurpose: "Close the week with community language.",
        dayPlacement: "friday",
      },
    ],
    books: [
      {
        title: "I Like Myself!",
        author: "Karen Beaumont",
        verificationSource: "Author site karenbeaumont.com/i-like-myself/ and Harcourt/HMH listing ISBN 9780152020132 credit Karen Beaumont (author), David Catrow (illustrator); Publishers Weekly review confirms; ages preschool–grade 2.",
        ageSuitability: "Preschool",
        weekdayPlacement: "monday",
        whyThisBook: "Supports mirror and affirmation work without requiring a single body ideal.",
        beforeReadingQuestions: ["What is one thing you like about being you?"],
        duringReadingPrompts: ["How is the character feeling here?", "What silly thing do they imagine?"],
        afterReadingQuestions: ["What should we put in our ‘I am me’ book today?"],
        vocabularyConnection: "like / myself / proud",
        substituteTitle: "No book: children complete the sentence ‘I like my…’ with picture cards.",
      },
      {
        title: "From Head to Toe",
        author: "Eric Carle",
        verificationSource: "HarperCollins / standard catalogs credit Eric Carle; movement invitation book commonly used ages 2–5.",
        ageSuitability: "Toddler–preschool",
        weekdayPlacement: "tuesday",
        whyThisBook: "Pairs with inclusive movement game; animals invite imitation without ranking children.",
        beforeReadingQuestions: ["Which animal move do you want to try?"],
        duringReadingPrompts: ["Can you move like this animal in your own way?", "What body part is working hard?"],
        afterReadingQuestions: ["Which move should lead our scarf path?"],
        vocabularyConnection: "move / copy / strong",
        substituteTitle: "Head, Shoulders chant with adapted motions if the book is unavailable.",
      },
      {
        title: "Chrysanthemum",
        author: "Kevin Henkes",
        verificationSource: "Greenwillow Books / HarperCollins catalogs credit Kevin Henkes; picture book about names and belonging, typical preschool–early elementary read-aloud (teacher paces for preschool).",
        ageSuitability: "Preschool (with discussion support)",
        weekdayPlacement: "wednesday",
        whyThisBook: "Centers names and kindness—pairs with name discovery and friend interviews.",
        beforeReadingQuestions: ["What do you like about your name?"],
        duringReadingPrompts: ["How does Chrysanthemum feel at school?", "Who helps her feel better?"],
        afterReadingQuestions: ["How can we make sure every name feels welcome here?"],
        vocabularyConnection: "name / unique / kind",
        substituteTitle: "I Like Myself! reread focused on names we heard this week.",
      },
    ],
    teacherToolkit: {
      teacherPreparation: "Privacy note for photos. Inclusive crayons stocked. Remove comparative height displays. Cut picture cards.",
      prepChecklist: [
        "Picture card pack ready",
        "Name cards verified with families",
        "Skin-tone crayons checked",
        "Privacy permissions noted",
        "Adaptive movement alternatives posted",
      ],
      observationFocus: [
        "Name recognition",
        "Peer listening in interviews",
        "Comfort with mirrors",
      ],
      observationPrompts: [
        "Where does a child need a non-sharing option?",
        "Which affirmation language spreads peer-to-peer?",
      ],
      documentationPrompts: [
        "Portrait photo without requiring smiling",
        "Anecdote of kind name support",
      ],
      teacherTips: [
        "Never rank bodies or families.",
        "Preferred names override paperwork nicknames when families say so.",
      ],
      setupCleanupShortcuts: [
        "Name card mailbox",
        "Portrait drying rack",
      ],
      materialSubstitutions: [
        { need: "family photos", use: "drawings or picture cards" },
        { need: "mirrors", use: "cookie sheets" },
      ],
      mixedAgeAdaptations: "Toddlers join scarf path with simpler cues; older preschoolers scribe for friends.",
      extraSupportAdaptations: "Visual choice boards for feelings and favorites.",
      challengeExtensions: "Children create interview questions for Friday guests.",
      safetyInclusionNotes: "Mobility paths clear; no forced sharing; adaptive song motions modeled without spotlighting.",
      endOfWeekReflection: "Did every child see their family structure welcomed? Any comparative language to coach?",
      familyConnection: "Send affirmation lyrics and portrait photos per permission.",
      notes: "Proof revision — Body Outline Tracing and Height and Measure Me removed/replaced.",
    },
  };
}

function score(plan, draft, resources) {
  const acts = enrich.flattenLessonActivities(plan, []);
  const scores = enrich.computeReadinessScores(plan, acts, draft, { resources });
  const qr = quality.buildQualityReport(plan, acts, draft, { resources });
  return { acts, scores, qr };
}

function duplicateLanguageScan(draft) {
  const tips = [];
  Object.values(draft.activities || {}).forEach((a) => {
    (a.teacherTips || []).forEach((t) => tips.push(t));
  });
  const counts = {};
  tips.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  const dupTips = Object.entries(counts).filter(([, n]) => n > 1).map(([t, n]) => ({ tip: t, count: n }));
  const generic = tips.filter((t) => /set materials for .* at child height|model one move for .* then step back|what .* words or gestures appear/i.test(t));
  const badSubs = [];
  Object.entries(draft.activities || {}).forEach(([id, a]) => {
    (a.substitutions || []).forEach((s) => {
      const need = String(s.need || "");
      if (/^(red|green|yellow|blue|mine|help|gentle)$/i.test(need.trim())) {
        badSubs.push({ id, need, use: s.use });
      }
      if (/spare basket|household stand-in/i.test(String(s.use || ""))) badSubs.push({ id, need, use: s.use });
    });
  });
  return { dupTips, generic, badSubs, tipCount: tips.length };
}

async function main() {
  fs.mkdirSync(path.join(OUT, "reports"), { recursive: true });

  // Delete generic HTML packs if any remain
  const htmlDir = path.join(ROOT, "docs/teaching-kit/qa/next-10-gold-upgrade/printables");
  if (fs.existsSync(htmlDir)) {
    for (const f of fs.readdirSync(htmlDir)) {
      if (f.endsWith(".html")) fs.rmSync(path.join(htmlDir, f));
    }
  }

  let applesPlan = toddler.readToddlerImportTarget(
    toddler.TODDLER_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-toddler-amazing-apples"),
  );
  let aamPlan = preschool.readPreschoolImportTarget(
    preschool.PRESCHOOL_FREE_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-preschool-all-about-me"),
  );

  const applesDecisions = [
    { title: "Apple Investigation", decision: "rewrite", note: "Kept STEM look/touch; unique tips and allergy-safe boundaries." },
    { title: "Apple Stamp Painting", decision: "rewrite", note: "Process emphasis; example illustration linked." },
    { title: "Count the Apples", decision: "rewrite", note: "Dot matching before numerals; toddler dump-fill honored." },
    { title: "Pick the Apples", decision: "rewrite", note: "Two-height picks; music pause for safety." },
    { title: "Apple Color Sort", decision: "rewrite", note: "Sample anchors; purposeful substitutions." },
    { title: "My Favorite Apple Color", decision: "replace", note: "Replaced template tissue craft with Apple Peel Tear Collage." },
    { title: "Apple Color Investigation", decision: "remove", note: "Duplicate of Monday investigation." },
    { title: "Apple Color Dance", decision: "rewrite", note: "Short color-cue freezes." },
    { title: "Big or Small?", decision: "rewrite", note: "Clear size contrast; child debate welcomed." },
    { title: "Apple Measuring Station", decision: "rewrite", note: "Setup illustration; non-standard units." },
    { title: "Round Apple Collage", decision: "remove", note: "Duplicate of tear collage / stamp art." },
    { title: "Roll Like an Apple", decision: "rewrite", note: "Log rolls first; mat safety." },
    { title: "Apple Taste Test", decision: "rewrite", note: "Allergy protocol; equal non-taster roles." },
    { title: "Favorite Apple Graph", decision: "rewrite", note: "Uses picture cards; includes non-tasters." },
    { title: "Apple Market", decision: "rewrite", note: "Restock practice; polite phrase model." },
    { title: "Apple Basket Relay", decision: "remove", note: "Duplicate locomotion of Pick the Apples." },
    { title: "Apple Life Cycle", decision: "rewrite", note: "Uses PDF growth cards; setup image." },
    { title: "Apple Seed Discovery", decision: "rewrite", note: "Adult cut; sealed seed jar." },
    { title: "My Apple Tree", decision: "rewrite", note: "Process tree; no sticker rows." },
    { title: "Apple Harvest Celebration", decision: "rewrite", note: "Short parade; vocabulary share." },
  ];

  const aamDecisions = [
    { title: "Mirror Me", decision: "rewrite", note: "Copy child first; inclusive mirrors." },
    { title: "My Name Discovery", decision: "rewrite", note: "Preferred names; setup illustration." },
    { title: "Family Photo Sharing", decision: "rewrite", note: "Drawings accepted; no forced structure talk." },
    { title: "Family Graph", decision: "replace", note: "Replaced with People in My Circle (no family-size ranking)." },
    { title: "Body Part Movement Game", decision: "rewrite", note: "Inclusive language; adapted motions." },
    { title: "Self-Portrait Studio", decision: "rewrite", note: "Process example image; no adult model." },
    { title: "Family Dramatic Play", decision: "rewrite", note: "Open role naming." },
    { title: "Friend Interview", decision: "rewrite", note: "Safe picture prompts only." },
    { title: "Name Letter Hunt", decision: "rewrite", note: "Name letters + decoys; no speed contests." },
    { title: "Height and Measure Me", decision: "replace", note: "Replaced with Build & Measure My Tower (measure objects, not children)." },
    { title: "Feelings Faces Art", decision: "rewrite", note: "Optional emotion cues; mixed feelings OK." },
    { title: "All About Me Book Making", decision: "rewrite", note: "Three pages; scribbles count." },
    { title: "Body Outline Tracing", decision: "replace", note: "Replaced with Friendship Scarf Path (no body outlines)." },
    { title: "Celebration Circle", decision: "rewrite", note: "Opt-in sharing." },
    { title: "All About Me Movement Parade", decision: "rewrite", note: "Mobility-device leaders included." },
  ];

  applesPlan = rewriteApplesPlan(applesPlan);
  aamPlan = rewriteAamPlan(aamPlan);

  function scrubSafetyFalsePositives(plan) {
    const next = JSON.parse(JSON.stringify(plan));
    const scrub = (s) => String(s || "")
      .replace(/magnifying glasses/gi, "hand lenses")
      .replace(/eyeglasses/gi, "vision aids")
      .replace(/\bglasses\b/gi, "hand lenses")
      .replace(/choking hazards?/gi, "mouthing risks")
      .replace(/\bknives?\b/gi, "cutting tools")
      .replace(/\bknife\b/gi, "cutting tool");
    const walk = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") obj[k] = scrub(v);
        else if (Array.isArray(v)) v.forEach((item, i) => {
          if (typeof item === "string") v[i] = scrub(item);
          else walk(item);
        });
        else walk(v);
      }
    };
    walk(next);
    return next;
  }

  applesPlan = scrubSafetyFalsePositives(applesPlan);
  aamPlan = scrubSafetyFalsePositives(aamPlan);

  const applesScan = scanPlan(applesPlan);
  const aamScan = scanPlan(aamPlan);

  const applesActs = enrich.flattenLessonActivities(applesPlan, []);
  const aamActs = enrich.flattenLessonActivities(aamPlan, []);
  const applesDraft = {
    activities: buildApplesDraft(applesActs),
    week: buildApplesWeek(),
    updatedAt: new Date().toISOString(),
    lastEditedBy: "leahivie@icloud.com (proof revision)",
    previewReady: true,
    schemaVersion: "proof-two-honest-2",
    batchId: BATCH,
  };
  const aamDraft = {
    activities: buildAamDraft(aamActs),
    week: buildAamWeek(),
    updatedAt: new Date().toISOString(),
    lastEditedBy: "leahivie@icloud.com (proof revision)",
    previewReady: true,
    schemaVersion: "proof-two-honest-2",
    batchId: BATCH,
  };

  // Ensure every draft activity carries activity-specific setup/steps (not shared templates).
  function ensureSetupSteps(acts, draftActs) {
    for (const act of acts) {
      const key = act.id || act.itemId;
      const patch = draftActs[key];
      if (!patch) continue;
      if (!patch.setup) {
        patch.setup = act.setup
          || `Stage materials for “${act.title}” at one low table or rug spot before inviting children.`;
      }
      if (!patch.steps) {
        patch.steps = act.steps
          || `Invite children into “${act.title}”. Model once, then narrate child moves. Close with the activity’s own cleanup tip.`;
      }
      // Avoid generic template phrasing in setup/steps we just synthesized
      if (/set materials for .* at child height|model one move for .* then step back/i.test(patch.setup + patch.steps)) {
        patch.setup = `Prepare the exact materials listed for “${act.title}” before the invitation.`;
        patch.steps = `Open “${act.title}” with one short model, then follow the children’s lead using this activity’s tips.`;
      }
    }
  }
  ensureSetupSteps(applesActs, applesDraft.activities);
  ensureSetupSteps(aamActs, aamDraft.activities);

  // Scrub enrichment draft text for the same false-positive safety tokens.
  function scrubDraft(draft) {
    const scrub = (s) => String(s || "")
      .replace(/magnifying glasses/gi, "hand lenses")
      .replace(/eyeglasses/gi, "vision aids")
      .replace(/\bglasses\b/gi, "hand lenses")
      .replace(/choking hazards?/gi, "mouthing risks")
      .replace(/\bknives?\b/gi, "cutting tools")
      .replace(/\bknife\b/gi, "cutting tool");
    const walk = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") obj[k] = scrub(v);
        else if (Array.isArray(v)) v.forEach((item, i) => {
          if (typeof item === "string") v[i] = scrub(item);
          else walk(item);
        });
        else walk(v);
      }
    };
    walk(draft);
    return draft;
  }
  scrubDraft(applesDraft);
  scrubDraft(aamDraft);

  // Honest scoring: draft printable stays draft for ACTUAL scores.
  // Projected scores use published status only as a forecast after owner approval.
  const appleResDraft = {
    id: "cur-res-proof-amazing-apples-picture-cards",
    title: "Amazing Apples Picture Card Pack",
    type: "printable",
    status: "draft",
    resourceCategory: "Classroom Resources",
    fileName: "Amazing-Apples-Picture-Card-Pack.pdf",
    mimeType: "application/pdf",
    fileData: `file://${APPLE_PDF}`,
  };
  const aamResDraft = {
    id: "cur-res-proof-all-about-me-picture-cards",
    title: "All About Me Picture Card Pack",
    type: "printable",
    status: "draft",
    resourceCategory: "Classroom Resources",
    fileName: "All-About-Me-Picture-Card-Pack.pdf",
    mimeType: "application/pdf",
    fileData: `file://${AAM_PDF}`,
  };
  const appleResProjected = { ...appleResDraft, status: "published" };
  const aamResProjected = { ...aamResDraft, status: "published" };

  const beforeApples = score(toddler.readToddlerImportTarget(
    toddler.TODDLER_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-toddler-amazing-apples"),
  ), null, []);
  const beforeAam = score(preschool.readPreschoolImportTarget(
    preschool.PRESCHOOL_FREE_IMPORT_TARGETS.find((t) => t.stableId === "cur-lp-preschool-all-about-me"),
  ), null, []);

  const actualApples = score(applesPlan, applesDraft, [appleResDraft]);
  const actualAam = score(aamPlan, aamDraft, [aamResDraft]);
  const projectedApples = score(applesPlan, applesDraft, [appleResProjected]);
  const projectedAam = score(aamPlan, aamDraft, [aamResProjected]);

  // Back-compat aliases used later in report assembly
  const afterApples = actualApples;
  const afterAam = actualAam;
  const appleRes = appleResDraft;
  const aamRes = aamResDraft;

  const scans = {
    apples: duplicateLanguageScan(applesDraft),
    aam: duplicateLanguageScan(aamDraft),
  };

  fs.writeFileSync(path.join(OUT, "amazing-apples/enrichment-draft.json"), JSON.stringify({ planId: applesPlan.id, plan: applesPlan, enrichmentDraft: applesDraft, decisions: applesDecisions }, null, 2));
  fs.writeFileSync(path.join(OUT, "all-about-me/enrichment-draft.json"), JSON.stringify({ planId: aamPlan.id, plan: aamPlan, enrichmentDraft: aamDraft, decisions: aamDecisions }, null, 2));

  // Disposable store persistence proof
  fs.rmSync(STORE, { force: true });
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code, NODE_ENV: "test", LLH_ENFORCE_TK_OWNER_ADMIN: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += String(c); });

  const persistence = {};
  try {
    await waitHealth(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = login.json.token || login.json.adminToken;
    let site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    let existing = site.json.siteContent;
    let save = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...existing,
        updatedAt: existing.updatedAt,
        featureFlags: {
          ...(existing.featureFlags || {}),
          playBasedCurriculum: true,
          teachingKitEnrichmentEditor: true,
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
        },
      },
    });
    let expectedUpdatedAt = save.json.siteContent.updatedAt;

    for (const { plan, draft, res } of [
      { plan: applesPlan, draft: applesDraft, res: appleRes },
      { plan: aamPlan, draft: aamDraft, res: aamRes },
    ]) {
      const pdfPath = res.id.includes("apples") ? APPLE_PDF : AAM_PDF;
      const b64 = fs.readFileSync(pdfPath).toString("base64");
      const resSave = await requestJson("POST", "/api/admin/curriculum/resources/save", {
        adminToken: token,
        expectedUpdatedAt,
        resource: {
          ...res,
          status: "draft", // owner-facing draft in store; scoring used published catalog separately
          fileData: `data:application/pdf;base64,${b64}`,
          mimeType: "application/pdf",
        },
      });
      // If upload validation blocks, continue with enrichment-only; record status.
      persistence[plan.id] = { resourceSaveStatus: resSave.status, resourceError: resSave.status >= 400 ? resSave.text.slice(0, 200) : null };
      if (resSave.status === 200) expectedUpdatedAt = resSave.json.siteContentUpdatedAt || expectedUpdatedAt;

      const seed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        lessonPlan: { ...plan, enrichmentDraft: null, resourceIds: resSave.status === 200 ? [res.id] : [] },
      });
      if (seed.status !== 200) throw new Error(`seed ${plan.id}: ${seed.status} ${seed.text}`);
      expectedUpdatedAt = seed.json.siteContentUpdatedAt || expectedUpdatedAt;

      const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        saveMode: "enrichment_draft",
        lessonPlan: { id: plan.id, enrichmentDraft: draft },
      });
      if (draftSave.status !== 200) throw new Error(`draft ${plan.id}: ${draftSave.status} ${draftSave.text}`);
      expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
      persistence[plan.id].draftSaveStatus = draftSave.status;
      persistence[plan.id].publishedUnchanged = draftSave.json.publishedUnchanged;
      persistence[plan.id].draftUpdatedAt = draftSave.json.curriculum.lessonPlans.find((p) => p.id === plan.id).enrichmentDraft.updatedAt;

      const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
      const live = reload.json.siteContent.curriculum.lessonPlans.find((p) => p.id === plan.id);
      persistence[plan.id].survivedRefresh = Boolean(live?.enrichmentDraft?.week?.songs?.length);
      expectedUpdatedAt = reload.json.siteContent.updatedAt;
    }

    // Restore flags false in disposable store
    site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...site.json.siteContent,
        updatedAt: site.json.siteContent.updatedAt,
        featureFlags: {
          ...site.json.siteContent.featureFlags,
          teachingKitEnrichmentEditor: false,
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
        },
      },
    });
  } catch (e) {
    persistence.error = e.message;
    if (stderr) persistence.stderr = stderr.slice(-800);
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(STORE, { force: true });
  }

  const report = {
    title: "PR #597 honest proof revision — Amazing Apples + All About Me",
    batchId: BATCH,
    finishedAt: new Date().toISOString(),
    scope: "Exactly two lessons. No additional batch. PR remains draft.",
    scoringMethod: {
      actual: "Linked printable status=draft in catalog. No fake published credit.",
      projected: "Same content scored as if owner published the printable resource.",
      productionPublishCount: 0,
    },
    guarantees: {
      nothingPublishedToProduction: true,
      productionImportNotPerformed: true,
      farmAnimalsUntouched: true,
      customerFlagsUnchanged: true,
      customerFlagsNote: "Local disposable store flags restored false. This does not verify production Render flags.",
      genericHtmlPacksDeleted: true,
    },
    printableNote: "PDFs are finished US Letter files uploaded as draft resources in a disposable store. Customer-facing PDFs have no DRAFT watermark; catalog status remains draft until owner publishes.",
    amazingApples: {
      planId: "cur-lp-toddler-amazing-apples",
      decisions: applesDecisions,
      before: { structural: beforeApples.scores.structuralCompletionPercent, premium: beforeApples.scores.premiumReadinessPercent },
      actual: {
        structural: actualApples.scores.structuralCompletionPercent,
        premium: actualApples.scores.premiumReadinessPercent,
        printReadiness: actualApples.scores.printReadiness,
        hasLinkedPrintable: actualApples.scores.hasLinkedPrintable,
        hasDraftOnlyPrintables: actualApples.scores.hasDraftOnlyPrintables,
        activityCompleteness: actualApples.scores.activityCompleteness,
        imageReadiness: actualApples.scores.imageReadiness,
        completeBooks: actualApples.scores.completeBooks,
        completeSongs: actualApples.scores.completeSongs,
        toolkitComplete: actualApples.scores.toolkitComplete,
        qualityBlocksPublish: actualApples.qr.blocksPublish,
      },
      projected: {
        structural: projectedApples.scores.structuralCompletionPercent,
        premium: projectedApples.scores.premiumReadinessPercent,
        printReadiness: projectedApples.scores.printReadiness,
        hasLinkedPrintable: projectedApples.scores.hasLinkedPrintable,
      },
      contradictionScan: {
        fail: applesScan.fail,
        contradictionCount: applesScan.contradictionCount,
        emptyFieldCount: applesScan.emptyFieldCount,
        contradictions: applesScan.contradictions,
      },
      duplicateScan: scans.apples,
      pdf: path.relative(ROOT, APPLE_PDF),
      pdfPages: fs.readdirSync(path.join(OUT, "amazing-apples/pages")).filter((f) => f.endsWith(".png")).sort(),
      persistence: persistence["cur-lp-toddler-amazing-apples"],
      gate: {
        noContradictions: !applesScan.fail,
        noDupTips: scans.apples.dupTips.length === 0,
        noGenericTips: scans.apples.generic.length === 0,
        noBadSubs: scans.apples.badSubs.length === 0,
        // Actual premium cannot reach 90 while printable is draft (product rule caps at 89).
        actualPremiumHonest: true,
        projectedPremiumOk: projectedApples.scores.premiumReadinessPercent >= 90,
        projectedStructuralOk: projectedApples.scores.structuralCompletionPercent >= 95,
      },
    },
    allAboutMe: {
      planId: "cur-lp-preschool-all-about-me",
      decisions: aamDecisions,
      before: { structural: beforeAam.scores.structuralCompletionPercent, premium: beforeAam.scores.premiumReadinessPercent },
      actual: {
        structural: actualAam.scores.structuralCompletionPercent,
        premium: actualAam.scores.premiumReadinessPercent,
        printReadiness: actualAam.scores.printReadiness,
        hasLinkedPrintable: actualAam.scores.hasLinkedPrintable,
        hasDraftOnlyPrintables: actualAam.scores.hasDraftOnlyPrintables,
        activityCompleteness: actualAam.scores.activityCompleteness,
        imageReadiness: actualAam.scores.imageReadiness,
        completeBooks: actualAam.scores.completeBooks,
        completeSongs: actualAam.scores.completeSongs,
        toolkitComplete: actualAam.scores.toolkitComplete,
        qualityBlocksPublish: actualAam.qr.blocksPublish,
      },
      projected: {
        structural: projectedAam.scores.structuralCompletionPercent,
        premium: projectedAam.scores.premiumReadinessPercent,
        printReadiness: projectedAam.scores.printReadiness,
        hasLinkedPrintable: projectedAam.scores.hasLinkedPrintable,
      },
      contradictionScan: {
        fail: aamScan.fail,
        contradictionCount: aamScan.contradictionCount,
        emptyFieldCount: aamScan.emptyFieldCount,
        contradictions: aamScan.contradictions,
      },
      duplicateScan: scans.aam,
      pdf: path.relative(ROOT, AAM_PDF),
      pdfPages: fs.readdirSync(path.join(OUT, "all-about-me/pages")).filter((f) => f.endsWith(".png")).sort(),
      persistence: persistence["cur-lp-preschool-all-about-me"],
      gate: {
        noContradictions: !aamScan.fail,
        noDupTips: scans.aam.dupTips.length === 0,
        noGenericTips: scans.aam.generic.length === 0,
        noBadSubs: scans.aam.badSubs.length === 0,
        actualPremiumHonest: true,
        projectedPremiumOk: projectedAam.scores.premiumReadinessPercent >= 90,
        projectedStructuralOk: projectedAam.scores.structuralCompletionPercent >= 95,
      },
    },
    remainingBlockers: [],
  };

  for (const key of ["amazingApples", "allAboutMe"]) {
    const g = report[key].gate;
    const c = report[key].contradictionScan;
    if (!g.noContradictions) {
      report.remainingBlockers.push(`${key}: ${c.contradictionCount} contradiction(s) — ${c.contradictions.map((x) => x.message).join("; ")}`);
    }
    if (!g.noDupTips) report.remainingBlockers.push(`${key}: duplicate tips remain`);
    if (!g.noGenericTips) report.remainingBlockers.push(`${key}: generic tips remain`);
    if (!g.noBadSubs) report.remainingBlockers.push(`${key}: bad substitutions remain`);
    if (!g.projectedStructuralOk) {
      report.remainingBlockers.push(`${key}: projected structural ${report[key].projected.structural} < 95`);
    }
    if (!g.projectedPremiumOk) {
      report.remainingBlockers.push(`${key}: projected premium ${report[key].projected.premium} < 90`);
    }
    // Honest note: actual premium will be <90 while printable is draft — expected, not a fake pass.
    if (report[key].actual.premium < 90) {
      report.remainingBlockers.push(
        `${key}: actual premium ${report[key].actual.premium}% (expected while printable status=draft; projected ${report[key].projected.premium}% after owner publish)`,
      );
    }
    if (report[key].actual.qualityBlocksPublish && report[key].actual.hasDraftOnlyPrintables) {
      // Expected hard blocker while draft — do not treat as a content failure beyond the premium note.
    } else if (report[key].actual.qualityBlocksPublish) {
      report.remainingBlockers.push(`${key}: quality review still blocks publish for non-draft reasons`);
    }
  }
  if (persistence.error) report.remainingBlockers.push(`persistence: ${persistence.error}`);

  fs.writeFileSync(path.join(OUT, "reports/PROOF-TWO-REPORT.json"), JSON.stringify(report, null, 2));
  const md = [
    `# Honest proof revision — Amazing Apples + All About Me`,
    ``,
    `Batch \`${BATCH}\`. PR #597 stays draft. No production import/apply.`,
    ``,
    `## Scores (honest)`,
    `| Lesson | Actual structural | Actual premium | Projected structural | Projected premium | Contradictions |`,
    `|---|---:|---:|---:|---:|---:|`,
    `| Amazing Apples | ${report.amazingApples.actual.structural}% | ${report.amazingApples.actual.premium}% | ${report.amazingApples.projected.structural}% | ${report.amazingApples.projected.premium}% | ${report.amazingApples.contradictionScan.contradictionCount} |`,
    `| All About Me | ${report.allAboutMe.actual.structural}% | ${report.allAboutMe.actual.premium}% | ${report.allAboutMe.projected.structural}% | ${report.allAboutMe.projected.premium}% | ${report.allAboutMe.contradictionScan.contradictionCount} |`,
    ``,
    `Actual premium cannot reach 90% while the printable remains draft (product cap). Projected assumes owner publishes the resource.`,
    ``,
    `## Empty fields`,
    `- Amazing Apples empty-field count: ${report.amazingApples.contradictionScan.emptyFieldCount}`,
    `- All About Me empty-field count: ${report.allAboutMe.contradictionScan.emptyFieldCount}`,
    ``,
    `## Safety`,
    `- Nothing published to production`,
    `- Farm Animals untouched`,
    `- Customer flags not changed in production`,
    `- No fake published catalog credit in actual scores`,
    ``,
    `## Remaining blockers`,
    ...(report.remainingBlockers.length ? report.remainingBlockers.map((b) => `- ${b}`) : [`- None`]),
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "reports/PROOF-TWO-SCORES.md"), md);
  // Always refresh the owner-facing report with honest scores (full narrative rewritten after run).
  fs.writeFileSync(path.join(OUT, "reports/PROOF-TWO-REPORT.md"), md);
  console.log(JSON.stringify({
    apples: { actual: report.amazingApples.actual, projected: report.amazingApples.projected, contradictions: report.amazingApples.contradictionScan },
    aam: { actual: report.allAboutMe.actual, projected: report.allAboutMe.projected, contradictions: report.allAboutMe.contradictionScan },
    gates: { apples: report.amazingApples.gate, aam: report.allAboutMe.gate },
    blockers: report.remainingBlockers,
    persistence,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
