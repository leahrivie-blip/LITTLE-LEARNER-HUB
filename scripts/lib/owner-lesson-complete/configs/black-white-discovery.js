"use strict";

/**
 * Black & White Discovery — Owner Admin complete config
 * Keys use LIVE activity titles (legacyTitle from kit).
 */
const {
  planMeta,
  activitiesByDay,
} = require("../../teaching-kit-premium-drafts/kit-infant-black-white.js");

const PLAN_ID = "cur-lp-infant-black-white-discovery";
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const week = {
  weeklyOverview: planMeta.weeklyOverview,
  objectives: (planMeta.objectives || []).join("\n"),
  weeklyMaterials: (planMeta.weeklyMaterials || []).join("\n"),
  teacherPreparation: (planMeta.teacherPreparation || []).join("\n"),
  familyConnection: planMeta.familyConnection,
  observationFocus: (planMeta.observationOpportunities || []).join("\n"),
  books: planMeta.books,
  songs: planMeta.songs,
  milestones: planMeta.milestones,
  vocabCards: planMeta.vocabCards,
  teacherToolkit: planMeta.teacherToolkit,
  printableIdeas: planMeta.printableIdeas,
  adaptations: planMeta.adaptations,
  vocabularyWords: (planMeta.vocabularyWords || []).join("\n"),
};

const IMAGE_BY_LIVE = {
  "High-Contrast Card Exploration": {
    imagePlan: "IMAGE_REQUIRED",
    imageRequirement: "required",
    imageBriefSetup: "Caregiver holding a high-contrast black-and-white pattern card about 10 inches from an alert infant on a mat — realistic daycare photo.",
  },
  "Tummy Time Pattern Adventure": {
    imagePlan: "IMAGE_REQUIRED",
    imageRequirement: "required",
    imageBriefSetup: "Infant on tummy looking toward a high-contrast visual strip on a mat with caregiver nearby.",
  },
  "Mirror & Pattern Discovery": {
    imagePlan: "IMAGE_REQUIRED",
    imageRequirement: "required",
    imageBriefSetup: "Infant looking at unbreakable mirror beside a bold black-white card with caregiver face nearby.",
  },
  "Bold Card Gaze Garden": {
    imagePlan: "IMAGE_HELPFUL",
    imageRequirement: "optional",
    imageBriefSetup: "Infant gazing at one bold contrast card propped safely near a mat.",
  },
  "Black White Board Book": { imagePlan: "IMAGE_NOT_NEEDED", imageRequirement: "not_needed" },
  "Contrast Card Peek Song": { imagePlan: "IMAGE_NOT_NEEDED", imageRequirement: "not_needed" },
  "Slow Pattern Arc Track": {
    imagePlan: "IMAGE_HELPFUL",
    imageRequirement: "optional",
    imageBriefSetup: "Caregiver slowly arcing a contrast card for infant tracking.",
  },
  "Tummy Contrast Gallery": {
    imagePlan: "IMAGE_HELPFUL",
    imageRequirement: "optional",
    imageBriefSetup: "Tummy-time infant looking at a small gallery of contrast cards.",
  },
  "Black White Cloth Drape": {
    imagePlan: "IMAGE_HELPFUL",
    imageRequirement: "optional",
    imageBriefSetup: "Infant looking at draped black and white cloth squares with caregiver.",
  },
  "Zebra Stripe Soft Book": { imagePlan: "IMAGE_NOT_NEEDED", imageRequirement: "not_needed" },
  "Grasp the Contrast Ring": {
    imagePlan: "IMAGE_REQUIRED",
    imageRequirement: "required",
    imageBriefSetup: "Older infant reaching for a large soft black-white contrast ring toy with caregiver support.",
  },
  "Hello Black Hello White": { imagePlan: "IMAGE_NOT_NEEDED", imageRequirement: "not_needed" },
  "Contrast Celebration Dance Hold": { imagePlan: "IMAGE_NOT_NEEDED", imageRequirement: "not_needed" },
  "Favorite Pattern Page Party": { imagePlan: "IMAGE_NOT_NEEDED", imageRequirement: "not_needed" },
  "Shade and Shadow Contrast Stroll": { imagePlan: "IMAGE_NOT_NEEDED", imageRequirement: "not_needed" },
};

function kitToActivities() {
  const out = {};
  WEEKDAYS.forEach((day) => {
    (activitiesByDay[day] || []).forEach((act) => {
      const liveTitle = act.legacyTitle || act.title;
      const img = IMAGE_BY_LIVE[liveTitle] || {};
      out[liveTitle] = {
        decision: act.decision || "improve",
        replaces: act.replaces || "",
        replaceReason: act.replaceReason || "",
        activityCategory: act.activityCategory,
        ageModifications: act.ageModifications || "Infant 0–6 Months",
        durationMinutes: act.durationMinutes,
        objective: act.objective,
        description: act.description,
        materials: act.materials,
        preparation: act.preparation,
        setup: act.setup,
        steps: act.steps,
        teacherLanguage: act.teacherLanguage,
        observationOpportunities: act.observationOpportunities,
        safetyNotes: act.safetyNotes,
        cleanupTips: act.cleanupTips,
        teacherTips: act.teacherTips,
        vocabulary: act.vocabulary,
        learningGoals: act.learningGoals,
        adaptations: act.adaptations || planMeta.adaptations,
        supportAdaptations: "Bring visuals closer (8–12 in) for younger infants; reduce if overstimulated.",
        addedChallenge: "For older infants, offer a reach toward a large contrast toy.",
        mixedAgeAdaptations: "Designed for 0–6 months; older babies may reach/grasp more.",
        indoorAlternatives: "All core experiences are indoor.",
        outdoorAlternatives: "Shade-and-shadow stroll only when weather and naps allow — keep ultra short.",
        imagePlan: img.imagePlan || "IMAGE_HELPFUL",
        imageRequirement: img.imageRequirement || "optional",
        imageBriefSetup: img.imageBriefSetup || act.imageBriefSetup || act.description,
        printableDecision: /card|strip|pattern|face|tummy|mirror|grasp/i.test(liveTitle) ? "REQUIRED" : "NOT_NEEDED",
      };
    });
  });
  return out;
}

module.exports = {
  planId: PLAN_ID,
  title: "Black & White Discovery",
  ageLabel: "Infant approximately 0–6 months",
  expectedPlan: "Free",
  expectedStatus: "published",
  week,
  activities: kitToActivities(),
  imageCoverPreference: [
    "Tummy Time Pattern Adventure",
    "High-Contrast Card Exploration",
    "Mirror & Pattern Discovery",
    "Grasp the Contrast Ring",
  ],
  printables: {
    keepResourceIds: [
      "cur-res-223fe5a15bac5648",
      "cur-res-a2f90f232a27e8ea",
      "cur-res-708fb59c638d71db",
      "cur-res-01fa0175224a2c14",
    ],
    notes: [
      {
        id: "cur-res-223fe5a15bac5648",
        decision: "KEEP",
        purpose: "High-contrast pattern cards for gaze/tummy time",
        teacherUse: "Hold 8–12 inches during alert awake windows",
        childUse: "Look / track (infant)",
        why: "Functional infant visual tool; clean high-contrast design",
      },
      {
        id: "cur-res-708fb59c638d71db",
        decision: "KEEP",
        purpose: "Infant visual play pack supporting the week",
        teacherUse: "Select pages matching daily invitations",
        childUse: "Look with caregiver",
        why: "Tied to lesson activities; not decorative filler",
      },
      {
        id: "cur-res-01fa0175224a2c14",
        decision: "KEEP",
        purpose: "Tracking & face gallery supports",
        teacherUse: "Slow arc tracking + face looking",
        childUse: "Gaze/track",
        why: "Matches tracking and face activities",
      },
      {
        id: "cur-res-e3c453192e3dfaf7",
        decision: "PRINTABLE_NOT_NEEDED",
        purpose: "Archived tummy strip duplicate — leave archived",
      },
    ],
  },
};
