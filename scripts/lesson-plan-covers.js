/**
 * Lesson plan cover resolver — plan catalog + theme mapping + age fallbacks.
 * Browser: globalThis.LlhLessonPlanCovers
 * Node: module.exports
 */
(function lessonPlanCoversModule() {
  "use strict";

  const COVER_BASE = "/images/lesson-covers";
  const DEFAULT_COVER = `${COVER_BASE}/default.svg`;
  // Bump when replacing JPGs so browsers/SW do not keep stale cover artwork.
  const COVER_ASSET_VERSION = "20260721-cover-netflix-nav";

  const AGE_COVERS = {
    infant: `${COVER_BASE}/generic-infant.svg`,
    toddler: `${COVER_BASE}/generic-toddler.svg`,
    preschool: `${COVER_BASE}/generic-preschool.svg`,
  };

  const PLACEHOLDER_COVER_RE = /\/(default|generic-infant|generic-toddler|generic-preschool)\.svg(?:$|\?)/i;

  function isPlaceholderCoverUrl(url) {
    return PLACEHOLDER_COVER_RE.test(String(url || "").trim());
  }

  function withCoverCacheBust(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (!raw.includes("/images/lesson-covers/")) return raw;
    if (/[?&]v=/.test(raw)) return raw;
    return `${raw}${raw.includes("?") ? "&" : "?"}v=${COVER_ASSET_VERSION}`;
  }

  // Catalog of unique photographic/illustration covers for every seeded plan.
  // Browser: optional global; Node: require sibling module.
  const catalogApi = (typeof globalThis !== "undefined" && globalThis.LlhLessonPlanCoverCatalog)
    || (typeof require === "function" ? require("./lesson-plan-cover-catalog.js") : null);

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
    { match: ["black and white", "black white", "high contrast", "contrast cards"], cover: "black-white-discovery" },
    { match: ["healthy me", "healthy habit", "healthy habits", "wellness"], cover: "healthy-me" },
    { match: ["sensory discovery", "sensory play", "texture adventure"], cover: "sensory-discovery" },
    { match: ["smiles and expressions", "smiles expressions", "expressions"], cover: "smiles-expressions" },
    { match: ["first conversations", "baby conversation", "babys first"], cover: "babys-first-conversations" },
    { match: ["fairy tale", "fairy tales", "fairytale"], cover: "fairy-tales" },
    { match: ["water play", "water wonders", "splash"], cover: "water-play" },
    { match: ["animal sound", "soft sounds", "faces"], cover: "baby-sounds" },
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
    // Week-specific October-style themes (before broader seasonal matches).
    { match: ["friendly halloween"], cover: "friendly-halloween-week" },
    { match: ["fall leaves", "autumn leaves"], cover: "fall-leaves-week" },
    { match: ["halloween", "spooky"], cover: "friendly-halloween-week" },
    { match: ["pumpkin", "pumpkins", "pumpkin patch"], cover: "pumpkins-week" },
    { match: ["apple", "apples", "orchard"], cover: "apples-week" },
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
    { match: ["holiday", "easter", "july", "new year", "christmas"], cover: "seasons" },
    { match: ["back to school", "classroom helpers", "first week"], cover: "kindergarten-readiness" },
  ];

  // Known weekly theme tokens used to build / match composite monthly covers.
  const WEEK_THEME_TOKENS = [
    { id: "fall-leaves", match: ["fall leaves", "autumn leaves", "falling leaves"], cover: "fall-leaves-week" },
    { id: "apples", match: ["apple", "apples", "orchard"], cover: "apples-week" },
    { id: "pumpkins", match: ["pumpkin", "pumpkins", "pumpkin patch"], cover: "pumpkins-week" },
    { id: "halloween", match: ["friendly halloween", "halloween", "spooky"], cover: "friendly-halloween-week" },
  ];

  // Composite monthly covers that visually combine multiple weekly themes.
  // `require` = theme token ids that must all be present among linked weeks.
  const SERIES_COMPOSITE_COVERS = [
    {
      slug: "october-preschool-curriculum",
      titleMatch: ["october preschool", "october curriculum"],
      month: "october",
      require: ["fall-leaves", "apples", "pumpkins", "halloween"],
      minMatches: 3,
      alt: "October preschool curriculum cover with fall leaves, apples, pumpkins, and friendly Halloween",
    },
  ];

  // Monthly curriculum month/season → preferred illustrated cover slug (generic fallback only).
  const SERIES_MONTH_COVERS = {
    january: "new-year-celebration",
    february: "feelings-emotions",
    march: "gardening-plants",
    april: "easter-spring-science",
    may: "gardening-plants",
    june: "ocean-explorers",
    july: "july4-celebration",
    august: "camping-adventure",
    september: "apple-orchard-adventure",
    october: "october-preschool-curriculum",
    november: "seasons-year",
    december: "new-year-little",
  };

  const SERIES_SEASON_COVERS = {
    spring: "gardening-plants",
    summer: "ocean-explorers",
    fall: "seasons-year",
    autumn: "seasons-year",
    winter: "seasons-year",
    "back to school": "kindergarten-readiness",
    holiday: "new-year-celebration",
  };

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
    family: "all-about-me",
    nature: "camping-adventure",
    "water-play": "water-play-wonders",
    "baby-sounds": "animal-sounds",
    "black-white-discovery": "black-white-discovery",
    "healthy-me": "healthy-me",
    "sensory-discovery": "sensory-discovery",
    "smiles-expressions": "smiles-expressions",
    "babys-first-conversations": "babys-first-conversations",
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
    if (preferredExt === "jpg" || photoSlug || PHOTO_SLUGS.has(slug)) {
      return withCoverCacheBust(`${COVER_BASE}/${photoSlug || slug}.jpg`);
    }
    return withCoverCacheBust(`${COVER_BASE}/${slug}.svg`);
  }

  function getPlanCatalogCover(title) {
    const entry = catalogApi?.getPlanCoverByTitle?.(title);
    if (!entry) return "";
    return withCoverCacheBust(`${COVER_BASE}/${entry.slug}.jpg`);
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
    // Explicit cover on the lesson-plan record wins — unless it is a stale
    // generic/default placeholder left from an earlier seed/import.
    const explicitRaw = String(plan.coverImageUrl || entry.coverImageUrl || "").trim();
    const explicit = explicitRaw && !isPlaceholderCoverUrl(explicitRaw) ? explicitRaw : "";
    if (explicit) {
      return {
        url: withCoverCacheBust(explicit),
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
      if (legacy && !isPlaceholderCoverUrl(legacy)) {
        return {
          url: withCoverCacheBust(legacy),
          alt: String(plan.coverImageAlt || entry.coverImageAlt || "").trim()
            || `Cover illustration for ${title}`,
          source: "uploaded",
          position,
        };
      }
    }
    const ageCover = getAgeGroupFallback(age);
    return {
      url: withCoverCacheBust(ageCover || DEFAULT_COVER),
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

  function collectSeriesThemeHaystack(series = {}) {
    const entry = series && typeof series === "object" ? series : {};
    const chunks = [
      entry.title,
      entry.theme,
      entry.description,
      entry.month,
      entry.season,
    ];
    const weekThemes = Array.isArray(entry.weekThemes) ? entry.weekThemes : [];
    weekThemes.forEach((value) => chunks.push(value));
    const linked = Array.isArray(entry.linkedPlans)
      ? entry.linkedPlans
      : (Array.isArray(entry._linkedPlans) ? entry._linkedPlans : []);
    linked.forEach((plan) => {
      if (!plan || typeof plan !== "object") return;
      chunks.push(plan.title, plan.theme, plan.weeklyOverview);
    });
    (Array.isArray(entry.weeks) ? entry.weeks : []).forEach((week) => {
      if (!week || typeof week !== "object") return;
      chunks.push(week.title, week.theme, week.label, week.lessonPlanTitle);
    });
    return normalizeTheme(chunks.filter(Boolean).join(" "));
  }

  function detectWeekThemeTokens(haystack) {
    const padded = ` ${normalizeTheme(haystack)} `;
    if (!padded.trim()) return [];
    const found = [];
    for (const token of WEEK_THEME_TOKENS) {
      const hit = token.match.some((phrase) => {
        const normalizedPhrase = normalizeTheme(phrase);
        return padded.includes(` ${normalizedPhrase} `)
          || padded.includes(` ${normalizedPhrase}s `);
      });
      if (hit) found.push(token.id);
    }
    return found;
  }

  function resolveCompositeSeriesCover(series = {}) {
    const entry = series && typeof series === "object" ? series : {};
    const titleKey = normalizeTheme(entry.title || "");
    const monthKey = normalizeTheme(entry.month || "");
    const haystack = collectSeriesThemeHaystack(entry);
    const tokens = detectWeekThemeTokens(haystack);
    const tokenSet = new Set(tokens);

    for (const composite of SERIES_COMPOSITE_COVERS) {
      const titleHit = (composite.titleMatch || []).some((phrase) => titleKey.includes(normalizeTheme(phrase)));
      const monthHit = Boolean(composite.month && monthKey === normalizeTheme(composite.month));
      const required = composite.require || [];
      const matchCount = required.filter((id) => tokenSet.has(id)).length;
      const minMatches = Number(composite.minMatches) || required.length || 1;
      const themesHit = matchCount >= minMatches;
      // Use the composite when the series is clearly this month/collection, or when
      // linked weekly themes match the illustration's combined subjects.
      if (titleHit || themesHit || (monthHit && (!tokens.length || themesHit))) {
        return {
          slug: composite.slug,
          alt: composite.alt || `Composite monthly curriculum cover for ${entry.title || entry.month || "this month"}`,
          tokens,
          matchCount,
        };
      }
    }
    return null;
  }

  function isStaleGenericSeriesCover(url, series = {}) {
    const normalized = String(url || "").trim().toLowerCase();
    if (!normalized) return false;
    const monthKey = normalizeTheme(series.month || "");
    const titleKey = normalizeTheme(series.title || "");
    const looksOctober = monthKey === "october"
      || titleKey.includes("october preschool")
      || titleKey.includes("october curriculum");
    if (!looksOctober) return false;
    // Older Phase 1 builds mapped October to the generic seasons image.
    return normalized.includes("/images/lesson-covers/seasons-year.jpg")
      || normalized.endsWith("/seasons-year.jpg")
      || normalized.endsWith("/seasons-year.svg");
  }

  function resolveCurriculumSeriesCover(series = {}) {
    const entry = series && typeof series === "object" ? series : {};
    const title = entry.title || "Monthly Curriculum";
    const month = String(entry.month || "").trim();
    const season = String(entry.season || "").trim();
    const theme = entry.theme || [month, season].filter(Boolean).join(" ") || title;
    const age = entry.age || "Preschool";
    const position = entry.coverImagePosition || "center";
    const explicitRaw = String(entry.coverImageUrl || "").trim();
    const explicit = explicitRaw && !explicitRaw.startsWith("data:")
      && !isPlaceholderCoverUrl(explicitRaw)
      && !isStaleGenericSeriesCover(explicitRaw, entry)
      ? explicitRaw
      : "";
    if (explicit) {
      return {
        url: withCoverCacheBust(explicit),
        alt: String(entry.coverImageAlt || "").trim() || `Cover illustration for ${title}`,
        source: entry.coverImageSource || "uploaded",
        position,
      };
    }

    // 1) Composite illustrated cover that combines the month's weekly themes.
    const composite = resolveCompositeSeriesCover(entry);
    if (composite?.slug) {
      return {
        url: coverPath(composite.slug),
        alt: String(entry.coverImageAlt || "").trim() || composite.alt,
        source: "mapped",
        position,
      };
    }

    // 2) Exact catalog match on the monthly series title.
    const catalogCover = getPlanCatalogCover(title);
    if (catalogCover) {
      return {
        url: catalogCover,
        alt: String(entry.coverImageAlt || "").trim()
          || `Illustrated cover for ${title}`,
        source: "mapped",
        position,
      };
    }

    // 3) Theme text from linked weeks / series theme (still more specific than bare month).
    const weekHaystack = collectSeriesThemeHaystack(entry);
    const weekMapped = getMappedThemeCover(title, weekHaystack || theme);
    // Avoid collapsing a multi-theme month onto a single week cover when we have
    // several distinct week tokens — prefer month fallback below instead.
    const weekTokens = detectWeekThemeTokens(weekHaystack);
    if (weekMapped && weekTokens.length <= 1) {
      return {
        url: weekMapped,
        alt: String(entry.coverImageAlt || "").trim() || `Illustration for ${theme || title}`,
        source: "mapped",
        position,
      };
    }

    // 4) Generic month / season library cover (last illustrated resort).
    const monthKey = normalizeTheme(month);
    const seasonKey = normalizeTheme(season);
    const monthSlug = SERIES_MONTH_COVERS[monthKey] || "";
    const seasonSlug = SERIES_SEASON_COVERS[seasonKey] || "";
    const preferredSlug = monthSlug || seasonSlug;
    if (preferredSlug) {
      return {
        url: coverPath(preferredSlug),
        alt: String(entry.coverImageAlt || "").trim()
          || `Illustrated cover for ${month || season || title}`,
        source: "mapped",
        position,
      };
    }

    const mapped = getMappedThemeCover(title, theme);
    if (mapped) {
      return {
        url: mapped,
        alt: String(entry.coverImageAlt || "").trim() || `Illustration for ${theme || title}`,
        source: "mapped",
        position,
      };
    }
    return {
      url: withCoverCacheBust(getAgeGroupFallback(age) || DEFAULT_COVER),
      alt: `Early childhood curriculum cover for ${age}`,
      source: "default",
      position: "center",
    };
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
    COVER_ASSET_VERSION,
    DEFAULT_COVER,
    EXISTING_COVER_LIBRARY,
    SVG_COVER_LIBRARY,
    PHOTO_COVER_LIBRARY,
    THEME_COVER_RULES,
    THEME_PHOTO_ALIASES,
    WEEK_THEME_TOKENS,
    SERIES_COMPOSITE_COVERS,
    normalizeTheme,
    ageGroupKey,
    coverPath,
    getPlanCatalogCover,
    getMappedThemeCover,
    getAgeGroupFallback,
    isPlaceholderCoverUrl,
    withCoverCacheBust,
    collectSeriesThemeHaystack,
    detectWeekThemeTokens,
    resolveCompositeSeriesCover,
    isStaleGenericSeriesCover,
    resolveLessonPlanCover,
    resolveLessonPlanCoverAlt,
    resolveLessonPlanCoverFallbacks,
    resolveCurriculumSeriesCover,
    SERIES_MONTH_COVERS,
    SERIES_SEASON_COVERS,
    shortThemeDescription,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhLessonPlanCovers = api;
  }
})();
