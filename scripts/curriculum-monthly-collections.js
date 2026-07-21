/**
 * Starter Monthly Curriculum collections — playlist-style references to existing
 * weekly lesson plans (no duplication).
 *
 * RULE: Never auto-substitute a similar title. Lookups are exact title + age.
 * If the exact requested plan title is not in that age map, leave lessonPlanId
 * empty and set needsManualPick so the owner can choose manually.
 */
(function curriculumMonthlyCollectionsModule() {
  "use strict";

  /**
   * Exact title → stable lesson plan id, scoped by curriculum age.
   * Only titles that exist verbatim for that age family.
   */
  const EXACT_PLAN_IDS_BY_AGE = Object.freeze({
    Infant: Object.freeze({
      "My Senses": "cur-lp-infant-my-senses",
      "Black & White Discovery": "cur-lp-infant-black-white-discovery",
      "Colors All Around Us": "cur-lp-infant-colors-all-around-us",
      "Tummy Time Adventures": "cur-lp-infant-tummy-time-adventures",
      "Reaching & Grasping Adventures": "cur-lp-infant-reaching-grasping-adventures",
      "Baby's First Conversations": "cur-lp-infant-baby-s-first-conversations",
      "Nursery Rhymes & Lullabies": "cur-lp-infant-nursery-rhymes-lullabies",
      "Peek-A-Boo & Play": "cur-lp-infant-peek-a-boo-play",
      "Mirror Me": "cur-lp-infant-mirror-me",
      "Smiles & Expressions": "cur-lp-infant-smiles-expressions",
    }),
    Toddler: Object.freeze({
      "All About Me": "cur-lp-toddler-all-about-me",
      "Friendship & Feelings": "cur-lp-toddler-friendship-feelings",
      "Healthy Me": "cur-lp-toddler-healthy-me",
      "My Five Senses": "cur-lp-toddler-my-five-senses",
      "Community Helpers": "cur-lp-toddler-community-helpers",
      "Construction Crew": "cur-lp-toddler-construction-crew",
      "Pet Vet Clinic": "cur-lp-toddler-pet-vet-clinic",
      "Growing Gardens": "cur-lp-toddler-growing-gardens",
      "Bugs & Butterflies": "cur-lp-toddler-bugs-and-butterflies",
      "Farm Friends": "cur-lp-toddler-farm-friends",
      "Camping Under the Stars": "cur-lp-toddler-camping-under-the-stars",
      "Pirate Adventure": "cur-lp-toddler-pirate-adventure",
      "Dinosaur Discovery": "cur-lp-toddler-dinosaur-discovery",
      "Fairy Tale Adventures": "cur-lp-toddler-fairy-tale-adventures",
      "Superhero Training Camp": "cur-lp-toddler-superhero-training-camp",
      "Music & Movement": "cur-lp-toddler-music-movement",
      "Colors Everywhere": "cur-lp-toddler-colors-everywhere",
    }),
    Preschool: Object.freeze({}),
  });

  function weekRef(weekNumber, exactTitle, age) {
    const lessonPlanId = EXACT_PLAN_IDS_BY_AGE[age]?.[exactTitle] || "";
    return {
      weekNumber,
      lessonPlanId,
      label: exactTitle,
      displayOrder: weekNumber,
      needsManualPick: !lessonPlanId,
      missingPlanTitle: lessonPlanId ? "" : exactTitle,
    };
  }

  /** @type {object[]} */
  const MONTHLY_COLLECTION_DEFINITIONS = [
    {
      id: "cur-series-infant-babys-first-discoveries",
      title: "Baby's First Discoveries",
      description: "A gentle introduction to early sensory exploration, bonding, visual development, and first learning experiences.",
      theme: "First Discoveries",
      age: "Infant",
      ageDetail: "0-6 months",
      season: "Summer",
      month: "July",
      year: "2026",
      plan: "Free",
      difficultyLevel: "Gentle",
      estimatedPrepTime: "10–15 min / day",
      indoorOutdoor: "Indoor",
      focusTags: ["Sensory", "Literacy", "Social Emotional"],
      overallGoals: "Support bonding, early visual attention, sensory calm, and joyful first discoveries.",
      overallMaterials: "Soft scarves, face cards, high-contrast boards, rattles, mirrors, colorful scarves.",
      familyConnection: "Invite families to share one familiar song or face photo from home.",
      coverImageUrl: "/images/lesson-covers/black-white-discovery.jpg",
      learningDomains: ["Social Emotional", "Language & Literacy", "Physical Development", "Science"],
      weeks: [
        weekRef(1, "Familiar Faces & Bonding", "Infant"),
        weekRef(2, "My Senses", "Infant"),
        weekRef(3, "Black & White Discovery", "Infant"),
        weekRef(4, "Colors All Around Us", "Infant"),
      ],
    },
    {
      id: "cur-series-infant-movement-music",
      title: "Movement & Music",
      description: "Supports physical development, communication, movement, and early interaction through play.",
      theme: "Movement & Music",
      age: "Infant",
      ageDetail: "0-6 months",
      season: "Summer",
      month: "August",
      year: "2026",
      plan: "Pro",
      difficultyLevel: "Gentle",
      estimatedPrepTime: "10–15 min / day",
      indoorOutdoor: "Indoor",
      focusTags: ["Music", "Movement", "Sensory"],
      overallGoals: "Grow strength, reaching, listening, and back-and-forth communication through music and movement.",
      overallMaterials: "Scarves, shakers, tummy-time mat, grasp toys, soft drums.",
      familyConnection: "Share one favorite movement song families can repeat at home.",
      coverImageUrl: "/images/lesson-covers/move-and-groove-babies.jpg",
      learningDomains: ["Physical Development", "Creative Arts", "Language & Literacy", "Social Emotional"],
      weeks: [
        weekRef(1, "Music & Movement", "Infant"),
        weekRef(2, "Tummy Time Adventures", "Infant"),
        weekRef(3, "Reaching & Grasping Adventures", "Infant"),
        weekRef(4, "Baby's First Conversations", "Infant"),
      ],
    },
    {
      id: "cur-series-infant-growing-exploring",
      title: "Growing & Exploring",
      description: "Builds social-emotional development, language, and curiosity during baby's first year.",
      theme: "Growing & Exploring",
      age: "Infant",
      ageDetail: "0-12 months",
      season: "Fall",
      month: "September",
      year: "2026",
      plan: "Pro",
      difficultyLevel: "Gentle",
      estimatedPrepTime: "10–15 min / day",
      indoorOutdoor: "Indoor",
      focusTags: ["Literacy", "Social Emotional", "Sensory"],
      overallGoals: "Nurture social smiles, language play, curiosity, and self-awareness.",
      overallMaterials: "Nursery rhyme props, peek-a-boo scarves, unbreakable mirrors, expression cards.",
      familyConnection: "Ask families which songs or peek-a-boo games their baby loves.",
      coverImageUrl: "/images/lesson-covers/smiles-expressions.jpg",
      learningDomains: ["Social Emotional", "Language & Literacy", "Creative Arts", "Physical Development"],
      weeks: [
        weekRef(1, "Nursery Rhymes & Lullabies", "Infant"),
        weekRef(2, "Peek-A-Boo & Play", "Infant"),
        weekRef(3, "Mirror Me", "Infant"),
        weekRef(4, "Smiles & Expressions", "Infant"),
      ],
    },
    {
      id: "cur-series-toddler-all-about-me",
      title: "All About Me",
      description: "Helps toddlers learn about themselves, emotions, healthy habits, and the world around them.",
      theme: "All About Me",
      age: "Toddler",
      ageDetail: "1-2 years",
      season: "Fall",
      month: "September",
      year: "2026",
      plan: "Pro",
      difficultyLevel: "Easy",
      estimatedPrepTime: "15–20 min / day",
      indoorOutdoor: "Indoor",
      focusTags: ["Social Emotional", "Sensory", "Literacy"],
      overallGoals: "Build identity, emotional vocabulary, healthy routines, and sensory awareness.",
      overallMaterials: "Mirrors, feeling cards, play food, sensory bottles, body puzzles.",
      familyConnection: "Invite a family photo or favorite healthy snack story.",
      coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
      learningDomains: ["Social Emotional", "Physical Development", "Science", "Language & Literacy"],
      weeks: [
        weekRef(1, "All About Me", "Toddler"),
        weekRef(2, "Friendship & Feelings", "Toddler"),
        weekRef(3, "Healthy Me", "Toddler"),
        weekRef(4, "My Five Senses", "Toddler"),
      ],
    },
    {
      id: "cur-series-toddler-community-around-us",
      title: "Community Around Us",
      description: "Introduces children to important jobs, vehicles, building, and caring for animals through dramatic play and exploration.",
      theme: "Community Around Us",
      age: "Toddler",
      ageDetail: "1-2 years",
      season: "Fall",
      month: "October",
      year: "2026",
      plan: "Pro",
      difficultyLevel: "Easy",
      estimatedPrepTime: "15–20 min / day",
      indoorOutdoor: "Indoor",
      focusTags: ["Dramatic Play", "STEM", "Social Emotional"],
      overallGoals: "Explore community roles, vehicles, building, and caring for pets through play.",
      overallMaterials: "Helper hats, vehicles, blocks, vet clinic props, stuffed pets.",
      familyConnection: "Talk about one helper or vehicle families notice in their neighborhood.",
      coverImageUrl: "/images/lesson-covers/community-helpers.jpg",
      learningDomains: ["Social Emotional", "Physical Development", "Science", "Language & Literacy"],
      weeks: [
        weekRef(1, "Community Helpers", "Toddler"),
        weekRef(2, "Transportation Fun", "Toddler"),
        weekRef(3, "Construction Crew", "Toddler"),
        weekRef(4, "Pet Vet Clinic", "Toddler"),
      ],
    },
    {
      id: "cur-series-toddler-nature-explorers",
      title: "Nature Explorers",
      description: "Encourages outdoor exploration while learning about plants, insects, animals, and changing weather.",
      theme: "Nature Explorers",
      age: "Toddler",
      ageDetail: "1-2 years",
      season: "Spring",
      month: "April",
      year: "2026",
      plan: "Pro",
      difficultyLevel: "Easy",
      estimatedPrepTime: "15–20 min / day",
      indoorOutdoor: "Outdoor",
      focusTags: ["STEM", "Science", "Sensory"],
      overallGoals: "Notice living things outdoors, practice gentle observation, and talk about weather changes.",
      overallMaterials: "Garden tools, toy insects, farm animals, weather cards, magnifiers.",
      familyConnection: "Take a short nature walk and notice one plant, bug, or cloud together.",
      coverImageUrl: "/images/lesson-covers/amazing-insects-toddler.jpg",
      learningDomains: ["Science", "Physical Development", "Language & Literacy", "Creative Arts"],
      weeks: [
        weekRef(1, "Growing Gardens", "Toddler"),
        weekRef(2, "Bugs & Butterflies", "Toddler"),
        weekRef(3, "Farm Friends", "Toddler"),
        weekRef(4, "Weather Watchers", "Toddler"),
      ],
    },
    {
      id: "cur-series-toddler-adventure-month",
      title: "Adventure Month",
      description: "A month full of imagination, pretend play, movement, and exciting discoveries.",
      theme: "Adventure Month",
      age: "Toddler",
      ageDetail: "1-2 years",
      season: "Summer",
      month: "June",
      year: "2026",
      plan: "Pro",
      difficultyLevel: "Easy",
      estimatedPrepTime: "15–20 min / day",
      indoorOutdoor: "Indoor",
      focusTags: ["Dramatic Play", "STEM", "Movement"],
      overallGoals: "Spark imagination through camping, pirate, dinosaur, and space adventures.",
      overallMaterials: "Tents, pirate props, dinosaur figures, space toys, flashlights.",
      familyConnection: "Choose one adventure theme and play pretend for five minutes at home.",
      coverImageUrl: "/images/lesson-covers/camping-stars.jpg",
      learningDomains: ["Creative Arts", "Physical Development", "Science", "Language & Literacy"],
      weeks: [
        weekRef(1, "Camping Under the Stars", "Toddler"),
        weekRef(2, "Pirate Adventure", "Toddler"),
        weekRef(3, "Dinosaur Discovery", "Toddler"),
        weekRef(4, "Space Explorers", "Toddler"),
      ],
    },
    {
      id: "cur-series-toddler-creative-play",
      title: "Creative Play",
      description: "Builds creativity, confidence, movement, and artistic expression through hands-on play.",
      theme: "Creative Play",
      age: "Toddler",
      ageDetail: "1-2 years",
      season: "Winter",
      month: "January",
      year: "2026",
      plan: "Pro",
      difficultyLevel: "Easy",
      estimatedPrepTime: "15–20 min / day",
      indoorOutdoor: "Indoor",
      focusTags: ["Art", "Music", "Literacy"],
      overallGoals: "Encourage storytelling, confidence, movement, and colorful creative expression.",
      overallMaterials: "Dress-up props, music instruments, paint, color scarves, story books.",
      familyConnection: "Act out a favorite story or dance together to one song.",
      coverImageUrl: "/images/lesson-covers/fairy-tales.jpg",
      learningDomains: ["Creative Arts", "Physical Development", "Social Emotional", "Language & Literacy"],
      weeks: [
        weekRef(1, "Fairy Tale Adventures", "Toddler"),
        weekRef(2, "Superhero Training Camp", "Toddler"),
        weekRef(3, "Music & Movement", "Toddler"),
        weekRef(4, "Colors Everywhere", "Toddler"),
      ],
    },
  ].map((definition) => {
    const missing = (definition.weeks || []).filter((week) => week.needsManualPick);
    const filled = (definition.weeks || []).filter((week) => week.lessonPlanId);
    // Keep incomplete collections visible in the Curriculum tab (published),
    // but never feature them until every week has an exact linked plan.
    const complete = missing.length === 0 && filled.length === 4;
    return {
      ...definition,
      weekCount: 4,
      status: filled.length ? "published" : "needs_review",
      featured: complete,
      missingWeekLabels: missing.map((week) => week.label),
      filledWeekCount: filled.length,
    };
  });

  function missingExactPlanReport(definitions = MONTHLY_COLLECTION_DEFINITIONS) {
    const rows = [];
    definitions.forEach((definition) => {
      (definition.weeks || []).forEach((week) => {
        if (week.needsManualPick || !week.lessonPlanId) {
          rows.push({
            curriculumId: definition.id,
            curriculumTitle: definition.title,
            age: definition.age,
            weekNumber: week.weekNumber,
            requestedTitle: week.label || week.missingPlanTitle,
          });
        }
      });
    });
    return rows;
  }

  const api = {
    EXACT_PLAN_IDS_BY_AGE,
    MONTHLY_COLLECTION_DEFINITIONS,
    weekRef,
    missingExactPlanReport,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LLHMonthlyCollections = api;
  }
})();
