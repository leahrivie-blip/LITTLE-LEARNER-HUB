/**
 * Lesson plan cover resolver — theme mapping + age fallbacks.
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

  // Most-specific phrases first (multi-word before single-word).
  const THEME_COVER_RULES = [
    { match: ["around the world", "world travel", "global"], cover: "around-the-world" },
    { match: ["reaching", "grasping", "reach and grasp"], cover: "reaching-grasping" },
    { match: ["tummy time", "tummy-time"], cover: "tummy-time" },
    { match: ["peek a boo", "peek-a-boo", "peekaboo"], cover: "peek-a-boo" },
    { match: ["nursery rhyme", "nursery rhymes", "lullaby", "lullabies"], cover: "nursery-rhymes" },
    { match: ["five senses", "5 senses", "my five senses", "senses"], cover: "five-senses" },
    { match: ["music and movement", "music & movement", "music movement"], cover: "music-movement" },
    { match: ["community helper", "community helpers"], cover: "community-helpers" },
    { match: ["kindergarten readiness", "school readiness"], cover: "kindergarten-readiness" },
    { match: ["healthy habit", "healthy habits", "wellness"], cover: "healthy-habits" },
    { match: ["fairy tale", "fairy tales", "fairytale"], cover: "fairy-tales" },
    { match: ["water play", "water wonders", "splash"], cover: "water-play" },
    { match: ["animal sound", "baby conversation", "soft sounds", "faces"], cover: "baby-sounds" },
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
    { match: ["family", "belonging", "all about me", "about me"], cover: "family" },
    { match: ["feeling", "emotion", "feelings", "emotions"], cover: "feelings" },
    { match: ["body", "my body"], cover: "my-body" },
    { match: ["construction", "building", "block", "engineer", "inventor"], cover: "building" },
    { match: ["season", "seasons", "autumn", "winter", "spring", "summer"], cover: "seasons" },
    { match: ["crawl", "crawling"], cover: "crawling" },
    { match: ["letter", "letters", "sounds", "literacy", "number", "numbers", "math"], cover: "kindergarten-readiness" },
    { match: ["camping", "camp"], cover: "nature" },
    { match: ["stem", "science", "scientist", "archaeology"], cover: "kindergarten-readiness" },
    { match: ["holiday", "easter", "july", "new year", "christmas", "halloween"], cover: "seasons" },
  ];

  const EXISTING_COVER_LIBRARY = [
    { id: "colors", label: "Colors & Art", category: "General Curriculum", path: `${COVER_BASE}/colors.svg` },
    { id: "reaching-grasping", label: "Reaching & Grasping", category: "Infant Development", path: `${COVER_BASE}/reaching-grasping.svg` },
    { id: "around-the-world", label: "Around the World", category: "Community", path: `${COVER_BASE}/around-the-world.svg` },
    { id: "farm", label: "Farm Friends", category: "Animals", path: `${COVER_BASE}/farm.svg` },
    { id: "animals", label: "Animals", category: "Animals", path: `${COVER_BASE}/animals.svg` },
    { id: "ocean", label: "Ocean Explorers", category: "Nature", path: `${COVER_BASE}/ocean.svg` },
    { id: "dinosaurs", label: "Dinosaurs", category: "Imaginative Play", path: `${COVER_BASE}/dinosaurs.svg` },
    { id: "space", label: "Space Adventure", category: "STEM", path: `${COVER_BASE}/space.svg` },
    { id: "pirates", label: "Pirate Adventure", category: "Imaginative Play", path: `${COVER_BASE}/pirates.svg` },
    { id: "weather", label: "Weather Watchers", category: "Nature", path: `${COVER_BASE}/weather.svg` },
    { id: "transportation", label: "Transportation", category: "Transportation", path: `${COVER_BASE}/transportation.svg` },
    { id: "music", label: "Music", category: "Music and Movement", path: `${COVER_BASE}/music.svg` },
    { id: "music-movement", label: "Music & Movement", category: "Music and Movement", path: `${COVER_BASE}/music-movement.svg` },
    { id: "five-senses", label: "Five Senses", category: "Health and Self", path: `${COVER_BASE}/five-senses.svg` },
    { id: "shapes", label: "Shapes", category: "General Curriculum", path: `${COVER_BASE}/shapes.svg` },
    { id: "nature", label: "Nature Explorers", category: "Nature", path: `${COVER_BASE}/nature.svg` },
    { id: "garden", label: "Garden", category: "Nature", path: `${COVER_BASE}/garden.svg` },
    { id: "insects", label: "Insects & Bugs", category: "Animals", path: `${COVER_BASE}/insects.svg` },
    { id: "family", label: "Family & Belonging", category: "Health and Self", path: `${COVER_BASE}/family.svg` },
    { id: "feelings", label: "Feelings & Emotions", category: "Health and Self", path: `${COVER_BASE}/feelings.svg` },
    { id: "my-body", label: "My Body", category: "Health and Self", path: `${COVER_BASE}/my-body.svg` },
    { id: "community-helpers", label: "Community Helpers", category: "Community", path: `${COVER_BASE}/community-helpers.svg` },
    { id: "building", label: "Building & Blocks", category: "STEM", path: `${COVER_BASE}/building.svg` },
    { id: "fairy-tales", label: "Fairy Tales", category: "Imaginative Play", path: `${COVER_BASE}/fairy-tales.svg` },
    { id: "healthy-habits", label: "Healthy Habits", category: "Health and Self", path: `${COVER_BASE}/healthy-habits.svg` },
    { id: "seasons", label: "Seasons", category: "Seasonal", path: `${COVER_BASE}/seasons.svg` },
    { id: "kindergarten-readiness", label: "Kindergarten Readiness", category: "General Curriculum", path: `${COVER_BASE}/kindergarten-readiness.svg` },
    { id: "tummy-time", label: "Tummy Time", category: "Infant Development", path: `${COVER_BASE}/tummy-time.svg` },
    { id: "crawling", label: "Crawling", category: "Infant Development", path: `${COVER_BASE}/crawling.svg` },
    { id: "mirror-me", label: "Mirror Play", category: "Infant Development", path: `${COVER_BASE}/mirror-me.svg` },
    { id: "peek-a-boo", label: "Peek-a-Boo", category: "Infant Development", path: `${COVER_BASE}/peek-a-boo.svg` },
    { id: "nursery-rhymes", label: "Nursery Rhymes", category: "Music and Movement", path: `${COVER_BASE}/nursery-rhymes.svg` },
    { id: "water-play", label: "Water Play", category: "Infant Development", path: `${COVER_BASE}/water-play.svg` },
    { id: "baby-sounds", label: "Baby Sounds & Faces", category: "Infant Development", path: `${COVER_BASE}/baby-sounds.svg` },
    { id: "generic-infant", label: "Generic Infant", category: "Infant Development", path: `${COVER_BASE}/generic-infant.svg` },
    { id: "generic-toddler", label: "Generic Toddler", category: "General Curriculum", path: `${COVER_BASE}/generic-toddler.svg` },
    { id: "generic-preschool", label: "Generic Preschool", category: "General Curriculum", path: `${COVER_BASE}/generic-preschool.svg` },
    { id: "default", label: "Little Learner Hub Default", category: "General Curriculum", path: `${COVER_BASE}/default.svg` },
  ];

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

  function coverPath(slug) {
    return `${COVER_BASE}/${slug}.svg`;
  }

  function getMappedThemeCover(title, theme) {
    const haystack = normalizeTheme(`${title || ""} ${theme || ""}`);
    if (!haystack) return "";
    for (const rule of THEME_COVER_RULES) {
      if (rule.match.some((phrase) => haystack.includes(normalizeTheme(phrase)))) {
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
        position: "center",
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
    THEME_COVER_RULES,
    normalizeTheme,
    ageGroupKey,
    getMappedThemeCover,
    getAgeGroupFallback,
    resolveLessonPlanCover,
    resolveLessonPlanCoverAlt,
    shortThemeDescription,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhLessonPlanCovers = api;
  }
})();
