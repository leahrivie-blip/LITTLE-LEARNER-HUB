/**
 * Lesson plan cover resolver — plan catalog + theme mapping + age fallbacks.
 * Browser: globalThis.LlhLessonPlanCovers
 * Node: module.exports
 */
(function lessonPlanCoversModule() {
  "use strict";

  const COVER_BASE = "/images/lesson-covers";
  const DEFAULT_COVER = `${COVER_BASE}/default.svg`;

  const AGE_COVERS = {
    infant: `${COVER_BASE}/generic-infant.svg`,
    toddler: `${COVER_BASE}/generic-toddler.svg`,
    preschool: `${COVER_BASE}/generic-preschool.svg`,
  };

  // Catalog of unique photographic/illustration covers for every seeded plan.
  // Browser: optional global; Node: require sibling module.
  const catalogApi = (typeof globalThis !== "undefined" && globalThis.LlhLessonPlanCoverCatalog)
    || (typeof require === "function" ? require("./lesson-plan-cover-catalog.js") : null);

  // Exact-title unique storybook covers (SVG) — keep different themes from sharing art.
  const TITLE_COVER_OVERRIDES = {
    "christmas celebration": "christmas-celebration",
    "hibernation and winter sleep": "hibernation-winter-sleep",
    "rainforest adventure": "rainforest-adventure",
    "we belong together": "we-belong-together",
    "caring hearts": "caring-hearts",
    "my home & my family": "my-home-my-family",
    "my home and my family": "my-home-my-family",
    "the people who love me": "people-who-love-me",
    "colors all around us": "colors-all-around-us",
    "my senses": "my-senses",
    "my five senses": "my-five-senses",
    "friendship & feelings": "friendship-feelings",
    "friendship and feelings": "friendship-feelings",
    "farm friends": "farm-friends",
    "weather wonders": "weather-wonders",
    "under the sea": "under-the-sea",
    "growing gardens": "growing-gardens",
    "black & white discovery": "black-white-discovery",
    "black and white discovery": "black-white-discovery",
    "sensory discovery": "sensory-discovery",
    "baby's first conversations": "babys-first-conversations",
    "babys first conversations": "babys-first-conversations",
    "smiles & expressions": "smiles-expressions",
    "smiles and expressions": "smiles-expressions",
    // Family / grandfriends weeks that were wrongly mapped to animal-sounds.jpg
    // because the bare keyword "faces" matched soft-sounds/faces.
    "grandfriends and loving faces": "grandfriends-loving-faces",
    "family faces and loving people": "family-faces-loving-people",
    "my family and familiar faces": "my-family-familiar-faces",
    "grandfriends, photos and little keepsakes": "grandfriends-photos-keepsakes",
    "grandfriends photos and little keepsakes": "grandfriends-photos-keepsakes",
    "friendship problem solvers": "friendship-problem-solvers",
    "hello fall, little one": "hello-fall-little-one",
    "hello fall little one": "hello-fall-little-one",
    "family songs and loving rhythms": "family-songs-loving-rhythms",
    "healthy me": "healthy-me",
    "preschool classroom explorers": "preschool-classroom-explorers",
  };

  // Most-specific phrases first (multi-word before single-word).
  const THEME_COVER_RULES = [
    { match: ["around the world", "world travel", "global"], cover: "around-the-world" },
    // Unique Family Connections weeks before the generic family fallback.
    { match: ["we belong together"], cover: "we-belong-together" },
    { match: ["caring hearts"], cover: "caring-hearts" },
    { match: ["my home and my family", "my home & my family"], cover: "my-home-my-family" },
    { match: ["people who love"], cover: "people-who-love-me" },
    { match: ["christmas celebration", "christmas"], cover: "christmas-celebration" },
    { match: ["hibernation", "winter sleep"], cover: "hibernation-winter-sleep" },
    { match: ["rainforest"], cover: "rainforest-adventure" },
    { match: ["under the sea"], cover: "under-the-sea" },
    { match: ["growing gardens"], cover: "growing-gardens" },
    { match: ["weather wonders"], cover: "weather-wonders" },
    { match: ["farm friends"], cover: "farm-friends" },
    { match: ["friendship and feelings", "friendship & feelings"], cover: "friendship-feelings" },
    { match: ["colors all around"], cover: "colors-all-around-us" },
    { match: ["my five senses"], cover: "my-five-senses" },
    { match: ["my senses"], cover: "my-senses" },
    { match: ["black and white discovery", "black & white discovery"], cover: "black-white-discovery" },
    { match: ["sensory discovery"], cover: "sensory-discovery" },
    { match: ["baby s first conversations", "babys first conversations", "first conversations"], cover: "babys-first-conversations" },
    { match: ["smiles and expressions", "smiles & expressions"], cover: "smiles-expressions" },
    { match: ["family connections", "classroom family", "belonging"], cover: "family" },
    { match: ["reaching", "grasping", "reach and grasp"], cover: "reaching-grasping" },
    { match: ["tummy time", "tummy-time"], cover: "tummy-time" },
    { match: ["peek a boo", "peek-a-boo", "peekaboo"], cover: "peek-a-boo" },
    { match: ["nursery rhyme", "nursery rhymes", "lullaby", "lullabies"], cover: "nursery-rhymes" },
    { match: ["five senses", "5 senses", "senses"], cover: "five-senses" },
    { match: ["music and movement", "music & movement", "music movement"], cover: "music-movement" },
    { match: ["community helper", "community helpers"], cover: "community-helpers" },
    { match: ["kindergarten readiness", "school readiness"], cover: "kindergarten-readiness" },
    { match: ["healthy habit", "healthy habits", "wellness"], cover: "healthy-habits" },
    { match: ["fairy tale", "fairy tales", "fairytale"], cover: "fairy-tales" },
    { match: ["water play", "water wonders", "splash"], cover: "water-play" },
    // Family / grandfriends weeks BEFORE any soft-sounds rules (never match bare "faces").
    { match: ["grandfriends and loving", "loving faces"], cover: "grandfriends-loving-faces" },
    { match: ["family faces and loving", "loving people"], cover: "family-faces-loving-people" },
    { match: ["my family and familiar", "familiar faces"], cover: "my-family-familiar-faces" },
    { match: ["photos and little keepsakes", "little keepsakes"], cover: "grandfriends-photos-keepsakes" },
    { match: ["friendship problem", "problem solvers"], cover: "friendship-problem-solvers" },
    { match: ["hello fall"], cover: "hello-fall-little-one" },
    { match: ["family songs", "loving rhythms"], cover: "family-songs-loving-rhythms" },
    { match: ["healthy me"], cover: "healthy-me" },
    { match: ["classroom explorers"], cover: "preschool-classroom-explorers" },
    { match: ["animal sound", "animal sounds", "soft sounds"], cover: "baby-sounds" },
    { match: ["mirror me", "mirror play", "mirrors"], cover: "mirror-me" },
    { match: ["color", "colours", "rainbow", "crayon", "paint"], cover: "colors" },
    { match: ["farm", "barn", "rooster", "cow"], cover: "farm" },
    { match: ["ocean", "sea", "fish", "coral", "underwater"], cover: "ocean" },
    { match: ["dinosaur", "dino", "prehistoric"], cover: "dinosaurs" },
    { match: ["space", "planet", "astronaut", "rocket", "galaxy"], cover: "space" },
    { match: ["pirate", "treasure", "ship"], cover: "pirates" },
    { match: ["weather", "rain", "cloud", "sunny"], cover: "weather" },
    { match: ["transportation", "vehicle", "car", "train", "airplane", "bus", "boat"], cover: "transportation" },
    { match: ["music", "song", "instrument", "melody"], cover: "music" },
    { match: ["movement", "dance", "dancing"], cover: "music-movement" },
    { match: ["shape", "shapes", "circle", "triangle", "square"], cover: "shapes" },
    { match: ["nature", "forest", "outdoor", "leaf", "leaves"], cover: "nature" },
    { match: ["garden", "plant", "seed", "flower", "gardening"], cover: "garden" },
    { match: ["insect", "bug", "butterfly", "bugs"], cover: "insects" },
    { match: ["animal", "zoo", "pet", "habitat"], cover: "animals" },
    { match: ["family", "all about me", "about me"], cover: "family" },
    { match: ["feeling", "emotion", "feelings", "emotions"], cover: "feelings" },
    { match: ["body", "my body"], cover: "my-body" },
    { match: ["construction", "building", "block", "engineer", "inventor"], cover: "building" },
    { match: ["season", "seasons", "autumn", "winter", "spring", "summer"], cover: "seasons" },
    { match: ["crawl", "crawling"], cover: "crawling" },
    { match: ["letter", "letters", "sounds", "literacy", "number", "numbers", "math"], cover: "kindergarten-readiness" },
    { match: ["apple", "apples", "orchard", "johnny appleseed"], cover: "garden" },
    { match: ["friend", "friends", "friendship", "welcome", "classroom community"], cover: "family" },
    { match: ["baker", "baking", "bakery", "cookies", "kitchen"], cover: "healthy-habits" },
    { match: ["pond", "frog", "duckling", "wetland"], cover: "nature" },
    { match: ["fossil", "fossils", "paleontology"], cover: "dinosaurs" },
    { match: ["ice cream", "popsicle", "summer treat"], cover: "seasons" },
    { match: ["superhero", "superheroes", "hero training"], cover: "community-helpers" },
    { match: ["pet", "pets", "vet", "veterinarian"], cover: "animals" },
    { match: ["camping", "camp"], cover: "nature" },
    { match: ["stem", "science", "scientist", "archaeology"], cover: "kindergarten-readiness" },
    { match: ["holiday", "easter", "july", "new year", "halloween"], cover: "seasons" },
  ];

  // Theme-rule SVG slugs → preferred illustrated JPG slugs when available.
  const THEME_PHOTO_ALIASES = {
    "around-the-world": "around-the-world",
    farm: "farm-animals",
    ocean: "ocean-explorers",
    dinosaurs: "dinosaur-discovery",
    space: "space-adventure",
    pirates: "pirate-adventure",
    insects: "bugs-butterflies",
    building: "construction-crew",
    "community-helpers": "community-helpers",
    "five-senses": "five-senses",
    "fairy-tales": "fairy-tales",
    "healthy-habits": "healthy-habits",
    "kindergarten-readiness": "kindergarten-readiness",
    weather: "weather-watchers",
    transportation: "transportation",
    colors: "colors-everywhere",
    shapes: "shapes-around-us",
    seasons: "seasons-year",
    feelings: "feelings-emotions",
    garden: "gardening-plants",
    animals: "zoo-adventure",
    // Keep family weeks on unique SVG storybook covers (see TITLE_COVER_OVERRIDES).
    // "All About Me" still uses its illustrated JPG via exact catalog title match.
    nature: "camping-adventure",
    "water-play": "water-play-wonders",
    "baby-sounds": "animal-sounds",
  };

  const PHOTO_SLUGS = new Set([
    ...(catalogApi?.PLAN_COVERS || []).map((entry) => entry.slug),
    ...Object.values(THEME_PHOTO_ALIASES),
  ]);

  const SVG_COVER_LIBRARY = [
    { id: "colors", label: "Colors & Art", category: "General Curriculum", path: `${COVER_BASE}/colors.svg` },
    { id: "reaching-grasping", label: "Reaching & Grasping", category: "Infant Development", path: `${COVER_BASE}/reaching-grasping.svg` },
    { id: "around-the-world-svg", label: "Around the World (SVG)", category: "Community", path: `${COVER_BASE}/around-the-world.svg` },
    { id: "farm", label: "Farm Friends (SVG)", category: "Animals", path: `${COVER_BASE}/farm.svg` },
    { id: "animals", label: "Animals", category: "Animals", path: `${COVER_BASE}/animals.svg` },
    { id: "ocean", label: "Ocean Explorers (SVG)", category: "Nature", path: `${COVER_BASE}/ocean.svg` },
    { id: "dinosaurs", label: "Dinosaurs (SVG)", category: "Imaginative Play", path: `${COVER_BASE}/dinosaurs.svg` },
    { id: "space", label: "Space Adventure (SVG)", category: "STEM", path: `${COVER_BASE}/space.svg` },
    { id: "pirates", label: "Pirate Adventure (SVG)", category: "Imaginative Play", path: `${COVER_BASE}/pirates.svg` },
    { id: "weather", label: "Weather Watchers (SVG)", category: "Nature", path: `${COVER_BASE}/weather.svg` },
    { id: "transportation-svg", label: "Transportation (SVG)", category: "Transportation", path: `${COVER_BASE}/transportation.svg` },
    { id: "music", label: "Music", category: "Music and Movement", path: `${COVER_BASE}/music.svg` },
    { id: "music-movement", label: "Music & Movement", category: "Music and Movement", path: `${COVER_BASE}/music-movement.svg` },
    { id: "five-senses-svg", label: "Five Senses (SVG)", category: "Health and Self", path: `${COVER_BASE}/five-senses.svg` },
    { id: "shapes", label: "Shapes (SVG)", category: "General Curriculum", path: `${COVER_BASE}/shapes.svg` },
    { id: "nature", label: "Nature Explorers", category: "Nature", path: `${COVER_BASE}/nature.svg` },
    { id: "garden", label: "Garden (SVG)", category: "Nature", path: `${COVER_BASE}/garden.svg` },
    { id: "insects", label: "Insects & Bugs (SVG)", category: "Animals", path: `${COVER_BASE}/insects.svg` },
    { id: "family", label: "Family & Belonging", category: "Health and Self", path: `${COVER_BASE}/family.svg` },
    { id: "we-belong-together", label: "We Belong Together", category: "Health and Self", path: `${COVER_BASE}/we-belong-together.svg` },
    { id: "caring-hearts", label: "Caring Hearts", category: "Health and Self", path: `${COVER_BASE}/caring-hearts.svg` },
    { id: "my-home-my-family", label: "My Home & My Family", category: "Health and Self", path: `${COVER_BASE}/my-home-my-family.svg` },
    { id: "people-who-love-me", label: "The People Who Love Me", category: "Health and Self", path: `${COVER_BASE}/people-who-love-me.svg` },
    { id: "christmas-celebration", label: "Christmas Celebration", category: "Seasonal", path: `${COVER_BASE}/christmas-celebration.svg` },
    { id: "hibernation-winter-sleep", label: "Hibernation & Winter Sleep", category: "Nature", path: `${COVER_BASE}/hibernation-winter-sleep.svg` },
    { id: "rainforest-adventure", label: "Rainforest Adventure", category: "Nature", path: `${COVER_BASE}/rainforest-adventure.svg` },
    { id: "under-the-sea", label: "Under the Sea", category: "Nature", path: `${COVER_BASE}/under-the-sea.svg` },
    { id: "growing-gardens", label: "Growing Gardens", category: "Nature", path: `${COVER_BASE}/growing-gardens.svg` },
    { id: "weather-wonders", label: "Weather Wonders", category: "Nature", path: `${COVER_BASE}/weather-wonders.svg` },
    { id: "farm-friends", label: "Farm Friends", category: "Animals", path: `${COVER_BASE}/farm-friends.svg` },
    { id: "friendship-feelings", label: "Friendship & Feelings", category: "Health and Self", path: `${COVER_BASE}/friendship-feelings.svg` },
    { id: "colors-all-around-us", label: "Colors All Around Us", category: "Infant Development", path: `${COVER_BASE}/colors-all-around-us.svg` },
    { id: "my-senses", label: "My Senses", category: "Infant Development", path: `${COVER_BASE}/my-senses.svg` },
    { id: "my-five-senses", label: "My Five Senses", category: "Health and Self", path: `${COVER_BASE}/my-five-senses.svg` },
    { id: "black-white-discovery", label: "Black & White Discovery", category: "Infant Development", path: `${COVER_BASE}/black-white-discovery.svg` },
    { id: "sensory-discovery", label: "Sensory Discovery", category: "Infant Development", path: `${COVER_BASE}/sensory-discovery.svg` },
    { id: "babys-first-conversations", label: "Baby's First Conversations", category: "Infant Development", path: `${COVER_BASE}/babys-first-conversations.svg` },
    { id: "smiles-expressions", label: "Smiles & Expressions", category: "Infant Development", path: `${COVER_BASE}/smiles-expressions.svg` },
    { id: "grandfriends-loving-faces", label: "Grandfriends & Loving Faces", category: "Health and Self", path: `${COVER_BASE}/grandfriends-loving-faces.svg` },
    { id: "family-faces-loving-people", label: "Family Faces & Loving People", category: "Health and Self", path: `${COVER_BASE}/family-faces-loving-people.svg` },
    { id: "my-family-familiar-faces", label: "My Family & Familiar Faces", category: "Health and Self", path: `${COVER_BASE}/my-family-familiar-faces.svg` },
    { id: "grandfriends-photos-keepsakes", label: "Grandfriends Photos & Keepsakes", category: "Health and Self", path: `${COVER_BASE}/grandfriends-photos-keepsakes.svg` },
    { id: "friendship-problem-solvers", label: "Friendship Problem Solvers", category: "Health and Self", path: `${COVER_BASE}/friendship-problem-solvers.svg` },
    { id: "hello-fall-little-one", label: "Hello Fall, Little One", category: "Seasonal", path: `${COVER_BASE}/hello-fall-little-one.svg` },
    { id: "family-songs-loving-rhythms", label: "Family Songs & Loving Rhythms", category: "Music and Movement", path: `${COVER_BASE}/family-songs-loving-rhythms.svg` },
    { id: "healthy-me", label: "Healthy Me", category: "Health and Self", path: `${COVER_BASE}/healthy-me.svg` },
    { id: "preschool-classroom-explorers", label: "Preschool Classroom Explorers", category: "General Curriculum", path: `${COVER_BASE}/preschool-classroom-explorers.svg` },
    { id: "feelings", label: "Feelings & Emotions (SVG)", category: "Health and Self", path: `${COVER_BASE}/feelings.svg` },
    { id: "my-body", label: "My Body", category: "Health and Self", path: `${COVER_BASE}/my-body.svg` },
    { id: "community-helpers-svg", label: "Community Helpers (SVG)", category: "Community", path: `${COVER_BASE}/community-helpers.svg` },
    { id: "building", label: "Building & Blocks", category: "STEM", path: `${COVER_BASE}/building.svg` },
    { id: "fairy-tales-svg", label: "Fairy Tales (SVG)", category: "Imaginative Play", path: `${COVER_BASE}/fairy-tales.svg` },
    { id: "healthy-habits-svg", label: "Healthy Habits (SVG)", category: "Health and Self", path: `${COVER_BASE}/healthy-habits.svg` },
    { id: "seasons", label: "Seasons (SVG)", category: "Seasonal", path: `${COVER_BASE}/seasons.svg` },
    { id: "kindergarten-readiness-svg", label: "Kindergarten Readiness (SVG)", category: "General Curriculum", path: `${COVER_BASE}/kindergarten-readiness.svg` },
    { id: "tummy-time", label: "Tummy Time", category: "Infant Development", path: `${COVER_BASE}/tummy-time.svg` },
    { id: "crawling", label: "Crawling", category: "Infant Development", path: `${COVER_BASE}/crawling.svg` },
    { id: "mirror-me", label: "Mirror Play", category: "Infant Development", path: `${COVER_BASE}/mirror-me.svg` },
    { id: "peek-a-boo", label: "Peek-a-Boo", category: "Infant Development", path: `${COVER_BASE}/peek-a-boo.svg` },
    { id: "nursery-rhymes", label: "Nursery Rhymes", category: "Music and Movement", path: `${COVER_BASE}/nursery-rhymes.svg` },
    { id: "water-play", label: "Water Play (SVG)", category: "Infant Development", path: `${COVER_BASE}/water-play.svg` },
    { id: "baby-sounds", label: "Baby Sounds & Faces", category: "Infant Development", path: `${COVER_BASE}/baby-sounds.svg` },
    { id: "generic-infant", label: "Generic Infant", category: "Infant Development", path: `${COVER_BASE}/generic-infant.svg` },
    { id: "generic-toddler", label: "Generic Toddler", category: "General Curriculum", path: `${COVER_BASE}/generic-toddler.svg` },
    { id: "generic-preschool", label: "Generic Preschool", category: "General Curriculum", path: `${COVER_BASE}/generic-preschool.svg` },
    { id: "default", label: "Little Learner Hub Default", category: "General Curriculum", path: `${COVER_BASE}/default.svg` },
  ];

  const PHOTO_COVER_LIBRARY = (catalogApi?.PLAN_COVERS || []).map((entry) => ({
    id: entry.slug,
    label: entry.title,
    category: entry.age || "Lesson Plans",
    path: `${COVER_BASE}/${entry.slug}.jpg`,
    format: "jpg",
  }));

  // Admin picker + tests: illustrated covers first, SVG fallbacks after.
  const EXISTING_COVER_LIBRARY = [...PHOTO_COVER_LIBRARY, ...SVG_COVER_LIBRARY];

  function normalizeTheme(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ageGroupKey(age) {
    const text = String(age || "").toLowerCase();
    if (/\binfant\b|0\s*[-–]\s*12|0\s*to\s*12/.test(text)) return "infant";
    if (/\btoddler\b/.test(text)) return "toddler";
    return "preschool";
  }

  function coverPath(slug, preferredExt) {
    const photoSlug = THEME_PHOTO_ALIASES[slug] || (PHOTO_SLUGS.has(slug) ? slug : "");
    if (preferredExt === "jpg" || photoSlug) {
      return `${COVER_BASE}/${photoSlug || slug}.jpg`;
    }
    return `${COVER_BASE}/${slug}.svg`;
  }

  function getPlanCatalogCover(title) {
    const key = String(title || "").trim().toLowerCase();
    const overrideSlug = TITLE_COVER_OVERRIDES[key];
    if (overrideSlug) return `${COVER_BASE}/${overrideSlug}.svg`;
    const entry = catalogApi?.getPlanCoverByTitle?.(title);
    if (!entry) return "";
    const ext = entry.format === "svg" ? "svg" : "jpg";
    return `${COVER_BASE}/${entry.slug}.${ext}`;
  }

  function getMappedThemeCover(title, theme) {
    const catalogCover = getPlanCatalogCover(title);
    if (catalogCover) return catalogCover;

    const haystack = normalizeTheme(`${title || ""} ${theme || ""}`);
    if (!haystack) return "";
    const paddedHaystack = ` ${haystack} `;
    for (const rule of THEME_COVER_RULES) {
      if (rule.match.some((phrase) => {
        const normalizedPhrase = normalizeTheme(phrase);
        return paddedHaystack.includes(` ${normalizedPhrase} `)
          || paddedHaystack.includes(` ${normalizedPhrase}s `);
      })) {
        // Prefer unique SVG when the rule slug is not an illustrated JPG alias.
        if (!THEME_PHOTO_ALIASES[rule.cover] && !PHOTO_SLUGS.has(rule.cover)) {
          return `${COVER_BASE}/${rule.cover}.svg`;
        }
        return coverPath(rule.cover);
      }
    }
    return "";
  }

  function getAgeGroupFallback(age) {
    return AGE_COVERS[ageGroupKey(age)] || DEFAULT_COVER;
  }

  function resolveLessonPlanCover(planOrResource = {}) {
    const entry = planOrResource && typeof planOrResource === "object" ? planOrResource : {};
    const plan = entry._curriculumLessonPlan && typeof entry._curriculumLessonPlan === "object"
      ? entry._curriculumLessonPlan
      : entry;
    const title = plan.title || entry.title || "lesson plan";
    const theme = plan.theme || entry.theme || "";
    const age = plan.age || entry.age || "";
    const position = plan.coverImagePosition || entry.coverImagePosition || "center";
    // Explicit cover on the lesson-plan record wins. Do not treat auto-injected
    // previewData/thumbnailUrl as custom for curriculum plans — those are display caches.
    const explicit = String(plan.coverImageUrl || entry.coverImageUrl || "").trim();
    if (explicit) {
      return {
        url: explicit,
        alt: String(plan.coverImageAlt || entry.coverImageAlt || "").trim()
          || `Cover illustration for ${title}`,
        source: plan.coverImageSource || entry.coverImageSource || "uploaded",
        position,
      };
    }
    const mapped = getMappedThemeCover(title, theme);
    if (mapped) {
      return {
        url: mapped,
        alt: String(plan.coverImageAlt || entry.coverImageAlt || "").trim()
          || `Illustration for ${theme || title}`,
        source: "mapped",
        position,
      };
    }
    const isCurriculum = Boolean(entry._curriculumManaged || plan.dailyPlans);
    if (!isCurriculum) {
      const legacy = String(entry.previewData || entry.thumbnailUrl || plan.thumbnailUrl || "").trim();
      if (legacy) {
        return {
          url: legacy,
          alt: String(plan.coverImageAlt || entry.coverImageAlt || "").trim()
            || `Cover illustration for ${title}`,
          source: "uploaded",
          position,
        };
      }
    }
    const ageCover = getAgeGroupFallback(age);
    return {
      url: ageCover || DEFAULT_COVER,
      alt: `Early childhood lesson plan cover for ${age || "preschool"}`,
      source: "default",
      position: "center",
    };
  }

  function resolveLessonPlanCoverAlt(planOrResource) {
    return resolveLessonPlanCover(planOrResource).alt;
  }

  function resolveLessonPlanCoverFallbacks(planOrResource = {}) {
    const entry = planOrResource && typeof planOrResource === "object" ? planOrResource : {};
    const plan = entry._curriculumLessonPlan && typeof entry._curriculumLessonPlan === "object"
      ? entry._curriculumLessonPlan
      : entry;
    const resolved = resolveLessonPlanCover(entry);
    const mapped = getMappedThemeCover(plan.title || entry.title, plan.theme || entry.theme);
    const age = getAgeGroupFallback(plan.age || entry.age);
    const svgFallback = (() => {
      const haystack = normalizeTheme(`${plan.title || entry.title || ""} ${plan.theme || entry.theme || ""}`);
      if (!haystack) return "";
      const paddedHaystack = ` ${haystack} `;
      for (const rule of THEME_COVER_RULES) {
        if (rule.match.some((phrase) => {
          const normalizedPhrase = normalizeTheme(phrase);
          return paddedHaystack.includes(` ${normalizedPhrase} `)
            || paddedHaystack.includes(` ${normalizedPhrase}s `);
        })) {
          return `${COVER_BASE}/${rule.cover}.svg`;
        }
      }
      return "";
    })();
    return [...new Set([resolved.url, mapped, svgFallback, age, DEFAULT_COVER].filter(Boolean))];
  }

  function shortThemeDescription(planOrResource = {}) {
    const entry = planOrResource && typeof planOrResource === "object" ? planOrResource : {};
    const overview = String(entry.weeklyOverview || entry.description || "").replace(/\s+/g, " ").trim();
    if (overview) {
      const sentence = overview.match(/^(.+?[.!?])(?:\s|$)/);
      const text = (sentence ? sentence[1] : overview).trim();
      return text.length > 90 ? `${text.slice(0, 87).trim()}…` : text;
    }
    const theme = String(entry.theme || "").trim();
    if (theme && theme.toLowerCase() !== String(entry.title || "").trim().toLowerCase()) {
      return theme;
    }
    return "";
  }

  const api = {
    COVER_BASE,
    DEFAULT_COVER,
    EXISTING_COVER_LIBRARY,
    SVG_COVER_LIBRARY,
    PHOTO_COVER_LIBRARY,
    TITLE_COVER_OVERRIDES,
    THEME_COVER_RULES,
    THEME_PHOTO_ALIASES,
    normalizeTheme,
    ageGroupKey,
    coverPath,
    getPlanCatalogCover,
    getMappedThemeCover,
    getAgeGroupFallback,
    resolveLessonPlanCover,
    resolveLessonPlanCoverAlt,
    resolveLessonPlanCoverFallbacks,
    shortThemeDescription,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhLessonPlanCovers = api;
  }
})();
