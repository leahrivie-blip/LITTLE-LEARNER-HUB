/**
 * Canonical catalog of unique lesson-plan cover assets.
 * Used by the cover resolver and by generation helpers.
 */
(function lessonPlanCoverCatalog() {
  "use strict";

  const COVER_BASE = "/images/lesson-covers";

  /** @type {Array<{ title: string, slug: string, age: string, prompt: string }>} */
  const PLAN_COVERS = [
    {
      title: "All About Me",
      slug: "all-about-me",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Cheerful mirror, colorful handprints, smiling sun, and a simple house drawing on a soft pastel classroom wall. No text, no people faces close-up, kid-friendly.",
    },
    {
      title: "Amazing Apples",
      slug: "amazing-apples",
      age: "Toddler",
      prompt: "Hand-painted storybook watercolor, 16:9. Basket of red green and yellow apples, apple halves, and a magnifying glass on a preschool table. Soft empty sky/wall space for title. No text, no people.",
    },
    {
      title: "Amazing Insects",
      slug: "amazing-insects",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Close-up friendly insects: ladybug, caterpillar, ant, and beetle on green leaves with dewdrops. Bright garden light. No text.",
    },
    {
      title: "Apple Orchard Adventure",
      slug: "apple-orchard-adventure",
      age: "Toddler",
      prompt: "Hand-painted storybook watercolor, 16:9. Sunny apple orchard path with trees full of red apples and harvest baskets. Soft empty sky space for title. No text, no people.",
    },
    {
      title: "Apple Orchard Investigators",
      slug: "apple-orchard-investigators",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Bright fall apple orchard with preschool children exploring: one child inspecting a red apple with a magnifying glass, another holding a harvest basket, crates and trees with red green and golden apples. Soft empty sky space for title. No text.",
    },
    {
      title: "Apples in the Kitchen",
      slug: "apples-in-the-kitchen",
      age: "Toddler",
      prompt: "Hand-painted storybook watercolor, 16:9. Preschool kitchen counter with applesauce bowl, apple pie, juice pitcher, chef hat and apron resting empty. Soft empty wall space for title. No text, no people.",
    },
    {
      title: "Animal Habitats",
      slug: "animal-habitats",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Split habitat scene: forest fox den, arctic polar bear ice, and ocean coral with fish. Soft watercolor style. No text, no people.",
    },
    {
      title: "Animal Sounds Discovery",
      slug: "animal-sounds",
      age: "Infant",
      prompt: "Children's book illustration, 16:9. Soft nursery scene with gentle cartoon cow, duck, cat, and dog with musical sound-wave swirls. Pastel and calm. No text, no people.",
    },
    {
      title: "Archaeology Adventure",
      slug: "archaeology",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Kid-friendly dig site with brushes, fossil bones in sand, magnifying glass, and ancient pottery shards under warm sun. No text, no people.",
    },
    {
      title: "Around the World",
      slug: "around-the-world",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Colorful globe, folded map, paper airplane, and miniature landmarks (pagoda, pyramid, tower). Soft sky. No text, no people.",
    },
    {
      title: "Bugs & Butterflies",
      slug: "bugs-butterflies",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Sunny meadow with monarch and blue butterflies, bee, ladybug among wildflowers. Cheerful and bright. No text, no people.",
    },
    {
      title: "Camping Adventure",
      slug: "camping-adventure",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Daytime forest campsite with cozy tent, backpack, campfire ring, pine trees, and hiking trail. Friendly adventure mood. No text, no people.",
    },
    {
      title: "Camping Under the Stars",
      slug: "camping-stars",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Night campsite with tent, glowing lantern, gentle campfire, and starry sky with crescent moon. Soft and magical, not scary. No text, no people.",
    },
    {
      title: "Classroom Helpers",
      slug: "classroom-helpers",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Bright toddler classroom helpers scene: children cleaning up toys, watering a plant, shelving books, and organizing bins together with helper badges. Warm teamwork mood. Leave open space for title overlay. No text.",
    },
    {
      title: "Colors Everywhere",
      slug: "colors-everywhere",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Rainbow paint splatters, crayons, paintbrushes, and colorful balloons on a bright art-table scene. No text, no people.",
    },
    {
      title: "Community Helpers",
      slug: "community-helpers",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Friendly props for community helpers: firefighter helmet, doctor kit, mail bag, and police hat arranged on a sunny town sidewalk. No text, no people.",
    },
    {
      title: "Construction Crew",
      slug: "construction-crew",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Construction site with yellow excavator, dump truck, hard hats, and orange cones. Bright daytime. No text, no people.",
    },
    {
      title: "Construction Engineers",
      slug: "construction-engineers",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Blueprint plans, toy crane building a block tower, hard hat, measuring tape, and safety vest on a workbench. STEM construction feel. No text, no people.",
    },
    {
      title: "Construction Zone",
      slug: "construction-zone",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Busy construction zone sign, bulldozer, stacked bricks, and caution stripes under blue sky. Energetic kid-friendly scene. No text, no people.",
    },
    {
      title: "Dinosaur Discovery",
      slug: "dinosaur-discovery",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Friendly cartoon dinosaurs in a prehistoric landscape with ferns and warm sunset. Cute not scary. No text, no people.",
    },
    {
      title: "Easter Eggs, Chicks & Spring Science",
      slug: "easter-spring-science",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Decorated Easter eggs, fluffy chicks, magnifying glass, and spring flowers in a sunny garden science scene. No text, no people.",
    },
    {
      title: "Easter Eggstravaganza",
      slug: "easter-eggstravaganza",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Colorful Easter egg hunt baskets overflowing with patterned eggs on green grass with tulips. Festive and bright. No text, no people.",
    },
    {
      title: "Easter Exploration",
      slug: "easter-exploration",
      age: "Infant",
      prompt: "Children's book illustration, 16:9. Soft pastel Easter scene with gentle chick, simple eggs, and bunny silhouette among soft blankets. Calm infant-friendly. No text, no people.",
    },
    {
      title: "Fairy Tale Adventures",
      slug: "fairy-tales",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Magical storybook castle, glowing storybook, crown, and enchanted forest path. Whimsical fairy-tale mood. No text, no people.",
    },
    {
      title: "Farm Animals",
      slug: "farm-animals",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Red barn with cow, pig, chicken, and sheep in a green pasture. Cheerful farm morning. No text, no people.",
    },
    {
      title: "Feelings & Emotions",
      slug: "feelings-emotions",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Friendly emoji-like emotion faces (happy, calm, surprised) with colorful heart and weather mood icons on soft clouds. No text letters, no people bodies.",
    },
    {
      title: "Five Senses",
      slug: "five-senses",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Icons for five senses: eye, ear, nose, hand, and tongue arranged with flowers, music notes, citrus fruit, soft fabric. Bright educational. No text, no people.",
    },
    {
      title: "Fourth of July Celebration",
      slug: "july4-celebration",
      age: "Infant",
      prompt: "Children's book illustration, 16:9. Soft patriotic picnic scene with red-white-blue bunting, gentle sparklers light, stars, and a small drum. Calm infant-safe. No text, no people.",
    },
    {
      title: "Fourth of July Stars & Stripes",
      slug: "july4-stars-stripes",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Star cookies, striped ribbon, mini parade drum, and fireworks bursts in a bright summer sky. Festive toddler-friendly. No text, no people.",
    },
    {
      title: "Fourth of July Stars, Stripes & Community Heroes",
      slug: "july4-community-heroes",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Parade floats with stars and stripes, firefighter helmet, and community celebration banners under summer fireworks. No readable text, no people faces.",
    },
    {
      title: "Gardening & Plant Life",
      slug: "gardening-plants",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Garden bed with sprouting seedlings, watering can, gloves, butterflies, and sunflowers. Fresh spring green. No text, no people.",
    },
    {
      title: "Healthy Habits",
      slug: "healthy-habits",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Fresh fruit bowl, toothbrush and cup, soap bubbles, and a jump rope on a sunny table. Clean healthy lifestyle. No text, no people.",
    },
    {
      title: "Ice Cream Shop Entrepreneurs",
      slug: "ice-cream-shop",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Cheerful ice cream shop counter with colorful scoops, cones, sprinkles, and a playful shop awning. Sweet pastel colors. No text, no people.",
    },
    {
      title: "Inventors Workshop",
      slug: "inventors-workshop",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Inventor workshop with gears, lightbulb, cardboard robot, tools, and sketches on a wooden table. Creative STEM vibe. No text, no people.",
    },
    {
      title: "Johnny Appleseed & Apple Fun",
      slug: "johnny-appleseed-apple-fun",
      age: "Toddler",
      prompt: "Hand-painted storybook watercolor, 16:9. Johnny Appleseed themed planting scene with tin pot, satchel, sapling, seeds, shovel, and apple basket under orchard trees. Soft empty sky space for title. No text, no people.",
    },
    {
      title: "Kindergarten Readiness",
      slug: "kindergarten-readiness",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. School-ready desk with alphabet blocks, pencil, backpack, and apple beside a chalkboard. Warm encouraging mood. No readable words, no people.",
    },
    {
      title: "Letters & Sounds",
      slug: "letters-sounds",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Colorful alphabet blocks A B C, sounding horn toy, and picture cards of apple and ball. Literacy play scene. No full words, no people.",
    },
    {
      title: "Little Scientists",
      slug: "little-scientists",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Science table with beakers of colorful liquid, magnifying glass, plant specimen, and safety goggles. Curious lab mood. No text, no people.",
    },
    {
      title: "Making New Friends",
      slug: "making-new-friends",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Bright toddler friendship classroom: diverse children sharing toys, building blocks together, reading, and high-fiving with a warm teacher nearby. Leave open space for title overlay. No text.",
    },
    {
      title: "My Feelings at School",
      slug: "my-feelings-at-school",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Toddler feelings classroom with emotion cards, a feelings chart, a child at a mirror, a comforting teacher, and a cozy calm corner. Kind safe mood. Leave open space for title overlay. No text.",
    },
    {
      title: "New Year's Celebration",
      slug: "new-year-celebration",
      age: "Infant",
      prompt: "Children's book illustration, 16:9. Soft midnight celebration with gentle gold confetti, glowing lanterns, and a calm starry sky. Infant-friendly sparkle. No text, no people.",
    },
    {
      title: "New Year's Goal Setters & Big Dreams",
      slug: "new-year-goals",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Rising sun over a path of stepping stones, paper star goals, and a glowing lightbulb dream icon. Hopeful new-year mood. No text, no people.",
    },
    {
      title: "New Year's Little Celebrations",
      slug: "new-year-little",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Toddler party hats, noisemakers, balloons, and golden streamers on a cozy rug. Fun little celebration. No text, no people.",
    },
    {
      title: "Numbers Everywhere",
      slug: "numbers-everywhere",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Colorful number magnets 1-10, counting bears, and abacus on a playful math table. Bright educational. No words, no people.",
    },
    {
      title: "Ocean Explorers",
      slug: "ocean-explorers",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Underwater reef with sea turtle, dolphin, clownfish, and starfish in turquoise water. No text, no people.",
    },
    {
      title: "Pet Pals",
      slug: "pet-pals",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Friendly pet dog, cat, hamster, and goldfish bowl with toys and a pet bed. Warm home setting. No text, no people.",
    },
    {
      title: "Pet Vet Clinic",
      slug: "pet-vet-clinic",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Play vet clinic with stethoscope, bandage kit, stuffed puppy patient, and clinic scale. Caring toddler scene. No text, no people.",
    },
    {
      title: "Pirate Adventure",
      slug: "pirate-adventure",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Tropical beach with pirate ship, treasure chest of gold, and treasure map with X. Bright sunny adventure. No text, no people.",
    },
    {
      title: "Seasons of the Year",
      slug: "seasons-year",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Four-quadrant seasonal tree: spring blossoms, summer green, autumn leaves, winter snow. Balanced composition. No text, no people.",
    },
    {
      title: "Shapes Around Us",
      slug: "shapes-around-us",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Everyday objects as shapes: round clock, square window, triangle roof, rectangle door in a playful neighborhood. No text, no people.",
    },
    {
      title: "Space Adventure",
      slug: "space-adventure",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Cartoon rocket, planets, stars, and crescent moon in a soft deep-blue space scene. Whimsical. No text, no people.",
    },
    {
      title: "STEM Explorers",
      slug: "stem-explorers",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. STEM exploration table with robot toy, circuit-like colorful tiles, magnets, and simple telescope. Bright curious mood. No text, no people.",
    },
    {
      title: "Summer Colors",
      slug: "summer-colors",
      age: "Infant",
      prompt: "Children's book illustration, 16:9. Soft summer sensory scene with colorful beach balls, sunshine, gentle waves, and pastel pinwheels. Calm infant-friendly. No text, no people.",
    },
    {
      title: "Superhero Training Camp",
      slug: "superhero-training",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Playful superhero training with cape on a hanger, mask, obstacle cones, and comic-burst stars. Fun not violent. No text, no people.",
    },
    {
      title: "Transportation Adventures",
      slug: "transportation",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Colorful train, airplane, bus, and boat traveling together through a sunny landscape. Exciting travel mood. No text, no people.",
    },
    {
      title: "Welcome to My Classroom",
      slug: "welcome-to-my-classroom",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Bright welcoming toddler classroom: smiling teacher at the door, cubbies with backpacks, alphabet décor, and toddlers exploring centers. Leave open space for title overlay. No text.",
    },
    {
      title: "Water Park Engineers",
      slug: "water-park-engineers",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Toy water park with slides, pipes, buckets, and splashing water channels for engineering play. Bright summer. No text, no people.",
    },
    {
      title: "Water Play Wonders",
      slug: "water-play-wonders",
      age: "Infant",
      prompt: "Children's book illustration, 16:9. Gentle water play with floating rubber duck, cups pouring water, and soft bubbles. Calm infant sensory. No text, no people.",
    },
    {
      title: "Weather Watchers",
      slug: "weather-watchers",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Weather scene with sun, rain cloud, rainbow, and windy kite in one cheerful sky. No text, no people.",
    },
    {
      title: "Zoo Adventure",
      slug: "zoo-adventure",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Zoo path with friendly lion, giraffe, and elephant near habitat gates under sunny trees. Exciting zoo day. No text, no people.",
    },
    {
      title: "Zoo Adventures",
      slug: "zoo-adventures",
      age: "Toddler",
      prompt: "Children's book illustration, 16:9. Toddler zoo visit vibes with monkey, zebra, and penguin near a balloon and snack cart. Playful and bright. No text, no people.",
    },
    {
      title: "Zoo Veterinarians",
      slug: "zoo-veterinarians",
      age: "Preschool",
      prompt: "Children's book illustration, 16:9. Zoo clinic with stethoscope checking a gentle cartoon giraffe, medical kit, and care supplies. Caring STEM mood. No text, no people.",
    },
  ];

  const BY_TITLE = Object.fromEntries(
    PLAN_COVERS.map((entry) => [entry.title.toLowerCase(), entry]),
  );

  function coverUrlForSlug(slug) {
    return `${COVER_BASE}/${slug}.jpg`;
  }

  function getPlanCoverByTitle(title) {
    const key = String(title || "").trim().toLowerCase();
    return BY_TITLE[key] || null;
  }

  const api = {
    COVER_BASE,
    PLAN_COVERS,
    BY_TITLE,
    coverUrlForSlug,
    getPlanCoverByTitle,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhLessonPlanCoverCatalog = api;
  }
})();
