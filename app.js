const categories = [
  { view: "observations", title: "Observation Hub", detail: "Professional wording, skills, standards, and next steps.", icon: "OB" },
  { view: "lessons", title: "Lesson Plan Library", detail: "Infant, toddler, preschool, holiday, and seasonal plans.", icon: "LP" },
  { view: "forms", title: "Forms Library", detail: "Editable daycare paperwork and parent forms.", icon: "FM" },
  { view: "menus", title: "Menu Center", detail: "Weekly menus, meal ideas, snacks, and shopping lists.", icon: "MN" },
  { view: "activities", title: "Activity Center", detail: "Search by age, theme, skill, and materials.", icon: "AC" },
  { view: "printables", title: "Printables", detail: "Worksheets, coloring, tracing, letters, numbers, and shapes.", icon: "PR" },
];

const aiTools = [
  {
    id: "lesson",
    title: "AI Lesson Plan Generator",
    detail: "Create daily, weekly, or monthly lesson plans with objectives, materials, and activity steps.",
    fields: [
      ["age", "Age Group", "select", ["Infant", "Toddler", "Preschool"]],
      ["planLength", "Plan Type", "select", ["Daily", "Weekly", "Monthly"]],
      ["theme", "Theme", "text", "Farm"],
      ["days", "Number of Days", "select", ["3", "5", "10"]],
      ["focus", "Learning Focus", "text", "colors, animals, fine motor"],
      ["materials", "Materials Already Available", "textarea", "paper, crayons, blocks, music, books, sensory bin"],
    ],
  },
  {
    id: "observation",
    title: "AI Observation Generator",
    detail: "Turn a quick note into professional documentation.",
    fields: [
      ["note", "Quick Note", "textarea", "Child counted to 10 and identified colors."],
      ["age", "Age Group", "select", ["Infant", "Toddler", "Preschool"]],
      ["area", "Learning Area", "select", ["Cognitive", "Language", "Literacy", "Social Emotional", "Fine Motor", "Gross Motor", "Math", "Science", "Self Help"]],
      ["nextStep", "Next Step Goal", "text", "Offer color sorting with small groups"],
    ],
  },
  {
    id: "newsletter",
    title: "AI Newsletter Generator",
    detail: "Make a polished parent newsletter for the month.",
    fields: [
      ["month", "Month", "text", "July"],
      ["theme", "Theme", "text", "Summer fun"],
      ["dates", "Important Dates", "textarea", "Closed July 4, water day every Friday"],
      ["reminders", "Parent Reminders", "textarea", "Please bring labeled sunscreen, extra clothes, and a water bottle."],
    ],
  },
  {
    id: "daily",
    title: "AI Daily Report Generator",
    detail: "Turn daily notes into a warm parent-ready report.",
    fields: [
      ["child", "Child Name", "text", "Your child"],
      ["meals", "Meals", "text", "Ate most of lunch and snack"],
      ["diapering", "Diapering / Toileting", "text", "Dry checks, diaper changes, or potty attempts noted"],
      ["nap", "Nap", "text", "Rested 12:30-2:00"],
      ["mood", "Mood", "select", ["Happy and engaged", "Calm", "Busy and curious", "Needed extra comfort", "Energetic"]],
      ["highlights", "Highlights", "textarea", "Played with blocks, listened during story time"],
      ["notes", "Parent Notes", "textarea", "Please bring extra clothes tomorrow."],
    ],
  },
  {
    id: "handbook",
    title: "AI Parent Handbook Builder",
    detail: "Build parent handbook policy sections from daycare details.",
    fields: [
      ["program", "Program Name", "text", "Little Learner Home Daycare"],
      ["tuition", "Tuition Policy", "textarea", "Tuition is due each Monday."],
      ["sick", "Sick Policy", "textarea", "Children must stay home with fever, vomiting, diarrhea, or contagious illness."],
      ["pickup", "Pick-up and Drop-off", "textarea", "Parents sign children in and out daily."],
      ["discipline", "Guidance Policy", "textarea", "We use positive guidance, redirection, choices, and calm support."],
      ["closures", "Closures/Vacation", "textarea", "Families will receive notice of planned closures in advance."],
      ["state", "State-Specific Notes", "textarea", "Add licensing rules, required notices, or state policy wording to review."],
    ],
  },
  {
    id: "contract",
    title: "AI Contract Generator",
    detail: "Create a daycare contract draft families can review and sign.",
    fields: [
      ["program", "Program Name", "text", "Little Learner Home Daycare"],
      ["tuition", "Tuition Terms", "textarea", "Tuition is due every Monday and reserves the child's space in care."],
      ["schedule", "Care Schedule", "textarea", "Monday-Friday, 7:30 AM-5:30 PM"],
      ["fees", "Fees", "textarea", "$25 late payment fee, $1 per minute late pick-up fee after closing."],
      ["policies", "Important Policies", "textarea", "Late pick-up fees, illness exclusions, vacation notice, and two-week termination notice."],
    ],
  },
  {
    id: "activity",
    title: "AI Activity Generator",
    detail: "Generate age-appropriate activities with materials, instructions, and learning goals.",
    fields: [
      ["age", "Age Group", "select", ["Infant", "Toddler", "Preschool"]],
      ["theme", "Theme", "text", "Ocean"],
      ["skill", "Learning Skill", "text", "fine motor"],
      ["materials", "Materials Available", "textarea", "tray, tongs, pom poms, picture cards"],
    ],
  },
  {
    id: "menu",
    title: "AI Menu Generator",
    detail: "Create daily, weekly, or monthly menus with breakfast, lunch, snack, and CACFP-friendly ideas.",
    fields: [
      ["age", "Age Group", "select", ["Infant", "Toddler", "Preschool", "Mixed Ages"]],
      ["menuLength", "Menu Type", "select", ["Daily", "Weekly", "Monthly"]],
      ["restrictions", "Allergies or Restrictions", "textarea", "No peanuts. Age-appropriate textures."],
      ["preferences", "Food Preferences", "textarea", "Simple budget-friendly meals with fruits, vegetables, whole grains, and milk."],
    ],
  },
  {
    id: "form",
    title: "AI Daycare Form Builder",
    detail: "Create permission slips, incident reports, enrollment forms, and custom daycare forms.",
    fields: [
      ["formType", "Form Type", "select", ["Permission Slip", "Incident Report", "Enrollment Form", "Medication Authorization", "Custom Form"]],
      ["program", "Program Name", "text", "Little Learner Home Daycare"],
      ["purpose", "Form Purpose", "textarea", "Field trip permission, parent signature, emergency contact details"],
      ["fieldsNeeded", "Fields Needed", "textarea", "Child name, parent name, date, signature, notes"],
    ],
  },
  {
    id: "assessment",
    title: "AI Assessment Generator",
    detail: "Generate developmental assessments by age group, domain, strengths, and next steps.",
    fields: [
      ["child", "Child Name", "text", "Child"],
      ["age", "Age Group", "select", ["Infant", "Toddler", "Preschool"]],
      ["domains", "Developmental Domains", "textarea", "Language, social emotional, fine motor, cognitive"],
      ["evidence", "Observation Evidence", "textarea", "Notes from recent observations and activities"],
    ],
  },
  {
    id: "progress",
    title: "AI Progress Report Generator",
    detail: "Create parent-friendly child progress reports with strengths, growth, and goals.",
    fields: [
      ["child", "Child Name", "text", "Child"],
      ["period", "Report Period", "text", "Spring"],
      ["strengths", "Strengths", "textarea", "Enjoys books, building, helping friends"],
      ["goals", "Next Goals", "textarea", "Use longer sentences, practice scissor skills"],
    ],
  },
  {
    id: "portfolio",
    title: "AI Portfolio Generator",
    detail: "Build child portfolio entries from observations, photos notes, goals, and learning moments.",
    fields: [
      ["child", "Child Name", "text", "Child"],
      ["age", "Age", "text", "3 years old"],
      ["observations", "Observations", "textarea", "Add observation notes, learning moments, or milestones"],
      ["goals", "Goals", "textarea", "Language, fine motor, independence"],
    ],
  },
  {
    id: "curriculum",
    title: "AI Curriculum Generator",
    detail: "Generate themed curriculum units with weekly themes, goals, activities, and family connection ideas.",
    fields: [
      ["age", "Age Group", "select", ["Infant", "Toddler", "Preschool", "Mixed Ages"]],
      ["theme", "Curriculum Theme", "text", "Community Helpers"],
      ["length", "Unit Length", "select", ["1 Week", "2 Weeks", "1 Month"]],
      ["goals", "Learning Goals", "textarea", "language, social emotional, math, science"],
    ],
  },
  {
    id: "behavior",
    title: "AI Behavior Documentation Generator",
    detail: "Create professional behavior reports, incident documentation, and parent wording.",
    fields: [
      ["incident", "What Happened", "textarea", "Child had difficulty sharing and pushed a peer."],
      ["support", "Support Given", "textarea", "Comforted both children, used calm words, redirected to a turn-taking activity."],
      ["plan", "Follow-up Plan", "textarea", "Practice sharing language and offer small group support."],
      ["tone", "Parent Message Tone", "select", ["Warm and professional", "Brief and factual", "Supportive and detailed"]],
    ],
  },
  {
    id: "learningStory",
    title: "AI Learning Story Generator",
    detail: "Convert observations into warm learning stories with skills, meaning, and next steps.",
    fields: [
      ["child", "Child Name", "text", "Child"],
      ["observation", "Observation", "textarea", "Child explored blocks, counted towers, and invited a friend to build."],
      ["domain", "Learning Domain", "select", ["Cognitive", "Language", "Social Emotional", "Fine Motor", "Gross Motor", "Creative Arts"]],
      ["nextStep", "Next Step", "text", "Offer measuring tools and more block challenge cards"],
    ],
  },
  {
    id: "parentMessage",
    title: "AI Parent Message Generator",
    detail: "Write professional parent communication for updates, reminders, and difficult conversations.",
    fields: [
      ["topic", "Message Topic", "text", "Late pickup reminder"],
      ["details", "Details", "textarea", "Parent has arrived late twice this week. Keep tone respectful."],
      ["tone", "Tone", "select", ["Warm and clear", "Firm and professional", "Gentle and supportive"]],
    ],
  },
  {
    id: "schedule",
    title: "AI Daily Schedule Generator",
    detail: "Generate age-appropriate daily schedules for home daycare routines.",
    fields: [
      ["openTime", "Opening Time", "text", "7:30 AM"],
      ["closeTime", "Closing Time", "text", "5:30 PM"],
      ["ages", "Ages Served", "text", "Infants, toddlers, preschoolers"],
      ["nap", "Nap / Rest Time", "text", "12:30 PM-2:30 PM"],
    ],
  },
  {
    id: "classroomSetup",
    title: "AI Classroom Setup Generator",
    detail: "Get room layout suggestions, learning center ideas, and setup notes.",
    fields: [
      ["space", "Space Description", "textarea", "Small living room daycare space with reading corner and art table"],
      ["ages", "Ages Served", "text", "Toddlers and preschoolers"],
      ["centers", "Centers Wanted", "textarea", "Blocks, dramatic play, art, books, sensory"],
    ],
  },
  {
    id: "emergency",
    title: "AI Emergency Plan Generator",
    detail: "Create emergency procedures, evacuation plans, and safety documentation drafts.",
    fields: [
      ["program", "Program Name", "text", "Little Learner Home Daycare"],
      ["risks", "Emergency Types", "textarea", "Fire, severe weather, lockdown, medical emergency"],
      ["location", "Meeting Place / Notes", "textarea", "Front sidewalk, neighbor contact, parent reunification area"],
    ],
  },
  {
    id: "substitute",
    title: "AI Substitute Teacher Plan Generator",
    detail: "Create quick plans for substitute providers with routines, contacts, meals, and activities.",
    fields: [
      ["date", "Date", "text", "Monday"],
      ["routine", "Daily Routine", "textarea", "Arrival, breakfast, circle time, outdoor play, lunch, nap, pickup"],
      ["notes", "Important Notes", "textarea", "Allergies, authorized pickups, comfort items, behavior supports"],
    ],
  },
  {
    id: "grant",
    title: "AI Grant & Funding Letter Generator",
    detail: "Draft childcare grant applications, funding requests, and program need letters.",
    fields: [
      ["program", "Program Name", "text", "Little Learner Home Daycare"],
      ["need", "Funding Need", "textarea", "Outdoor play materials and safety upgrades"],
      ["amount", "Amount Requested", "text", "$1,500"],
      ["impact", "Community Impact", "textarea", "Support safe learning experiences for infants, toddlers, and preschoolers"],
    ],
  },
];

const quickPrompts = [
  "Create a week of toddler farm lesson plans.",
  "Write an observation for a child stacking blocks.",
  "Create a daily report for a toddler.",
  "Create a parent newsletter for July.",
  "Build a parent handbook sick policy.",
  "Create a daycare contract template.",
  "Create a toddler sensory activity.",
  "Create a weekly daycare menu.",
  "Create an incident report form.",
];

const developmentalAreas = ["Cognitive", "Language", "Literacy", "Social Emotional", "Fine Motor", "Gross Motor", "Science", "Math", "Creative Arts", "Self Help"];
const plannerDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
let selectedChildId = localStorage.getItem("llhSelectedChild") || "";
let childObservationSearch = "";
let childObservationAreaFilter = "All";
let childObservationDateFilter = "";
let activeObservationEditId = "";

const futureTools = [
  {
    id: "licensing",
    title: "State Licensing Checklist",
    detail: "Create a generic setup checklist providers can customize for their state.",
    fields: [
      ["state", "State", "text", "Oklahoma"],
      ["programType", "Program Type", "select", ["Home daycare", "Family childcare", "Childcare center", "Preschool classroom"]],
      ["ages", "Ages Served", "text", "Infant, toddler, preschool"],
    ],
  },
  {
    id: "schedule",
    title: "Daily Schedule Builder",
    detail: "Build a simple daily routine for mixed-age childcare groups.",
    fields: [
      ["openTime", "Opening Time", "text", "7:30 AM"],
      ["closeTime", "Closing Time", "text", "5:30 PM"],
      ["ages", "Ages Served", "text", "Infants, toddlers, preschoolers"],
      ["nap", "Nap/Rest Time", "text", "12:30 PM-2:30 PM"],
    ],
  },
  {
    id: "curriculum",
    title: "Curriculum Builder",
    detail: "Plan a month of weekly themes, goals, and activity areas.",
    fields: [
      ["age", "Age Group", "select", ["Infant", "Toddler", "Preschool", "Mixed Ages"]],
      ["month", "Month", "text", "July"],
      ["theme", "Main Theme", "text", "Summer discoveries"],
      ["goals", "Learning Goals", "textarea", "language, social-emotional skills, fine motor, outdoor exploration"],
    ],
  },
  {
    id: "attendance",
    title: "Attendance Tracker",
    detail: "Create a printable weekly attendance and sign-in tracker.",
    fields: [
      ["week", "Week Of", "text", "June 17"],
      ["children", "Children", "textarea", "Child 1\nChild 2\nChild 3"],
      ["notes", "Notes Needed", "textarea", "Arrival, pick-up, meals, nap, parent signature"],
    ],
  },
  {
    id: "meal",
    title: "Meal Planner",
    detail: "Create a weekly daycare menu with breakfast, lunch, snack, and shopping notes.",
    fields: [
      ["age", "Age Group", "select", ["Infant", "Toddler", "Preschool", "Mixed Ages"]],
      ["days", "Number of Days", "select", ["3", "5"]],
      ["restrictions", "Allergies or Restrictions", "textarea", "No peanuts. Offer age-appropriate textures."],
    ],
  },
  {
    id: "portfolio",
    title: "Child Portfolio Builder",
    detail: "Create a simple child portfolio page for observations and growth notes.",
    fields: [
      ["child", "Child Name", "text", "Child Name"],
      ["age", "Age", "text", "3 years old"],
      ["strengths", "Strengths", "textarea", "Enjoys building, naming colors, helping friends"],
      ["nextSteps", "Next Steps", "textarea", "Encourage longer sentences and cooperative play"],
    ],
  },
];

const starterResources = [
  {
    id: "lesson-toddler-farm",
    category: "Lesson Plans",
    title: "Toddler Farm Week Lesson Plan",
    age: "Toddler",
    plan: "Free",
    month: "June",
    tags: ["Farm", "Fine motor", "Animals"],
    description: "Weekly theme, Monday-Friday activities, materials, circle time, art, sensory, movement, books, and goals.",
  },
  {
    id: "lesson-infant-sensory",
    category: "Lesson Plans",
    title: "Infant Sensory Month Plan",
    age: "Infant",
    plan: "Pro",
    month: "June",
    tags: ["Sensory", "Routines", "Language"],
    description: "Four weeks of soft, safe infant activities with simple directions and learning goals.",
  },
  {
    id: "lesson-preschool-ocean-sample",
    category: "Lesson Plans",
    title: "Preschool Ocean Theme Week",
    age: "Preschool",
    plan: "Pro",
    month: "June",
    tags: ["Ocean", "Science", "Art"],
    description: "Circle time, art, sensory, fine motor, gross motor, books, songs, and printable options.",
  },
  {
    id: "obs-blocks-colors",
    category: "Observation Hub",
    title: "Stacking Blocks and Naming Colors",
    age: "Toddler",
    plan: "Free",
    month: "June",
    tags: ["Fine motor", "Cognitive", "Language"],
    description: "Professional wording, what to look for, next steps, and learning area.",
  },
  {
    id: "obs-preschool-social",
    category: "Observation Hub",
    title: "Preschool Sharing and Turn Taking",
    age: "Preschool",
    plan: "Pro",
    month: "June",
    tags: ["Social emotional", "Self-help"],
    description: "Observation language for peer play, cooperation, and emotional development.",
  },
  {
    id: "form-parent-handbook",
    category: "Forms Library",
    title: "Editable Parent Handbook",
    age: "All Ages",
    plan: "Pro",
    month: "June",
    tags: ["Handbook", "Policies", "Editable"],
    description: "Parent-ready handbook sections with fill-in-the-blank daycare information.",
  },
  {
    id: "form-emergency",
    category: "Forms Library",
    title: "Emergency Contact Form",
    age: "All Ages",
    plan: "Free",
    month: "June",
    tags: ["Enrollment", "Emergency", "Printable"],
    description: "Simple printable form for parent contacts, physician information, and emergency pickup.",
  },
  {
    id: "form-payment-tax",
    category: "Forms Library",
    title: "Payment Tracker and Tax Receipt",
    age: "All Ages",
    plan: "Pro",
    month: "June",
    tags: ["Payments", "Taxes", "Receipts"],
    description: "Track tuition payments and create parent-friendly yearly tax receipt records.",
  },
  {
    id: "activity-ocean-fine-motor",
    category: "Activity Center",
    title: "Preschool Ocean Fine Motor Tray",
    age: "Preschool",
    plan: "Pro",
    month: "June",
    tags: ["Ocean", "Fine motor", "Low prep"],
    description: "Materials, steps, learning goal, and age group for a quick themed activity.",
  },
  {
    id: "activity-toddler-feelings",
    category: "Activity Center",
    title: "Toddler Feelings Mirror Game",
    age: "Toddler",
    plan: "Free",
    month: "June",
    tags: ["Feelings", "Language", "Social emotional"],
    description: "A short activity for naming emotions, copying facial expressions, and building vocabulary.",
  },
  {
    id: "menu-cacfp-week",
    category: "Menu Center",
    title: "CACFP-Style Weekly Menu",
    age: "All Ages",
    plan: "Pro",
    month: "June",
    tags: ["Breakfast", "Lunch", "Snack"],
    description: "Breakfast, lunch, snack ideas, plus a simple shopping list for the week.",
  },
  {
    id: "menu-snack-ideas",
    category: "Menu Center",
    title: "50 Easy Daycare Snack Ideas",
    age: "All Ages",
    plan: "Free",
    month: "June",
    tags: ["Snacks", "Budget", "Quick"],
    description: "Simple daycare-friendly snack ideas to rotate through the month.",
  },
  {
    id: "printable-tracing",
    category: "Printables",
    title: "Preschool Letter Tracing Pack",
    age: "Preschool",
    plan: "Pro",
    month: "June",
    tags: ["Letters", "Tracing", "Worksheets"],
    description: "Printable letter practice pages for early writing and fine motor skills.",
  },
  {
    id: "printable-shapes",
    category: "Printables",
    title: "Toddler Shapes Coloring Pages",
    age: "Toddler",
    plan: "Free",
    month: "June",
    tags: ["Shapes", "Coloring", "Printables"],
    description: "Simple shape coloring pages for toddlers and young preschoolers.",
  },
];

const lessonThemes = [
  "Farm Animals", "Ocean", "Dinosaurs", "Transportation", "Community Helpers", "Weather",
  "Seasons", "Space", "Bugs & Insects", "Zoo Animals", "Pets", "Colors", "Shapes",
  "Numbers", "Letters", "Healthy Habits", "Camping", "Christmas", "Thanksgiving",
  "Easter", "Valentine's Day", "St. Patrick's Day", "4th of July",
  "All About Me", "Feelings", "Friendship", "Gardening", "Five Senses", "Music",
  "Construction", "Apples", "Pumpkins", "Winter", "Spring", "Summer", "Fall",
];
const ages = ["Infant", "Toddler", "Preschool"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const learningAreas = ["Cognitive", "Language", "Literacy", "Social Emotional", "Fine Motor", "Gross Motor", "Science", "Math", "Creative Arts", "Self Help"];
const holidays = ["Christmas", "Thanksgiving", "Easter", "Valentine's Day", "St. Patrick's Day", "4th of July"];
const formGroups = {
  "Enrollment Forms": [
    "Enrollment Packet", "Child Information Form", "Emergency Contact Form", "Authorized Pickup Form",
    "Child Enrollment Agreement", "Family Information Sheet", "Child Pick-Up Password Form", "Getting to Know Your Child",
    "Photo Release Form", "Transportation Permission", "Field Trip Permission", "Water Play Permission",
  ],
  "Medical Forms": [
    "Medication Authorization", "Allergy Form", "Health Record", "Illness Report",
    "Immunization Record", "Sunscreen Authorization", "Topical Ointment Authorization", "Special Health Care Plan",
    "Injury Report", "Medication Log", "Fever Return Form", "Food Substitution Form",
  ],
  "Daily Forms": [
    "Daily Report", "Incident Report", "Behavior Report", "Infant Daily Sheet",
    "Toddler Daily Sheet", "Preschool Daily Sheet", "Nap Log", "Diaper Change Log",
    "Potty Training Log", "Meal Tracking Sheet", "Mood and Behavior Tracker", "Daily Cleaning Checklist",
  ],
  "Business Forms": [
    "Tuition Agreement", "Payment Tracker", "Tax Receipt", "Late Payment Notice", "Withdrawal Form",
    "Childcare Contract", "Rate Sheet", "Invoice Template", "Deposit Receipt", "Vacation Notice",
    "Holiday Closure Notice", "Two Week Termination Notice", "Parent Fee Notice",
  ],
  "Parent Communication": [
    "Parent Handbook", "Newsletter Template", "Permission Slip", "Field Trip Form",
    "Parent Conference Form", "Parent Communication Log", "Supply Request Note", "Policy Update Notice",
    "Welcome Letter", "Transition Note", "Late Pick-Up Notice", "Positive Behavior Note", "Development Update",
  ],
  "Safety Forms": [
    "Emergency Drill Log", "Fire Drill Record", "Tornado Drill Record", "Lockdown Drill Record",
    "Playground Safety Checklist", "Safe Sleep Checklist", "Transportation Safety Checklist", "Visitor Sign-In Sheet",
  ],
  "Program Planning Forms": [
    "Monthly Planning Sheet", "Weekly Planning Sheet", "Theme Planning Form", "Activity Planning Template",
    "Observation Planning Sheet", "Child Goal Planning Form", "Portfolio Checklist", "Materials Inventory",
  ],
  "Staff Forms": [
    "Staff Information Sheet", "Substitute Provider Checklist", "Training Log", "Staff Schedule",
    "Volunteer Agreement", "Confidentiality Agreement",
  ],
};
const activityTypes = ["Fine Motor", "Gross Motor", "Sensory", "Art", "Science", "STEM", "Literacy", "Math", "Outdoor Play", "Circle Time"];
const printableTypes = ["Tracing Worksheets", "Coloring Pages", "Alphabet Practice", "Number Practice", "Shape Practice", "Name Writing", "Cutting Practice", "Matching Activities", "Seasonal Worksheets", "Holiday Worksheets"];

const libraryResources = buildResourceLibrary();

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildResourceLibrary() {
  return [
    ...buildLessonPlans(),
    ...buildObservationLibrary(),
    ...buildFormsLibrary(),
    ...buildMenuLibrary(),
    ...buildActivityLibrary(),
    ...buildPrintableLibrary(),
  ];
}

function buildLessonPlans() {
  const lessonThemeSet = lessonThemes.slice(0, 30);
  return ages.flatMap((age) => learningAreas.flatMap((area, areaIndex) => lessonThemeSet.map((theme, index) => {
    const month = months[(index + areaIndex) % months.length];
    const holiday = holidays.includes(theme) ? "Holiday" : "Non-Holiday";
    const sequence = areaIndex * lessonThemeSet.length + index + 1;
    const activityFocus = activityTypes[(index + areaIndex) % activityTypes.length];
    return {
      id: `lesson-${slug(age)}-${slug(area)}-${sequence}`,
      category: "Lesson Plans",
      title: `${age} ${theme} ${area} Lesson Plan ${index + 1}`,
      age,
      plan: sequence <= 10 ? "Free" : "Pro",
      month,
      tags: [theme, area, month, holiday, activityFocus, "Weekly Plan", "ELG Standards"],
      format: "PDF + Editable",
      description: `Pre-made ${age.toLowerCase()} ${theme.toLowerCase()} lesson plan focused on ${area.toLowerCase()} development. Includes weekly overview, daily activities, materials, objectives, step-by-step instructions, ELG standards, printable ideas, and related ${activityFocus.toLowerCase()} activity support.`,
      theme,
      developmentalArea: area,
      holiday,
      activityFocus,
      weeklyOverview: `${age} learners explore ${theme.toLowerCase()} through ${area.toLowerCase()} experiences, play-based routines, guided conversation, and hands-on practice.`,
      learningObjectives: [
        `Support ${area.toLowerCase()} development through ${theme.toLowerCase()} activities.`,
        `Build confidence, participation, and engagement during daily routines.`,
        `Connect learning to books, songs, sensory play, movement, and child-led exploration.`,
      ],
      materials: "Books, picture cards, music, art supplies, sensory materials, blocks, manipulatives, outdoor/play space, and simple printable pages.",
      relatedActivities: [`${activityFocus} activity`, `${theme} circle time`, `${area} small group support`],
    };
  })));
}

function buildObservationLibrary() {
  const stems = {
    Cognitive: ["solved a simple problem", "matched familiar objects", "remembered a routine", "explored cause and effect", "sorted materials"],
    Language: ["used new words", "responded to a question", "followed a direction", "named familiar items", "joined a conversation"],
    Literacy: ["looked through a book", "noticed print or pictures", "retold part of a story", "recognized letters or sounds", "made marks with purpose"],
    "Social Emotional": ["shared space with peers", "expressed a feeling", "accepted comfort", "took turns", "showed independence"],
    "Fine Motor": ["used fingers to grasp materials", "stacked or placed items", "used tools with control", "turned pages", "worked with small manipulatives"],
    "Gross Motor": ["balanced during movement", "climbed safely", "walked or ran with control", "jumped or hopped", "moved through an obstacle"],
    Science: ["observed natural materials", "noticed changes", "explored textures", "asked or showed curiosity", "compared objects"],
    Math: ["counted objects", "matched shapes", "noticed size", "sorted by color", "used position words"],
    "Creative Arts": ["used art materials", "moved to music", "created pretend play", "chose colors", "experimented with sounds"],
    "Self Help": ["helped with clean-up", "tried dressing skills", "washed hands", "used mealtime routines", "managed belongings"],
  };
  return ages.flatMap((age) => learningAreas.flatMap((area) => Array.from({ length: 50 }, (_, index) => {
    const skill = stems[area][index % stems[area].length];
    const sequence = index + 1;
    return {
      id: `obs-${slug(age)}-${slug(area)}-${sequence}`,
      category: "Observation Hub",
      title: `${age} ${area} Observation ${sequence}`,
      age,
      plan: index < 2 ? "Free" : "Pro",
      month: months[(index + learningAreas.indexOf(area)) % months.length],
      tags: [area, "Observation Wording", "Next Steps", "Learning Standard"],
      format: "Editable Observation",
      description: `Professional ${age.toLowerCase()} ${area.toLowerCase()} observation wording: the child ${skill} during play and routines. Includes what to look for, developmental area, learning standard category, and next steps.`,
      observationText: `The ${age.toLowerCase()} demonstrated ${area.toLowerCase()} growth as they ${skill} during a familiar play or routine experience. The child showed engagement, persistence, and developing confidence while participating at their own pace.`,
      lookFor: `Look for the child repeating this skill independently, using it in a new setting, staying engaged longer, or showing increased confidence with fewer prompts.`,
      nextSteps: `Offer a similar activity with one small added challenge, model helpful language, and provide time for the child to practice again through play.`,
      standard: `Early learning guideline category: ${area}.`,
    };
  })));
}

function buildFormsLibrary() {
  return Object.entries(formGroups).flatMap(([group, forms]) => forms.map((form, index) => ({
    id: `form-${slug(group)}-${slug(form)}`,
    category: "Forms Library",
    title: form,
    age: "All Ages",
    plan: index === 0 && group !== "Business Forms" ? "Free" : "Pro",
    month: "All Year",
    tags: [group, "PDF", "Editable", "In-App"],
    format: "PDF + Editable",
    description: `${group} resource with printable and editable sections for childcare providers to customize for their program.`,
  })));
}

function buildMenuLibrary() {
  const weeklyMenus = Array.from({ length: 52 }, (_, index) => ({
    id: `menu-week-${index + 1}`,
    category: "Menu Center",
    title: `Week ${index + 1} Daycare Menu`,
    age: "All Ages",
    plan: index < 2 ? "Free" : "Pro",
    month: months[index % months.length],
    tags: ["52 Weeks of Menus", "Breakfast", "Lunch", "Snack", "Shopping List"],
    format: "PDF + Editable",
    description: "Weekly daycare menu with breakfast, lunch, snack, simple CACFP-style meal inspiration, and a shopping list.",
  }));
  const ageMenus = ages.flatMap((age) => months.map((month) => ({
    id: `menu-${slug(age)}-${slug(month)}`,
    category: "Menu Center",
    title: `${age} ${month} Menu Pack`,
    age,
    plan: "Pro",
    month,
    tags: [`${age} Menus`, "Breakfast", "Lunch", "Snack", "Shopping List"],
    format: "PDF + Editable",
    description: `${age} menu pack with weekly meal ideas, shopping lists, and age-friendly breakfast, lunch, and snack rotations.`,
  })));
  return [...weeklyMenus, ...ageMenus];
}

function buildActivityLibrary() {
  return ages.flatMap((age) => activityTypes.flatMap((type) => lessonThemes.slice(0, 12).map((theme, index) => ({
    id: `activity-${slug(age)}-${slug(type)}-${slug(theme)}`,
    category: "Activity Center",
    title: `${age} ${theme} ${type} Activity`,
    age,
    plan: index % 10 === 0 ? "Free" : "Pro",
    month: months[index % months.length],
    tags: [type, theme, "Materials", "Instructions", "Learning Objective"],
    format: "PDF + Editable",
    description: `${type} activity for ${age.toLowerCase()} learners with materials, instructions, learning objective, and developmental area.`,
  }))));
}

function buildPrintableLibrary() {
  return printableTypes.flatMap((type) => lessonThemes.map((theme, index) => ({
    id: `printable-${slug(type)}-${slug(theme)}`,
    category: "Printables",
    title: `${theme} ${type}`,
    age: index % 3 === 0 ? "Toddler" : "Preschool",
    plan: index % 9 === 0 ? "Free" : "Pro",
    month: holidays.includes(theme) ? "Holiday" : months[index % months.length],
    tags: [type, theme, holidays.includes(theme) ? "Holiday" : "Seasonal", "Printable"],
    format: "PDF",
    description: `Printable ${type.toLowerCase()} for ${theme.toLowerCase()} practice, designed for quick daycare use.`,
  })));
}

const accessRank = { Free: 0, Founding: 1, Pro: 1, Premium: 2 };
const foundingMemberLimit = 50;
const foundingPublicClaimedBase = 15;
const adminOwnerAccount = {
  email: "little.learners.hub.customer@gmail.com",
  name: "Leah",
  loginEndpoint: "/api/admin/login",
};
const billingPlans = {
  Free: {
    name: "Free",
    price: "$0",
    interval: "",
    stripePriceKey: "",
    features: ["3 Lesson Plans", "15 Observations", "3 Forms", "5 Activities", "5 Printables", "10 AI Generations Per Month", "Up to 3 Child Profiles", "Weekly Observation Tracker"],
  },
  Founding: {
    name: "Founding Member",
    price: "$9.99",
    interval: "/month",
    stripePriceKey: "STRIPE_PRICE_FOUNDING_MONTHLY",
    features: ["Founding Member Status", "$9.99/month", "Lifetime Price Lock", "All Pro features", "250 AI Generations Per Month"],
  },
  ProMonthly: {
    name: "Pro Monthly",
    price: "$19.99",
    interval: "/month",
    stripePriceKey: "STRIPE_PRICE_PRO_MONTHLY",
    features: ["Full in-app library", "All Pro resources", "250 AI generations per month", "All child management and provider tools"],
  },
  ProAnnual: {
    name: "Pro Annual",
    price: "$199",
    interval: "/year",
    stripePriceKey: "STRIPE_PRICE_PRO_ANNUAL",
    features: ["Best regular value", "Full in-app library", "All Pro resources", "250 AI generations per month"],
  },
};
const stripeCheckoutConfig = {
  checkoutEndpoint: "/api/create-checkout-session",
  customerPortalEndpoint: "/api/create-customer-portal-session",
  subscriptionStatusEndpoint: "/api/subscription-status",
  checkoutStatusEndpoint: "/api/checkout-status",
};
const aiGenerationConfig = {
  endpoint: "/api/ai-generate",
};
const firebaseAuthConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
};
const firebaseAuthEnabled = Boolean(firebaseAuthConfig.apiKey && firebaseAuthConfig.authDomain && firebaseAuthConfig.projectId && firebaseAuthConfig.appId);
const authProviderName = firebaseAuthEnabled ? "Firebase Authentication" : "Local demo authentication";
let firebaseAuthClient = null;
const freeAccessLimits = {
  "Lesson Plans": 3,
  "Observation Hub": 15,
  "Forms Library": 3,
  "Menu Center": 0,
  "Activity Center": 5,
  "Printables": 5,
};
const freeAiMonthlyLimit = 10;
const paidAiMonthlyLimit = 250;
const freeChildProfileLimit = 3;
const proFeatureList = [
  "1,500+ Observations",
  "200+ Lesson Plans",
  "AI Generators",
  "Child Portfolios",
  "Attendance Tracking",
  "Individual Child Support Plans",
  "Premium Forms",
  "Premium Activities",
  "Premium Printables",
  "Premium Menus",
  "Future Premium Features",
];
const freeAiLimitMessage = "You have used all 10 free AI generations for this month. Upgrade to Pro for 250 AI generations each month.";
const paidAiLimitMessage = "You have used all 250 AI generations for this month. Your AI access will reset next month.";
const freeResourceLimitMessage = "You have reached your Free Plan limit. Upgrade to Pro to unlock the full Little Learner Hub library.";
const viewMap = {
  lessons: "Lesson Plans",
  observations: "Observation Hub",
  forms: "Forms Library",
  activities: "Activity Center",
  menus: "Menu Center",
  printables: "Printables",
};
const adRouteMap = {
  "/free-daycare-forms": "forms",
  "/daycare-lesson-plans": "lessons",
  "/observation-generator": "ai",
  "/home-daycare-provider-tools": "home",
  "#/free-daycare-forms": "forms",
  "#/daycare-lesson-plans": "lessons",
  "#/observation-generator": "ai",
  "#/home-daycare-provider-tools": "home",
};
const onboardingSteps = [
  { id: "child-profile", label: "Create first child profile", view: "children" },
  { id: "download-form", label: "View a form", view: "forms" },
  { id: "generate-observation", label: "Generate an observation", view: "ai" },
  { id: "weekly-planner", label: "Try weekly planner", view: "planner" },
  { id: "save-resource", label: "Save a resource", view: "lessons" },
  { id: "upgrade-library", label: "Upgrade to unlock full library", view: "plans" },
];

function readSavedJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function lineBreaks(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function setFormMessage(elementOrSelector, message, isSuccess = false) {
  const element = typeof elementOrSelector === "string" ? document.querySelector(elementOrSelector) : elementOrSelector;
  if (!element) return;
  element.textContent = message || "";
  element.classList.toggle("success", Boolean(isSuccess));
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-email")) return "Please enter a valid email address.";
  if (code.includes("missing-password")) return "Please enter your password.";
  if (code.includes("weak-password")) return "Please use a password with at least 8 characters.";
  if (code.includes("email-already-in-use")) return "An account already exists for this email. Try logging in or use Forgot password.";
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) return "The email or password did not match. Please try again.";
  if (code.includes("requires-recent-login")) return "For security, please log out and log back in before changing your password.";
  if (code.includes("expired-action-code")) return "This reset link has expired. Please request a new password reset email.";
  if (code.includes("invalid-action-code")) return "This reset link is invalid or has already been used.";
  if (code.includes("unauthorized-domain")) return "Password reset is not enabled for this website domain yet. Add little-learner-hub.onrender.com as an authorized domain in Firebase Authentication settings.";
  if (code.includes("operation-not-allowed")) return "Email/password login needs to be enabled in Firebase Authentication.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a few minutes and try again.";
  if (!firebaseAuthEnabled && code === "auth/not-configured") return "Real email recovery is ready to use after Firebase Auth config is added.";
  return error?.message || "Something went wrong. Please try again.";
}

async function getFirebaseAuthClient() {
  if (!firebaseAuthEnabled) return null;
  if (firebaseAuthClient) return firebaseAuthClient;
  const [{ initializeApp }, authModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
  ]);
  const app = initializeApp(firebaseAuthConfig);
  firebaseAuthClient = {
    auth: authModule.getAuth(app),
    ...authModule,
  };
  return firebaseAuthClient;
}

async function localPasswordHash(password) {
  const text = String(password || "");
  if (!window.crypto?.subtle) return `plain-demo:${text}`;
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openAuthModal(mode = "login") {
  setAuthMode(mode);
  document.body.classList.add("auth-modal-open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeAuthModal() {
  document.body.classList.remove("auth-modal-open");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function analyticsEvents() {
  return readSavedJson("llhAnalyticsEvents", []);
}

function currentAttribution() {
  return readSavedJson("llhAttribution", {});
}

function saveAttribution(detail = {}) {
  const attribution = {
    route: detail.route || window.location.pathname || window.location.hash || "home",
    view: detail.view || "home",
    firstSeenAt: new Date().toISOString(),
  };
  localStorage.setItem("llhAttribution", JSON.stringify(attribution));
  return attribution;
}

function trackEvent(name, detail = {}) {
  const event = {
    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    detail,
    path: window.location.pathname,
    hash: window.location.hash,
    user: currentUser || "",
    attribution: currentAttribution(),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem("llhAnalyticsEvents", JSON.stringify([event, ...analyticsEvents()].slice(0, 300)));
}

function leads() {
  return readSavedJson("llhLeads", []);
}

function saveLead(email, source = "Free Daycare Starter Pack") {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return;
  const existing = leads().filter((lead) => lead.email !== cleanEmail);
  localStorage.setItem("llhLeads", JSON.stringify([
    { email: cleanEmail, source, attribution: currentAttribution(), createdAt: new Date().toISOString() },
    ...existing,
  ]));
  trackEvent("lead_capture", { source });
}

function showProFeatureModal(message = "Upgrade to Pro to unlock this feature.") {
  const modal = document.querySelector("#proModal");
  const body = document.querySelector("#proModalBody");
  if (!modal || !body) {
    setView("plans");
    return;
  }
  body.innerHTML = `
    <p>${escapeHtml(message)}</p>
    <p><strong>Upgrade to Pro to unlock:</strong></p>
    <ol>
      ${proFeatureList.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ol>
  `;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeProFeatureModal() {
  const modal = document.querySelector("#proModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function billingPlanLabel(plan = currentPlan) {
  if (plan === "Founding") return "Founding Member";
  if (plan === "Pro") return "Pro";
  return "Free";
}

function billingPriceLabel(account = currentAccount()) {
  if (account?.foundingMember && isProUser()) return "$9.99/month";
  if (account?.subscriptionCadence === "annual" && isProUser()) return "$199/year";
  if (isProUser()) return "$19.99/month";
  return "$0";
}

function foundingMembers() {
  return readSavedJson("llhFoundingMembers", []);
}

function saveFoundingMembers(members) {
  localStorage.setItem("llhFoundingMembers", JSON.stringify([...new Set(members)]));
}

function foundingSpotsClaimed() {
  return Math.min(foundingPublicClaimedBase + foundingMembers().length, foundingMemberLimit);
}

function foundingSpotsRemaining() {
  return Math.max(foundingMemberLimit - foundingSpotsClaimed(), 0);
}

function currentBillingHistory(account = currentAccount()) {
  return account?.billingHistory || [];
}

function addBillingHistory(type, detail, amount = "") {
  if (!currentUser) return;
  const allAccounts = accounts();
  const account = allAccounts[currentUser] || ensureAccount(currentUser);
  const history = account.billingHistory || [];
  allAccounts[currentUser] = {
    ...account,
    billingHistory: [
      {
        id: `bill-${Date.now()}`,
        date: new Date().toISOString(),
        type,
        detail,
        amount,
      },
      ...history,
    ].slice(0, 40),
    updatedAt: new Date().toISOString(),
  };
  saveAccounts(allAccounts);
}

function updateCurrentAccountBilling(updates) {
  if (!currentUser) return null;
  const allAccounts = accounts();
  const account = allAccounts[currentUser] || ensureAccount(currentUser);
  allAccounts[currentUser] = {
    ...account,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveAccounts(allAccounts);
  if (updates.plan) {
    currentPlan = updates.plan;
    localStorage.setItem("llhPlan", currentPlan);
  }
  return allAccounts[currentUser];
}

function isStripeStatusActive(subscription) {
  const status = String(subscription?.subscriptionStatus || "").toLowerCase();
  if (status.includes("cancel") || status.includes("free plan") || status.includes("failed")) return false;
  return status.includes("active")
    || status.includes("trial")
    || status.includes("paid");
}

function subscriptionToAccountUpdates(subscription) {
  if (!subscription) return null;
  if (!isStripeStatusActive(subscription)) {
    return {
      plan: "Free",
      subscriptionCadence: "",
      subscriptionStatus: subscription.subscriptionStatus || "Free Plan",
      foundingMember: Boolean(subscription.foundingMember),
      foundingMemberNumber: subscription.foundingMemberNumber || null,
      priceLock: subscription.foundingMember ? "Lifetime" : "",
      monthlyPrice: "$0",
      stripeCustomerId: subscription.stripeCustomerId || "",
      stripeSubscriptionId: subscription.stripeSubscriptionId || "",
      paymentMethod: subscription.paymentMethod || "Managed in Stripe",
    };
  }
  const pendingPlan = String(subscription.pendingPlan || "").toLowerCase();
  const serverPlan = String(subscription.plan || "").toLowerCase();
  const isFounding = Boolean(subscription.foundingMember)
    || serverPlan === "founding"
    || pendingPlan === "founding"
    || String(subscription.priceLock || "").toLowerCase() === "lifetime"
    || String(subscription.monthlyPrice || "").includes("9.99");
  const plan = isFounding ? "Founding" : "Pro";
  return {
    plan,
    subscriptionCadence: subscription.subscriptionCadence || (plan === "Founding" ? "monthly" : ""),
    subscriptionStatus: subscription.subscriptionStatus || `${billingPlanLabel(plan)} Subscription Active`,
    subscriptionStartedAt: subscription.subscriptionStartedAt || new Date().toISOString(),
    foundingMember: isFounding,
    foundingMemberNumber: subscription.foundingMemberNumber || null,
    priceLock: isFounding ? "Lifetime" : subscription.priceLock || "",
    monthlyPrice: isFounding ? "$9.99/month" : subscription.monthlyPrice || "$19.99/month",
    stripeCustomerId: subscription.stripeCustomerId || "",
    stripeSubscriptionId: subscription.stripeSubscriptionId || "",
    paymentMethod: subscription.paymentMethod || "Managed in Stripe",
  };
}

async function syncSubscriptionFromBackend(email, options = {}) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !stripeCheckoutConfig.subscriptionStatusEndpoint || !canUseStripeBackend()) return null;
  try {
    const response = await fetch(`${stripeCheckoutConfig.subscriptionStatusEndpoint}?email=${encodeURIComponent(cleanEmail)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Could not sync subscription.");
    const updates = subscriptionToAccountUpdates(data?.subscription);
    if (!updates) return data;
    updateAccount(cleanEmail, updates);
    if (cleanEmail === currentUser) {
      currentPlan = updates.plan;
      localStorage.setItem("llhPlan", currentPlan);
      updateAuthButtons();
      updatePlanLabel();
      if (options.renderAccount) renderAccountPage();
      if (options.renderBilling) {
        renderBillingPage();
        renderSubscriptionPage();
      }
    }
    return data;
  } catch (error) {
    console.warn("Subscription sync did not complete", error);
    return null;
  }
}

function claimFoundingMembership(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return { claimed: false, memberNumber: null };
  const members = foundingMembers();
  const existingIndex = members.indexOf(cleanEmail);
  if (existingIndex >= 0) {
    return { claimed: true, memberNumber: existingIndex + 1 };
  }
  if (foundingSpotsClaimed() >= foundingMemberLimit) {
    return { claimed: false, memberNumber: null };
  }
  members.push(cleanEmail);
  saveFoundingMembers(members);
  return { claimed: true, memberNumber: foundingPublicClaimedBase + members.length };
}

function planFromCheckoutType(type) {
  if (type === "founding") return "Founding";
  return "Pro";
}

function checkoutAmount(type) {
  if (type === "founding") return "$9.99/month";
  if (type === "annual") return "$199/year";
  return "$19.99/month";
}

function checkoutPlanName(type) {
  if (type === "founding") return "Founding Member";
  if (type === "annual") return "Pro Annual";
  return "Pro Monthly";
}

function canUseStripeBackend() {
  if (!window.location.protocol.startsWith("http")) return false;
  if (["4173", "4179"].includes(window.location.port)) return false;
  return true;
}

function canUseLaunchBackend() {
  return canUseStripeBackend();
}

function requireBillingAccount() {
  if (currentUser) return true;
  openAuthModal("signup");
  return false;
}

let resources = loadResources();
let favorites = readSavedJson("llhFavorites", []);
let savedDownloads = readSavedJson("llhDownloads", []);
let currentPlan = localStorage.getItem("llhPlan") || "Free";
let currentUser = localStorage.getItem("llhUser") || "";
let activeFilter = "All";
let currentAuthMode = "login";

const searchInput = document.querySelector("#searchInput");
const currentPlanLabel = document.querySelector("#currentPlanLabel");
const homeViewTemplate = document.querySelector("#view-home").innerHTML;
const mobileNavMaxWidth = 820;

function isMobileLayout() {
  return window.matchMedia(`(max-width: ${mobileNavMaxWidth}px)`).matches;
}

function setMobileNavOpen(open) {
  const shouldOpen = Boolean(open) && isMobileLayout();
  document.body.classList.toggle("mobile-nav-open", shouldOpen);
  const toggle = document.querySelector("#mobileMenuToggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    toggle.setAttribute("aria-label", shouldOpen ? "Close menu" : "Open menu");
  }
}

function installMobileNavigation() {
  const sidebar = document.querySelector(".sidebar");
  const mobileBrand = document.querySelector(".mobile-brand");
  if (!sidebar || !mobileBrand || document.querySelector("#mobileMenuToggle")) return;
  sidebar.id = sidebar.id || "mobileNavigation";
  const toggle = document.createElement("button");
  toggle.className = "mobile-menu-toggle";
  toggle.id = "mobileMenuToggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open menu");
  toggle.setAttribute("aria-controls", sidebar.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = "<span></span><span></span><span></span>";
  mobileBrand.prepend(toggle);
  const backdrop = document.createElement("button");
  backdrop.className = "mobile-nav-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close menu");
  document.body.appendChild(backdrop);
  toggle.addEventListener("click", () => setMobileNavOpen(!document.body.classList.contains("mobile-nav-open")));
  backdrop.addEventListener("click", () => setMobileNavOpen(false));
  window.addEventListener("resize", () => {
    if (!isMobileLayout()) setMobileNavOpen(false);
  });
}

function loadResources() {
  const saved = readSavedJson("llhUploadedResources", []);
  const starterWithoutOldGenerated = starterResources.filter((resource) => !["Observation Hub", "Lesson Plans"].includes(resource.category));
  return applyObservationEdits([...starterWithoutOldGenerated, ...libraryResources, ...saved]);
}

function observationEdits() {
  return readSavedJson("llhObservationEdits", {});
}

function saveObservationEdits(edits) {
  localStorage.setItem("llhObservationEdits", JSON.stringify(edits));
}

function applyObservationEdits(items) {
  const edits = observationEdits();
  return items.map((item) => edits[item.id] ? { ...item, ...edits[item.id] } : item);
}

function saveFavorites() {
  localStorage.setItem("llhFavorites", JSON.stringify(favorites));
  saveCurrentAccountState();
}

function accounts() {
  return readSavedJson("llhAccounts", {});
}

function saveAccounts(nextAccounts) {
  localStorage.setItem("llhAccounts", JSON.stringify(nextAccounts));
}

function currentAccount() {
  if (!currentUser) return null;
  return accounts()[currentUser] || null;
}

function ensureAccount(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return null;
  const allAccounts = accounts();
  if (!allAccounts[cleanEmail]) {
    allAccounts[cleanEmail] = {
      email: cleanEmail,
      plan: "Free",
      subscriptionCadence: "",
      subscriptionStatus: "Free Plan",
      foundingMember: false,
      foundingMemberNumber: null,
      priceLock: "",
      monthlyPrice: "$0",
      stripeCustomerId: "",
      stripeSubscriptionId: "",
      paymentMethod: "No payment method on file",
      billingHistory: [],
      favorites: [],
      downloads: [],
      phone: "",
      authProvider: authProviderName,
      emailVerified: !firebaseAuthEnabled,
      passwordHash: "",
      createdAt: new Date().toISOString(),
    };
    saveAccounts(allAccounts);
  }
  return allAccounts[cleanEmail];
}

function updateAccount(email, updates) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return null;
  const allAccounts = accounts();
  const account = allAccounts[cleanEmail] || ensureAccount(cleanEmail);
  allAccounts[cleanEmail] = {
    ...account,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveAccounts(allAccounts);
  return allAccounts[cleanEmail];
}

function loadAccountState(email) {
  const account = ensureAccount(email);
  if (!account) return;
  currentUser = account.email;
  currentPlan = account.plan || (account.foundingMember ? "Founding" : "Free");
  favorites = account.favorites || [];
  savedDownloads = account.downloads || [];
  localStorage.setItem("llhGeneratedOutputs", JSON.stringify(account.generatedOutputs || []));
  localStorage.setItem("llhUser", currentUser);
  localStorage.setItem("llhPlan", currentPlan);
  localStorage.setItem("llhFavorites", JSON.stringify(favorites));
  localStorage.setItem("llhDownloads", JSON.stringify(savedDownloads));
  updateAuthButtons();
  updatePlanLabel();
}

function saveCurrentAccountState() {
  if (!currentUser) return;
  const allAccounts = accounts();
  const account = allAccounts[currentUser] || ensureAccount(currentUser);
  allAccounts[currentUser] = {
    ...account,
    plan: currentPlan,
    subscriptionStatus: account?.subscriptionStatus || (isProUser() ? `${billingPlanLabel()} Subscription Active` : "Free Plan"),
    favorites,
    downloads: savedDownloads,
    generatedOutputs: generatedOutputs(),
    updatedAt: new Date().toISOString(),
  };
  saveAccounts(allAccounts);
}

function setAuthMode(mode) {
  currentAuthMode = mode;
  const title = document.querySelector("#authTitle");
  const phoneField = document.querySelector("#authPhoneField");
  const passwordField = document.querySelector("#passwordInput");
  const submitButton = document.querySelector("#authSubmitButton");
  const forgotButton = document.querySelector("#forgotPasswordButton");
  const switchButton = document.querySelector("#switchAuthModeButton");
  setFormMessage("#authMessage", "");
  if (!title || !phoneField || !passwordField || !submitButton || !forgotButton || !switchButton) return;
  phoneField.classList.toggle("hidden-field", mode !== "signup");
  passwordField.required = mode !== "forgot";
  passwordField.autocomplete = mode === "signup" ? "new-password" : "current-password";
  passwordField.closest("label")?.classList.toggle("hidden-field", mode === "forgot");
  if (mode === "signup") {
    title.textContent = "Create your Little Learner Hub account";
    submitButton.textContent = "Create Account";
    forgotButton.style.display = "none";
    switchButton.textContent = "Already have an account? Log in";
  } else if (mode === "forgot") {
    title.textContent = "Reset your password";
    submitButton.textContent = "Send Reset Email";
    forgotButton.style.display = "none";
    switchButton.textContent = "Back to login";
  } else {
    title.textContent = "Log in to Little Learner Hub";
    submitButton.textContent = "Log In";
    forgotButton.style.display = "inline-flex";
    switchButton.textContent = "Create account";
  }
}

async function signUpWithProvider(email, password, phone) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Please enter your email address.");
  if (String(password || "").length < 8) throw new Error("Please use a password with at least 8 characters.");
  if (firebaseAuthEnabled) {
    const client = await getFirebaseAuthClient();
    const credential = await client.createUserWithEmailAndPassword(client.auth, cleanEmail, password);
    await client.sendEmailVerification(credential.user);
    ensureAccount(cleanEmail);
    updateAccount(cleanEmail, {
      authProvider: "Firebase Authentication",
      emailVerified: credential.user.emailVerified,
      firebaseUid: credential.user.uid,
      phone: String(phone || "").trim(),
    });
    return { email: cleanEmail, verified: credential.user.emailVerified, message: "Account created. Please check your email to verify your address." };
  }
  ensureAccount(cleanEmail);
  updateAccount(cleanEmail, {
    authProvider: "Local demo authentication",
    emailVerified: false,
    phone: String(phone || "").trim(),
    passwordHash: await localPasswordHash(password),
  });
  return { email: cleanEmail, verified: false, message: "Demo account created. Connect Firebase Auth to send real verification emails." };
}

async function loginWithProvider(email, password) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Please enter your email address.");
  if (firebaseAuthEnabled) {
    const client = await getFirebaseAuthClient();
    const credential = await client.signInWithEmailAndPassword(client.auth, cleanEmail, password);
    ensureAccount(cleanEmail);
    updateAccount(cleanEmail, {
      authProvider: "Firebase Authentication",
      emailVerified: credential.user.emailVerified,
      firebaseUid: credential.user.uid,
    });
    return { email: cleanEmail, verified: credential.user.emailVerified };
  }
  const account = accounts()[cleanEmail];
  if (!account) throw new Error("No demo account was found for this email. Create an account first.");
  if (account.passwordHash) {
    const hash = await localPasswordHash(password);
    if (hash !== account.passwordHash) throw new Error("The email or password did not match. Please try again.");
  }
  return { email: cleanEmail, verified: account.emailVerified };
}

async function sendPasswordReset(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Please enter your email address.");
  if (firebaseAuthEnabled) {
    const client = await getFirebaseAuthClient();
    const resetUrl = window.location.origin && window.location.origin !== "null"
      ? `${window.location.origin}${window.location.pathname}`
      : window.location.href.split("?")[0];
    await client.sendPasswordResetEmail(client.auth, cleanEmail, {
      url: resetUrl,
      handleCodeInApp: false,
    });
    return "Password reset email sent. Please check your inbox.";
  }
  const token = `demo-reset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem("llhDemoResetToken", JSON.stringify({ email: cleanEmail, token, createdAt: new Date().toISOString() }));
  return "Demo reset created. Connect Firebase Auth to send real password reset emails.";
}

async function resendVerificationEmail() {
  if (!currentUser) throw new Error("Please log in before requesting a verification email.");
  if (firebaseAuthEnabled) {
    const client = await getFirebaseAuthClient();
    if (!client.auth.currentUser) throw new Error("Please log in again before requesting verification.");
    await client.sendEmailVerification(client.auth.currentUser);
    return "Verification email sent. Please check your inbox.";
  }
  updateAccount(currentUser, { emailVerified: false });
  return "Demo mode: connect Firebase Auth to send a real verification email.";
}

async function changePassword(currentPassword, newPassword) {
  if (!currentUser) throw new Error("Please log in before changing your password.");
  if (String(newPassword || "").length < 8) throw new Error("Please use a new password with at least 8 characters.");
  if (firebaseAuthEnabled) {
    const client = await getFirebaseAuthClient();
    const user = client.auth.currentUser;
    if (!user?.email) throw new Error("Please log in again before changing your password.");
    const credential = client.EmailAuthProvider.credential(user.email, currentPassword);
    await client.reauthenticateWithCredential(user, credential);
    await client.updatePassword(user, newPassword);
    return "Password updated.";
  }
  const account = currentAccount();
  if (account?.passwordHash) {
    const currentHash = await localPasswordHash(currentPassword);
    if (currentHash !== account.passwordHash) throw new Error("The current password did not match.");
  }
  updateAccount(currentUser, { passwordHash: await localPasswordHash(newPassword) });
  return "Demo password updated. Connect Firebase Auth for production password security.";
}

async function confirmPasswordResetFromLink(newPassword) {
  if (String(newPassword || "").length < 8) throw new Error("Please use a password with at least 8 characters.");
  const params = new URLSearchParams(window.location.search);
  const oobCode = params.get("oobCode");
  if (firebaseAuthEnabled && oobCode) {
    const client = await getFirebaseAuthClient();
    await client.confirmPasswordReset(client.auth, oobCode, newPassword);
    return "Password reset complete. You can now log in.";
  }
  const demoReset = readSavedJson("llhDemoResetToken", null);
  if (demoReset?.email) {
    updateAccount(demoReset.email, { passwordHash: await localPasswordHash(newPassword) });
    localStorage.removeItem("llhDemoResetToken");
    return "Demo password reset complete. You can now log in.";
  }
  throw new Error("This reset link is missing or expired. Please request a new password reset email.");
}

function updateAuthButtons() {
  const signIn = document.querySelector("#signinButton");
  const signUp = document.querySelector("#signupButton");
  if (!signIn || !signUp) return;
  if (currentUser) {
    signIn.textContent = "Account";
    signIn.dataset.view = "account";
    signUp.textContent = isProUser() ? `${billingPlanLabel()} Active` : "Upgrade";
    signUp.dataset.view = isProUser() ? "billing" : "plans";
  } else {
    signIn.textContent = "Log in";
    delete signIn.dataset.view;
    signUp.textContent = "Sign up";
    delete signUp.dataset.view;
  }
}

function setView(view) {
  if (view === "tools" && !isProUser()) {
    showProFeatureModal("Provider business tools are Pro features.");
    return;
  }
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
  document.querySelector(`#view-${view}`)?.classList.add("active-view");
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (viewMap[view]) renderCategoryPage(view);
  if (view === "home") renderHome();
  if (view === "admin") renderAdminDashboard();
  if (view === "account") renderAccountPage();
  if (view === "plans") renderPricingPage();
  if (view === "upgrade") renderUpgradePage();
  if (view === "billing") renderBillingPage();
  if (view === "subscription") renderSubscriptionPage();
  if (view === "billing-history") renderBillingHistoryPage();
  if (view === "payment-success") renderPaymentSuccessPage();
  if (view === "payment-failed") renderPaymentFailedPage();
  if (view === "cancel-subscription") renderCancelSubscriptionPage();
  if (view === "reset-password") renderResetPasswordPage();
  if (view === "contact") renderContactPage();
  if (view === "ai") renderAiPage();
  if (view === "generators") renderGeneratorWorkspace("lesson");
  if (view === "tools") renderFutureTools();
  if (view === "children") renderChildManagement();
  if (view === "planner") renderWeeklyPlanner();
  trackEvent("page_view", { view });
  if (!isMobileLayout()) window.scrollTo({ top: 0, behavior: "smooth" });
}

function canAccess(resource) {
  if (hasAdminFullAccess()) return true;
  if (accessRank[effectiveAccessPlan()] >= accessRank.Pro) return true;
  return freeResourceIds(resource.category).has(resource.id);
}

function isProUser() {
  return hasAdminFullAccess() || accessRank[effectiveAccessPlan()] >= accessRank.Pro;
}

function freeResourceIds(category) {
  const limit = freeAccessLimits[category] ?? 0;
  return new Set(resources.filter((resource) => resource.category === category).slice(0, limit).map((resource) => resource.id));
}

function categoryAccessCounts(category) {
  const total = resources.filter((resource) => resource.category === category).length;
  const freeLimit = Math.min(freeAccessLimits[category] ?? 0, total);
  return {
    total,
    freeLimit,
    proOnly: Math.max(total - freeLimit, 0),
  };
}

function aiUsageKey() {
  const date = new Date();
  if (isProUser() && currentAccount()?.subscriptionStartedAt) {
    const start = new Date(currentAccount().subscriptionStartedAt);
    if (!Number.isNaN(start.getTime())) {
      const months = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
      const cycle = Math.max(months, 0);
      return `llhAiUsage-${currentUser || "paid"}-billing-${cycle}`;
    }
  }
  return `llhAiUsage-${date.getFullYear()}-${date.getMonth() + 1}`;
}

function aiUsageCount() {
  return Number(localStorage.getItem(aiUsageKey()) || "0");
}

function aiMonthlyLimit() {
  return isProUser() ? paidAiMonthlyLimit : freeAiMonthlyLimit;
}

function aiUsageRemaining() {
  return Math.max(aiMonthlyLimit() - aiUsageCount(), 0);
}

function aiResetLabel() {
  if (isProUser() && currentAccount()?.subscriptionStartedAt) {
    const start = new Date(currentAccount().subscriptionStartedAt);
    if (!Number.isNaN(start.getTime())) {
      const next = new Date(start);
      const now = new Date();
      while (next <= now) next.setMonth(next.getMonth() + 1);
      return next.toLocaleDateString();
    }
  }
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  return nextMonth.toLocaleDateString();
}

function canUseAi() {
  return aiUsageCount() < aiMonthlyLimit();
}

function recordAiUse() {
  localStorage.setItem(aiUsageKey(), String(aiUsageCount() + 1));
  updatePlanLabel();
  renderAiUsagePanel();
}

function aiLimitMessage() {
  return isProUser() ? paidAiLimitMessage : freeAiLimitMessage;
}

function saveDownloads() {
  localStorage.setItem("llhDownloads", JSON.stringify(savedDownloads));
  saveCurrentAccountState();
}

function categoryResources(category) {
  const query = searchInput.value.trim().toLowerCase();
  return resources.filter((resource) => {
    if (!isProUser() && !canAccess(resource)) return false;
    const matchesCategory = resource.category === category;
    const matchesFilter = activeFilter === "All" || resource.age === activeFilter || resource.tags.includes(activeFilter);
    const haystack = [
      resource.title,
      resource.category,
      resource.age,
      resource.plan,
      resource.description,
      ...resource.tags,
    ].join(" ").toLowerCase();
    return matchesCategory && matchesFilter && haystack.includes(query);
  });
}

function searchedResources() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return [];
  return resources.filter((resource) => {
    if (!isProUser() && !canAccess(resource)) return false;
    const haystack = [
      resource.title,
      resource.category,
      resource.age,
      resource.plan,
      resource.description,
      ...resource.tags,
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function resourceCard(resource) {
  const locked = !canAccess(resource);
  const favorite = favorites.includes(resource.id);
  const viewText = locked ? "Upgrade to Pro" : "View";
  const favoriteText = !isProUser() ? "Pro Save" : favorite ? "Saved" : "Save";
  const accessText = locked ? "Pro" : isProUser() ? "Included" : "Free Sample";
  return `
    <article class="resource-card ${locked ? "locked" : ""}">
      ${resource.previewData ? `<img class="resource-preview" src="${resource.previewData}" alt="${resource.title} preview" />` : ""}
      <div class="tag-row">
        <span class="tag">${resource.age}</span>
        ${resource.tags.slice(0, 3).map((tag) => `<span class="tag">${tag}</span>`).join("")}
        ${resource.format ? `<span class="tag">${resource.format}</span>` : ""}
        <span class="tag access-tag">${accessText}</span>
      </div>
      <div>
        <h3>${resource.title}</h3>
        <p>${resource.description}</p>
      </div>
      <div class="resource-actions">
        <button class="favorite-button ${!isProUser() ? "disabled-control" : ""}" ${!isProUser() ? `data-pro-feature="favorites"` : `data-favorite="${resource.id}"`} type="button">${favoriteText}</button>
        ${resource.category === "Lesson Plans" && !locked ? `<button class="ghost-button" data-customize-lesson-ai="${resource.id}" type="button">Customize AI</button>` : ""}
        ${resource.category === "Lesson Plans" && !locked ? `<button class="ghost-button" data-find-lesson-activities="${resource.id}" type="button">Find Activities</button>` : ""}
        ${resource.category === "Lesson Plans" && !locked ? `<button class="ghost-button" data-add-lesson-support="${resource.id}" type="button">Add Support</button>` : ""}
        ${resource.category === "Observation Hub" && !locked ? `<button class="ghost-button" data-edit-observation="${resource.id}" type="button">Edit</button>` : ""}
        ${resource.category === "Observation Hub" && !locked ? `<button class="ghost-button" data-add-observation-child="${resource.id}" type="button">Add to Child</button>` : ""}
        ${locked
          ? `<button class="download-button" data-pro-feature="resource-limit" type="button">${viewText}</button>`
          : `<button class="download-button" data-view-resource="${resource.id}" type="button">${viewText}</button>`
        }
      </div>
    </article>
  `;
}

function resourceTheme(resource) {
  const ignoreTags = new Set(["PDF", "Editable", "In-App", "Printable", "Materials", "Instructions", "Learning Objective", "Shopping List"]);
  return resource.theme
    || resource.tags.find((tag) => !ignoreTags.has(tag) && !learningAreas.includes(tag))
    || resource.month
    || resource.title;
}

function resourceFocus(resource) {
  return resource.developmentalArea
    || resource.tags.find((tag) => learningAreas.includes(tag))
    || resource.tags[0]
    || "whole child development";
}

function resourceAudience(resource) {
  const age = resource.age === "All Ages" ? "mixed-age childcare groups" : `${resource.age.toLowerCase()} learners`;
  const audience = {
    "Lesson Plans": `Early childhood providers planning weekly experiences for ${age}.`,
    "Observation Hub": `Providers documenting learning, development, and next steps for ${age}.`,
    "Forms Library": "Home daycare providers, family child care homes, centers, and preschool programs that need organized family paperwork.",
    "Menu Center": `Providers planning meals and snacks for ${age}.`,
    "Activity Center": `Teachers and providers leading small-group, whole-group, or play-based activities for ${age}.`,
    "Printables": `Teachers and providers who want quick table activities, small-group practice, or take-home practice for ${age}.`,
  };
  return audience[resource.category] || "Early childhood professionals using Little Learner Hub.";
}

function resourceIncluded(resource) {
  const included = {
    "Lesson Plans": "Weekly overview, objectives, materials, vocabulary, daily activities, differentiation, family connection, and assessment notes.",
    "Observation Hub": "Professional observation wording, what to look for, ELG connection, next steps, and an editable documentation note.",
    "Forms Library": "A ready-to-customize childcare form with fields, provider instructions, notes, and signature areas.",
    "Menu Center": "A weekly meal plan, snack ideas, shopping list, substitutions, and provider reminders.",
    "Activity Center": "Materials, setup, step-by-step directions, learning objective, ELG connection, and extension ideas.",
    "Printables": "Printable activity concept, teacher directions, child directions, learning goal, and extension ideas.",
  };
  return included[resource.category] || "A complete in-app resource designed for childcare providers.";
}

function resourceHowToUse(resource) {
  const use = {
    "Lesson Plans": "Read the weekly overview, gather materials, choose the daily activities that fit your group, and adjust language or supports for individual children.",
    "Observation Hub": "Copy the wording into a child record, replace general wording with the child's name and exact details, then use the next steps to plan follow-up support.",
    "Forms Library": "Add your program name and policy details, complete the family or child fields, review with the parent/guardian, and keep a signed copy in the child's file.",
    "Menu Center": "Use the menu as a planning guide, check allergies and state/CACFP rules, then adjust foods for age, texture, culture, and family needs.",
    "Activity Center": "Prepare the materials, introduce the theme, guide children through the steps, and repeat with an added challenge when children are ready.",
    "Printables": "Use the printable for a short table activity, small group, portfolio sample, or take-home practice. Model one example before children begin.",
  };
  return use[resource.category] || "Review the resource, personalize it for your program, and use it inside your daily workflow.";
}

function resourceStandardConnections(resource) {
  if (!["Lesson Plans", "Activity Center", "Observation Hub"].includes(resource.category)) return "";
  const area = resourceFocus(resource);
  return [
    `${area}: supports growth through play, routines, exploration, and responsive adult guidance.`,
    "Language and communication: builds vocabulary, listening, conversation, and expressive language.",
    "Approaches to learning: encourages curiosity, persistence, problem solving, and participation.",
    "Social-emotional development: supports confidence, connection, turn-taking, self-regulation, and belonging.",
  ].join("\n");
}

function resourceMaterialsSummary(resource) {
  if (resource.category === "Lesson Plans") {
    return resource.materials || "Books, songs, art supplies, sensory materials, manipulatives, simple printable pages, and theme-related props.";
  }
  if (resource.category === "Activity Center") {
    return "Child-safe manipulatives, paper, crayons or markers, sensory tray materials, books, music, and simple theme-related props.";
  }
  if (resource.category === "Printables") {
    return "Printed page or screen display, crayons, markers, pencils, scissors if appropriate, and close supervision.";
  }
  if (resource.category === "Menu Center") {
    return "Weekly menu plan, allergy list, grocery list, CACFP/state guidance, and family food notes.";
  }
  if (resource.category === "Forms Library") {
    return "Program information, child/family details, policy wording, dates, signatures, and a secure place to store completed forms.";
  }
  return "Observation notes, date, child name, context, and provider reflection.";
}

function resourceFileText(resource) {
  const standards = resourceStandardConnections(resource);
  return [
    "Little Learner Hub",
    resource.title,
    "",
    `Category: ${resource.category}`,
    `Age Group: ${resource.age}`,
    `Access: ${resource.plan}`,
    `Format: ${resource.format || "In-app resource"}`,
    `Tags: ${resource.tags.join(", ")}`,
    "",
    "Short Description",
    resource.description || `${resource.title} is a ready-to-use ${resource.category.toLowerCase()} resource for early childhood providers.`,
    "",
    "What Is Included",
    resourceIncluded(resource),
    "",
    "Who It Is For",
    resourceAudience(resource),
    "",
    "How To Use It",
    resourceHowToUse(resource),
    "",
    "Materials / Information Needed",
    resourceMaterialsSummary(resource),
    "",
    ...(standards ? ["ELG / Early Learning Standard Connections", standards, ""] : []),
    "Full Resource Content",
    resourceDownloadBody(resource),
  ].join("\n");
}

function resourcePrintableWorksheet(resource) {
  if (resource.category === "Lesson Plans") {
    return `Printable Planning Notes
Child/Group: ______________________________________  Week Of: __________________

Daily Notes
Monday: ________________________________________________________________
Tuesday: _______________________________________________________________
Wednesday: _____________________________________________________________
Thursday: ______________________________________________________________
Friday: _________________________________________________________________

Provider Reflection
What worked well? ______________________________________________________
What should be repeated or extended? ___________________________________
Child support notes: ___________________________________________________`;
  }
  if (resource.category === "Observation Hub") {
    return `Printable Observation Record
Child Name: _______________________________________  Date: ______________
Setting/Activity: ______________________________________________________

What I observed:
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Next step planned:
________________________________________________________________________

Provider Signature: _______________________________  Date: ______________`;
  }
  if (resource.category === "Forms Library") {
    return `Additional Write-In Space
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Checklist
[ ] Parent/guardian reviewed
[ ] Provider reviewed
[ ] Copy placed in child file
[ ] Follow-up needed

Parent/Guardian Signature: ________________________ Date: ______________
Provider Signature: _______________________________ Date: ______________`;
  }
  if (resource.category === "Menu Center") {
    return `Menu Notes
Allergies/Substitutions: _______________________________________________
________________________________________________________________________

Infant/Toddler Texture Changes: ________________________________________
________________________________________________________________________

Shopping Notes
[ ] Milk / dairy
[ ] Fruit
[ ] Vegetables
[ ] Protein
[ ] Whole grains
[ ] Allergy-safe substitutions`;
  }
  if (resource.category === "Activity Center") {
    return `Activity Prep Sheet
Group/Child: ______________________________________  Date: ______________
Materials gathered: ____________________________________________________
________________________________________________________________________

Observation notes:
________________________________________________________________________
________________________________________________________________________

Extension tried:
________________________________________________________________________`;
  }
  return `Printable Worksheet Page
Child Name: _______________________________________  Date: ______________

Try It
1. ______________________________________________________________________
2. ______________________________________________________________________
3. ______________________________________________________________________

Draw, trace, match, color, or write here:

‚îå‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îê
‚îÇ                                                                      ‚îÇ
‚îÇ                                                                      ‚îÇ
‚îÇ                                                                      ‚îÇ
‚îÇ                                                                      ‚îÇ
‚îÇ                                                                      ‚îÇ
‚îî‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îò

Reflection / Teacher Note:
________________________________________________________________________
________________________________________________________________________`;
}

function resourcePrintableText(resource) {
  return `${resourceFileText(resource)}\n\n${resourcePrintableWorksheet(resource)}`;
}

function printableLineHtml(line) {
  if (/^(-|\*)\s+/.test(line)) return `<li>${escapeHtml(line.replace(/^(-|\*)\s+/, ""))}</li>`;
  const checkboxLine = line.match(/^\[\s?\]\s+(.*)$/);
  if (checkboxLine) return `<li class="printable-checkbox"><span></span>${escapeHtml(checkboxLine[1])}</li>`;
  if (/^[_]{8,}$/.test(line.trim())) return `<div class="printable-writing-line"></div>`;
  if (/^‚îå|^‚îÇ|^‚îî/.test(line)) return `<div class="printable-drawing-box-line">${escapeHtml(line)}</div>`;
  if (line.includes("_____")) return `<p class="printable-field-row">${escapeHtml(line)}</p>`;
  return `<p>${escapeHtml(line)}</p>`;
}

function printableLinesHtml(lines) {
  const html = [];
  let listOpen = false;
  const closeList = () => {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  };
  lines.forEach((line) => {
    if (/^(-|\*)\s+/.test(line) || /^\[\s?\]\s+/.test(line)) {
      if (!listOpen) {
        html.push('<ul class="printable-list">');
        listOpen = true;
      }
      html.push(printableLineHtml(line));
      return;
    }
    closeList();
    html.push(printableLineHtml(line));
  });
  closeList();
  return html.join("");
}

function resourcePrintableHtml(resource) {
  const text = resourcePrintableText(resource);
  const headingPattern = /^(Short Description|What Is Included|Who It Is For|How To Use It|Materials \/ Information Needed|ELG \/ Early Learning Standard Connections|Full Resource Content|Weekly Lesson Plan|Weekly Overview|Learning Objectives|Materials|Vocabulary|Related Activities|Child Support Connection|Provider Reflection|Observation Resource|Professional Observation Wording|What to Look For|Learning Standard Category|Evidence To Add|Next Steps|Editable Note|Follow-Up Planning|Purpose|Provider Instructions|Details \/ Notes|Weekly Daycare Menu|Shopping List|Provider Reminder|Setup|Steps|Learning Objective|Extension|Teacher Directions|Child Directions|Activity Ideas|Learning Goal|Provider Note|Printable Planning Notes|Daily Notes|Printable Observation Record|Additional Write-In Space|Checklist|Menu Notes|Shopping Notes|Activity Prep Sheet|Printable Worksheet Page|Try It|Reflection \/ Teacher Note)$/;
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const content = blocks.map((block, index) => {
    const lines = block.split("\n").map((line) => line.trimEnd()).filter((line) => line.length);
    const first = lines[0] || "";
    if (index === 0 || first === "Little Learner Hub") {
      return `<section class="print-section print-cover">${printableLinesHtml(lines)}</section>`;
    }
    if (headingPattern.test(first) && lines.length > 1) {
      return `<section class="print-section"><h3>${escapeHtml(first)}</h3>${printableLinesHtml(lines.slice(1))}</section>`;
    }
    return `<section class="print-section">${printableLinesHtml(lines)}</section>`;
  }).join("");
  return `<article class="printable-resource-page">${content}</article>`;
}

function makeDownload(resource) {
  if (resource.fileData) return resource.fileData;
  const fileText = resourceFileText(resource);
  return `data:text/plain;charset=utf-8,${encodeURIComponent(fileText)}`;
}

function resourceDownloadBody(resource) {
  if (resource.category === "Lesson Plans") {
    const theme = resource.theme || resourceTheme(resource);
    const area = resourceFocus(resource);
    return `Weekly Lesson Plan
Title: ${resource.title}
Theme: ${resource.theme || resource.tags[0]}
Month: ${resource.month}
Age Group: ${resource.age}
Developmental Area: ${area}
Holiday: ${resource.holiday || "Non-Holiday"}

Weekly Overview
${resource.weeklyOverview || resource.description}

Learning Objectives
${(resource.learningObjectives || [
  "Support developmental growth through play-based learning.",
  "Build language, confidence, social connection, and participation.",
  "Provide hands-on activities with simple materials.",
]).map((item) => `- ${item}`).join("\n")}

Materials
${resource.materials || "Books, songs, art supplies, sensory materials, manipulatives, and simple printable pages."}

Vocabulary
${theme}, explore, look, listen, gentle, same, different, more, all done

Monday - Introduce the Theme
Circle Time: Show a picture, book, or object connected to ${theme}. Invite children to name, point, touch, or describe what they notice.
Small Group: Sort two simple materials by color, size, texture, or type.
Art/Sensory: Offer crayons, collage pieces, sensory tray items, or stamping connected to the theme.
Teacher Language: "I see you looking closely. What do you notice?"

Tuesday - Build Language
Circle Time: Sing a repeated song or fingerplay using ${theme} vocabulary.
Small Group: Match picture cards, objects, or simple props.
Fine Motor: Tear paper, squeeze play dough, place stickers, use tongs, or trace lines connected to the theme.
Teacher Language: "You found one that is the same. Let's say the word together."

Wednesday - Hands-On Exploration
Circle Time: Ask a simple question and let children respond with words, gestures, pointing, or movement.
Sensory/Science: Explore safe textures, sounds, colors, or movement connected to ${theme}.
Gross Motor: Add a movement game, obstacle path, animal walk, or action song.
Teacher Language: "You tried again. That is problem solving."

Thursday - Creative Expression
Circle Time: Revisit the theme book or song and invite children to fill in a word or motion.
Art: Create an open-ended project using theme colors, shapes, or materials.
Pretend Play: Add props for dramatic play, conversation, and turn-taking.
Teacher Language: "Tell me about your work."

Friday - Review and Document
Circle Time: Review favorite words, songs, pictures, or materials from the week.
Small Group: Repeat the easiest activity and add one small challenge.
Observation Note: Document one example of each child's ${area.toLowerCase()} growth.
Family Connection: Send home one simple idea families can try over the weekend.

Related Activities
${(resource.relatedActivities || ["Circle time", "Small group", "Printable extension"]).map((item) => `- ${item}`).join("\n")}

Child Support Connection
Use the Add Support button to document individualized accommodations, modifications, and support activities inside a child profile.

Provider Reflection
What worked well?
Which child showed new language, confidence, persistence, or social participation?
What will you repeat or extend next week?`;
  }
  if (resource.category === "Observation Hub") {
    const area = resource.tags.find((tag) => learningAreas.includes(tag)) || "Developmental area";
    return `Observation Resource
Title: ${resource.title}
Age Group: ${resource.age}
Developmental Area: ${area}

Professional Observation Wording
${resource.observationText || resource.description}

What to Look For
${resource.lookFor || "Watch for the child repeating the skill independently, applying it in new settings, or showing increased confidence."}

Learning Standard Category
${resource.standard || `Early learning guideline category connected to ${area}.`}

Evidence To Add
- Date and setting
- Materials or activity used
- Exact child language, gestures, choices, or actions
- Level of support needed
- Peer or adult interaction observed

Next Steps
${resource.nextSteps || "Offer similar materials with one small added challenge and document what the child tries next."}

Editable Note
Copy and personalize this wording with the child's name, date, and specific details from your observation.

Follow-Up Planning
Offer the child another chance to practice this skill during play, routine care, small group, or outdoor time. Add one new material, prompt, peer partner, or challenge when the child is ready.`;
  }
  if (resource.category === "Forms Library") {
    return `${resource.title}

Program Name: ______________________________
Child Name: ________________________________
Parent/Guardian: ___________________________
Date: ______________________________________

Purpose
Use this form to document ${resource.title.toLowerCase()} for your childcare program. Review and adjust wording to match your state licensing rules and your own policies.

Provider Instructions
1. Add your program name, contact information, and policy details.
2. Complete all child and family information.
3. Review the form with the parent or guardian.
4. Keep a signed copy in the child's file.

Details / Notes
__________________________________________________________________
__________________________________________________________________
__________________________________________________________________

Parent/Guardian Signature: ________________________ Date: ________
Provider Signature: _______________________________ Date: ________`;
  }
  if (resource.category === "Menu Center") {
    const age = resource.age === "All Ages" ? "Mixed Ages" : resource.age;
    return `Weekly Daycare Menu

Age Group: ${age}
Week/Theme: ${resource.title}

Monday
Breakfast: Oatmeal, banana slices, milk
Lunch: Turkey sandwich, peas, applesauce, milk
Snack: Cheese cubes and whole grain crackers

Tuesday
Breakfast: Scrambled eggs, toast, peaches, milk
Lunch: Chicken rice bowl, green beans, pears, milk
Snack: Yogurt and fruit

Wednesday
Breakfast: Whole grain cereal, berries, milk
Lunch: Bean quesadilla, corn, oranges, milk
Snack: Hummus and pita strips

Thursday
Breakfast: Pancakes, pears, milk
Lunch: Pasta with meat sauce, broccoli, peaches, milk
Snack: Cottage cheese and fruit

Friday
Breakfast: Yogurt, granola, apples, milk
Lunch: Tuna pita, carrots, mixed fruit, milk
Snack: Graham crackers and apples

Shopping List
Milk, yogurt, cheese, whole grain bread, crackers, cereal, eggs, turkey, chicken, beans, pasta, fruits, vegetables, and allergy-safe substitutions.

Provider Reminder
Check current CACFP/state rules, allergy plans, serving sizes, and infant/toddler texture safety before serving.`;
  }
  if (resource.category === "Activity Center") {
    const focus = resource.tags[0] || "Hands-on learning";
    const theme = resource.tags[1] || resource.theme || "daily routines";
    return `${resource.title}

Age Group: ${resource.age}
Theme: ${theme}
Learning Focus: ${focus}

Materials
Child-safe manipulatives, paper, crayons or markers, sensory tray materials, books, music, and simple theme-related props.

Setup
Prepare a small group space. Place materials where children can see and reach them safely. Introduce the theme with a short question, picture, song, or object.

Steps
1. Invite children to explore the materials.
2. Model simple language connected to the theme.
3. Encourage children to sort, count, name, build, move, trace, or pretend based on the activity.
4. Offer help with gentle prompts and choices.
5. Close by asking children what they noticed or liked.

Learning Objective
Children will practice ${focus.toLowerCase()} while building language, confidence, social interaction, and problem-solving through play.

Extension
Repeat the activity with one added challenge, a new material, or a partner turn-taking step.`;
  }
  return `Printable Includes:
${resource.title}

Age Group: ${resource.age}
Theme/Skill: ${resource.tags.slice(0, 2).join(" / ") || "Early learning practice"}

Teacher Directions
Print or display this activity for a short small-group or table activity. Read the directions aloud, model one example, then let children try with support.

Child Directions
Look carefully, trace or color the page, and talk about what you notice.

Activity Ideas
- Name the pictures, letters, numbers, shapes, or theme words.
- Trace with a finger first, then use a crayon or marker.
- Count, match, color, cut, or sort as appropriate for the printable.
- Ask one open-ended question about the theme.

Learning Goal
Children will practice early literacy, fine motor control, visual discrimination, vocabulary, and confidence with a simple printable activity.

Provider Note
Use close supervision with scissors, small pieces, or art materials. Adjust expectations for each child's age and development.`;
}

function ensureResourceViewer() {
  if (document.querySelector("#resourceViewerModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal resource-viewer-modal" id="resourceViewerModal" aria-hidden="true">
      <div class="modal-card resource-viewer-card" role="dialog" aria-modal="true" aria-labelledby="resourceViewerTitle">
        <button class="close-button" id="closeResourceViewer" aria-label="Close">&times;</button>
        <p class="eyebrow" id="resourceViewerCategory">Resource</p>
        <h2 id="resourceViewerTitle">Resource</h2>
        <div class="tag-row" id="resourceViewerTags"></div>
        <div class="resource-viewer-toolbar">
          <button class="primary-button" id="printResourceButton" type="button">Print / Save PDF</button>
        </div>
        <div class="resource-viewer-body" id="resourceViewerBody"></div>
      </div>
    </div>
  `);
  document.querySelector("#closeResourceViewer")?.addEventListener("click", closeResourceViewer);
  document.querySelector("#printResourceButton")?.addEventListener("click", printResourceViewer);
  document.querySelector("#resourceViewerModal")?.addEventListener("click", (event) => {
    if (event.target.id === "resourceViewerModal") closeResourceViewer();
  });
}

function closeResourceViewer() {
  const viewer = document.querySelector("#resourceViewerModal");
  if (!viewer) return;
  viewer.classList.remove("open");
  viewer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("printing-resource");
}

function printResourceViewer() {
  const viewer = document.querySelector("#resourceViewerModal");
  if (!viewer?.classList.contains("open")) return;
  document.body.classList.add("printing-resource");
  const cleanup = () => {
    document.body.classList.remove("printing-resource");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 1600);
}

function openResourceViewer(resourceId) {
  const resource = resources.find((item) => item.id === resourceId);
  if (!resource) return;
  if (!canAccess(resource)) {
    showProFeatureModal(freeResourceLimitMessage);
    return;
  }
  ensureResourceViewer();
  document.querySelector("#resourceViewerCategory").textContent = resource.category;
  document.querySelector("#resourceViewerTitle").textContent = resource.title;
  document.querySelector("#resourceViewerTags").innerHTML = [
    resource.age,
    resource.plan,
    resource.format || "In-app resource",
    ...resource.tags.slice(0, 4),
  ].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const body = document.querySelector("#resourceViewerBody");
  if (resource.fileData && resource.fileData.startsWith("data:image")) {
    body.innerHTML = `
      <article class="printable-resource-page">
        <section class="print-section print-cover">
          <h3>${escapeHtml(resource.title)}</h3>
          <p>${escapeHtml(resource.description || "Printable uploaded resource.")}</p>
        </section>
        <img class="resource-viewer-image" src="${resource.fileData}" alt="${escapeHtml(resource.title)}" />
      </article>
    `;
  } else {
    body.innerHTML = resourcePrintableHtml(resource);
  }
  if (!savedDownloads.includes(resource.id)) {
    savedDownloads = [...savedDownloads, resource.id];
    saveDownloads();
    updatePlanLabel();
  }
  const viewer = document.querySelector("#resourceViewerModal");
  viewer.classList.add("open");
  viewer.setAttribute("aria-hidden", "false");
  trackEvent("resource_view", { resourceId, category: resource.category, plan: currentPlan });
}

function renderCategoryPage(view) {
  const category = viewMap[view];
  const section = document.querySelector(`#view-${view}`);
  const items = categoryResources(category);
  const allCategoryItems = resources.filter((resource) => resource.category === category);
  const accessCounts = categoryAccessCounts(category);
  const filters = categoryFilters(category);
  const displayTitle = view === "lessons" ? "Lesson Plan Library" : category;
  section.innerHTML = `
    <div class="page-title">
      <p class="eyebrow">${displayTitle}</p>
      <h2>${displayTitle}</h2>
      <p>${categoryIntro(category)}</p>
    </div>
    <div class="library-stats">
      <div><strong>${accessCounts.total}</strong><span>ready-made resources</span></div>
      <div><strong>${accessCounts.freeLimit}</strong><span>Free access</span></div>
      <div><strong>${accessCounts.proOnly}</strong><span>Pro unlocks</span></div>
    </div>
    <div class="access-notice ${isProUser() ? "pro" : ""}">
      ${isProUser()
        ? `Pro is active: full in-app library access, saved favorites, viewed resources, and ${Math.max(paidAiMonthlyLimit - aiUsageCount(), 0)} AI generations left this month.`
        : `Free plan: ${accessCounts.freeLimit} ${displayTitle.toLowerCase()} resources are unlocked here. Upgrade to Pro for all ${accessCounts.total}.`}
    </div>
    <div class="filter-row">
      ${filters.map((filter) => `<button class="${activeFilter === filter ? "active-filter" : ""}" data-filter="${filter}">${filter}</button>`).join("")}
    </div>
    ${category === "Observation Hub" ? renderObservationEditor() : ""}
    <div class="resource-grid">
      ${items.length ? items.map(resourceCard).join("") : `<div class="empty-state">No resources found. Try another search or filter.</div>`}
    </div>
  `;
}

function renderObservationEditor() {
  if (!activeObservationEditId) return "";
  const resource = resources.find((item) => item.id === activeObservationEditId);
  if (!resource) return "";
  const area = resource.tags.find((tag) => learningAreas.includes(tag)) || "Cognitive";
  return `
    <section class="section-block observation-editor">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Editable Observation</p>
          <h3>${resource.title}</h3>
        </div>
        <button class="ghost-button" data-close-observation-editor type="button">Close</button>
      </div>
      <form id="observationEditForm" class="panel-form">
        <input name="id" type="hidden" value="${resource.id}" />
        <div class="form-grid-two">
          <label>Title<input name="title" value="${resource.title}" /></label>
          <label>Developmental Area<select name="area">${learningAreas.map((item) => `<option ${item === area ? "selected" : ""}>${item}</option>`).join("")}</select></label>
        </div>
        <label>Professional Observation<textarea name="observationText" rows="4">${resource.observationText || resource.description}</textarea></label>
        <label>What to Look For<textarea name="lookFor" rows="3">${resource.lookFor || ""}</textarea></label>
        <label>Next Steps<textarea name="nextSteps" rows="3">${resource.nextSteps || ""}</textarea></label>
        <label>Learning Standard<textarea name="standard" rows="2">${resource.standard || `Early learning guideline category: ${area}.`}</textarea></label>
        <button class="primary-button" type="submit">Save Observation Edit</button>
      </form>
    </section>
  `;
}

function categoryFilters(category) {
  const shared = ["All", "Infant", "Toddler", "Preschool", "All Ages"];
  const map = {
    "Lesson Plans": [...shared, ...learningAreas, ...months, "Holiday", "Non-Holiday", ...lessonThemes.slice(0, 30)],
    "Observation Hub": [...shared, ...learningAreas],
    "Forms Library": ["All", "All Ages", ...Object.keys(formGroups), "Editable", "PDF"],
    "Menu Center": ["All", "All Ages", "Infant", "Toddler", "Preschool", "52 Weeks of Menus", "Breakfast", "Lunch", "Snack", "Shopping List"],
    "Activity Center": [...shared, ...activityTypes],
    "Printables": ["All", "Toddler", "Preschool", ...printableTypes.slice(0, 8), "Seasonal", "Holiday"],
  };
  return map[category] || shared;
}

function categoryIntro(category) {
  const copy = {
    "Lesson Plans": "Choose infant, toddler, preschool, holiday, and seasonal lesson plans with materials, activities, books, goals, and printable options.",
    "Observation Hub": "Search infant, toddler, and preschool observation wording by developmental area, what to look for, standards, and next steps.",
    "Forms Library": "View editable childcare paperwork like parent handbooks, enrollment forms, emergency contacts, reports, trackers, and receipts inside Little Learner Hub.",
    "Activity Center": "Find a large bank of activities by age, theme, skill, and materials with quick steps and learning goals.",
    "Menu Center": "Browse 52 weeks of daycare menus, infant/toddler/preschool meal ideas, shopping lists, and CACFP-style inspiration.",
    "Printables": "View tracing pages, coloring pages, alphabet, numbers, shapes, cutting, matching, seasonal, and holiday worksheet concepts inside Little Learner Hub.",
  };
  return copy[category];
}

function renderHome() {
  if (!document.querySelector("#categoryGrid")) {
    document.querySelector("#view-home").innerHTML = homeViewTemplate;
  }
  const stats = {
    total: resources.length,
    lessons: resources.filter((resource) => resource.category === "Lesson Plans").length,
    observations: resources.filter((resource) => resource.category === "Observation Hub").length,
    downloads: resources.filter((resource) => ["Forms Library", "Printables", "Menu Center"].includes(resource.category)).length,
  };
  const homeStats = document.querySelector("#homeStats");
  if (homeStats) {
    homeStats.innerHTML = `
      <div><strong>${stats.total}</strong><span>ready-made resources</span></div>
      <div><strong>${stats.lessons}</strong><span>lesson plans</span></div>
      <div><strong>${stats.observations}</strong><span>observations</span></div>
      <div><strong>${stats.downloads}</strong><span>in-app resources</span></div>
    `;
  }
  document.querySelector("#categoryGrid").innerHTML = categories.map((category) => `
    <button class="category-button" data-view="${category.view}">
      <span class="icon">${category.icon}</span>
      <strong>${category.title}</strong>
      <span>${category.detail}</span>
    </button>
  `).join("");

  const newItems = resources.filter((resource) => resource.month === "June").slice(0, 4);
  document.querySelector("#newThisMonth").innerHTML = newItems.map(compactItem).join("");
  renderHomeFoundingOffer();
  renderPreviewLibrary();
  renderFavorites();
  updatePlanLabel();
}

function defaultPlanner() {
  const today = new Date();
  const monday = new Date(today);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return {
    weekOf: monday.toISOString().slice(0, 10),
    ageGroup: "Toddler",
    theme: "Farm Animals",
    focus: "Language, fine motor, and social emotional skills",
    notes: "Keep activities low-prep, flexible, and easy to repeat.",
    resourceId: "",
    days: Object.fromEntries(plannerDays.map((plannerDay) => [plannerDay, {
      circle: "",
      activity: "",
      meal: "",
      rest: "",
      support: "",
    }])),
  };
}

function weeklyPlanner() {
  const saved = readSavedJson("llhWeeklyPlanner", null);
  const planner = { ...defaultPlanner(), ...(saved || {}) };
  planner.days = { ...defaultPlanner().days, ...(planner.days || {}) };
  return planner;
}

function saveWeeklyPlanner(planner) {
  localStorage.setItem("llhWeeklyPlanner", JSON.stringify(planner));
}

function plannerSuggestions(planner) {
  const query = [planner.theme, planner.ageGroup, planner.focus].join(" ").toLowerCase();
  return resources
    .filter((resource) => ["Lesson Plans", "Activity Center", "Menu Center", "Printables"].includes(resource.category))
    .filter((resource) => canAccess(resource))
    .map((resource) => {
      const haystack = [resource.title, resource.age, resource.description, ...resource.tags].join(" ").toLowerCase();
      const score = query.split(/\s+/).filter((word) => word.length > 2 && haystack.includes(word)).length;
      return { resource, score };
    })
    .filter((item) => item.score > 0 || item.resource.age === planner.ageGroup || item.resource.age === "All Ages")
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.resource);
}

function plannerResourceOptions(planner) {
  const suggested = plannerSuggestions(planner);
  const selected = resources.find((resource) => resource.id === planner.resourceId);
  const options = selected && !suggested.some((resource) => resource.id === selected.id)
    ? [selected, ...suggested]
    : suggested;
  return [
    `<option value="">No library resource selected</option>`,
    ...options.map((resource) => `<option value="${resource.id}" ${resource.id === planner.resourceId ? "selected" : ""}>${resource.title} - ${resource.category}</option>`),
  ].join("");
}

function renderWeeklyPlanner() {
  const app = document.querySelector("#weeklyPlannerApp");
  if (!app) return;
  const planner = weeklyPlanner();
  const suggestions = plannerSuggestions(planner);
  const filledDayCount = plannerDays.filter((day) => {
    const entry = planner.days[day] || {};
    return Object.values(entry).some(Boolean);
  }).length;
  app.innerHTML = `
    <div class="planner-dashboard">
      <section class="planner-summary section-block">
        <div>
          <p class="eyebrow">Current Week</p>
          <h3>${planner.theme || "Untitled Week"}</h3>
          <p>${planner.ageGroup} plan beginning ${planner.weekOf || "not set"}</p>
        </div>
        <div class="planner-metrics">
          <div><strong>${filledDayCount}/5</strong><span>days planned</span></div>
          <div><strong>${suggestions.length}</strong><span>matched resources</span></div>
          <div><strong>${isProUser() ? "Pro" : "Free"}</strong><span>current access</span></div>
        </div>
      </section>

      <form id="weeklyPlannerForm" class="planner-form">
        <section class="panel-form">
          <p class="eyebrow">Week Setup</p>
          <div class="form-grid-two">
            <label>Week Of<input name="weekOf" type="date" value="${planner.weekOf || ""}" /></label>
            <label>Age Group<select name="ageGroup">${["Infant", "Toddler", "Preschool", "Mixed Ages"].map((age) => `<option ${planner.ageGroup === age ? "selected" : ""}>${age}</option>`).join("")}</select></label>
          </div>
          <label>Theme<input name="theme" value="${planner.theme || ""}" placeholder="Farm Animals" /></label>
          <label>Learning Focus<input name="focus" value="${planner.focus || ""}" placeholder="language, fine motor, social emotional" /></label>
          <label>Library Resource<select name="resourceId">${plannerResourceOptions(planner)}</select></label>
          <label>Provider Notes<textarea name="notes" rows="3" placeholder="Reminders, materials, family notes, prep list">${planner.notes || ""}</textarea></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">Save Week</button>
            <button class="ghost-button" type="button" id="copyPlannerButton">Copy Plan</button>
            <button class="ghost-button" type="button" id="downloadPlannerButton">Download</button>
            <button class="danger-button" type="button" id="clearPlannerButton">Clear</button>
          </div>
        </section>

        <section class="planner-board">
          ${plannerDays.map((day) => {
            const entry = planner.days[day] || {};
            return `
              <article class="planner-day">
                <h3>${day}</h3>
                <label>Circle Time<textarea name="${day}-circle" rows="2" placeholder="Song, book, vocabulary">${entry.circle || ""}</textarea></label>
                <label>Main Activity<textarea name="${day}-activity" rows="3" placeholder="Hands-on activity and materials">${entry.activity || ""}</textarea></label>
                <label>Meals/Snack<input name="${day}-meal" value="${entry.meal || ""}" placeholder="Breakfast, lunch, snack notes" /></label>
                <label>Rest/Routine<input name="${day}-rest" value="${entry.rest || ""}" placeholder="Nap, outdoor, transition notes" /></label>
                <label>Child Support<textarea name="${day}-support" rows="2" placeholder="Adaptations, small group, individual help">${entry.support || ""}</textarea></label>
              </article>
            `;
          }).join("")}
        </section>
      </form>

      <aside class="planner-suggestions section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Library Match</p>
            <h3>Suggested resources</h3>
          </div>
        </div>
        <div class="resource-list compact">
          ${suggestions.length ? suggestions.map((resource) => `
            <div class="compact-item">
              <div>
                <strong>${resource.title}</strong>
                <span>${resource.category} ¬∑ ${resource.age} ¬∑ ${resource.plan}</span>
              </div>
              <button class="ghost-button" data-planner-resource="${resource.id}" type="button">Use</button>
            </div>
          `).join("") : `<div class="empty-state">Add a theme or focus to see matching resources.</div>`}
        </div>
      </aside>
    </div>
  `;
}

function collectPlannerData(form) {
  const data = collectFormData(form);
  const planner = {
    weekOf: data.weekOf,
    ageGroup: data.ageGroup,
    theme: data.theme,
    focus: data.focus,
    notes: data.notes,
    resourceId: data.resourceId,
    days: {},
  };
  plannerDays.forEach((day) => {
    planner.days[day] = {
      circle: data[`${day}-circle`] || "",
      activity: data[`${day}-activity`] || "",
      meal: data[`${day}-meal`] || "",
      rest: data[`${day}-rest`] || "",
      support: data[`${day}-support`] || "",
    };
  });
  return planner;
}

function plannerExportText(planner = weeklyPlanner()) {
  const resource = resources.find((item) => item.id === planner.resourceId);
  return `Little Learner Hub Weekly Plan
Week Of: ${planner.weekOf || ""}
Age Group: ${planner.ageGroup || ""}
Theme: ${planner.theme || ""}
Learning Focus: ${planner.focus || ""}
Library Resource: ${resource ? `${resource.title} (${resource.category})` : "None selected"}

Provider Notes
${planner.notes || ""}

Monday-Friday Plan
${plannerDays.map((day) => {
  const entry = planner.days[day] || {};
  return `${day}
- Circle Time: ${entry.circle || ""}
- Main Activity: ${entry.activity || ""}
- Meals/Snack: ${entry.meal || ""}
- Rest/Routine: ${entry.rest || ""}
- Child Support: ${entry.support || ""}`;
}).join("\n\n")}`;
}

function renderAiPage() {
  renderQuickPrompts();
  renderChatWindow();
  renderAiUsagePanel();
  renderAiToolGrid();
  renderSavedPreferences();
}

function renderAiUsagePanel() {
  const target = document.querySelector("#aiUsagePanel");
  if (!target) return;
  const used = aiUsageCount();
  const limit = aiMonthlyLimit();
  const remaining = aiUsageRemaining();
  target.innerHTML = `
    <div class="ai-usage-panel">
      <div>
        <p class="eyebrow">AI Usage</p>
        <h4>${used} of ${limit} generations used</h4>
        <span>${remaining} remaining ¬∑ Resets ${escapeHtml(aiResetLabel())}</span>
      </div>
      <div class="usage-bar" aria-label="${used} of ${limit} AI generations used">
        <span style="width: ${Math.min((used / limit) * 100, 100)}%"></span>
      </div>
    </div>
  `;
}

function renderQuickPrompts() {
  const promptWrap = document.querySelector("#quickPrompts");
  if (!promptWrap) return;
  promptWrap.innerHTML = quickPrompts.map((prompt) => `
    <button class="prompt-chip" data-prompt="${prompt}">${prompt}</button>
  `).join("");
}

function renderChatWindow() {
  const chat = document.querySelector("#chatWindow");
  if (!chat) return;
  const savedMessages = readSavedJson("llhAiMessages", []);
  if (!savedMessages.length) {
    chat.innerHTML = `
      <div class="chat-message assistant">
        <strong>Ask Leah AI</strong>
        <p>Hi! Ask me for lesson plans, observations, newsletters, parent notes, menus, activities, daily reports, or handbook wording.</p>
      </div>
    `;
    return;
  }
  chat.innerHTML = savedMessages.map((message) => `
    <div class="chat-message ${message.role}">
      <strong>${message.role === "user" ? "You" : "Ask Leah AI"}</strong>
      <p>${lineBreaks(message.text)}</p>
    </div>
  `).join("");
  chat.scrollTop = chat.scrollHeight;
}

function addAiMessage(role, text) {
  const savedMessages = readSavedJson("llhAiMessages", []);
  savedMessages.push({ role, text });
  localStorage.setItem("llhAiMessages", JSON.stringify(savedMessages.slice(-8)));
  renderChatWindow();
}

function renderAiToolGrid() {
  const grid = document.querySelector("#aiToolGrid");
  if (!grid) return;
  grid.innerHTML = aiTools.map((tool) => `
    <article class="ai-tool-card">
      <span class="tag access-tag">Pro AI</span>
      <h3>${tool.title}</h3>
      <p>${tool.detail}</p>
      <button class="primary-button" data-tool="${tool.id}" type="button">Open Tool</button>
    </article>
  `).join("");
}

function renderGeneratorWorkspace(toolId) {
  const workspace = document.querySelector("#generatorWorkspace");
  if (!workspace) return;
  const tool = aiTools.find((item) => item.id === toolId) || aiTools[0];
  const locked = accessRank[currentPlan] < accessRank.Pro;
  workspace.innerHTML = `
    <div class="tool-tabs">
      ${aiTools.map((item) => `<button class="${item.id === tool.id ? "active-filter" : ""}" data-tool="${item.id}" type="button">${item.title.replace("AI ", "")}</button>`).join("")}
    </div>
    <div class="generator-panel ${locked ? "tool-locked" : ""}">
      <form class="panel-form generator-form" id="activeGeneratorForm" data-generator="${tool.id}">
        <p class="eyebrow">${locked ? "Premium Preview" : "Ready to Generate"}</p>
        <h3>${tool.title}</h3>
        <p>${tool.detail}</p>
        ${tool.fields.map(renderGeneratorField).join("")}
        <button class="primary-button" type="submit">${locked ? "Preview AI Output" : "Generate"}</button>
      </form>
      <div class="ai-output-panel">
        <div class="output-toolbar">
          <div>
            <p class="eyebrow">Generated Result</p>
            <h3 id="outputTitle">Ready when you are</h3>
          </div>
          <div class="output-actions">
            <button class="ghost-button" id="editOutputButton" type="button">Edit</button>
            <button class="ghost-button" id="copyOutputButton" type="button">Copy</button>
            <button class="ghost-button" id="saveOutputButton" type="button">Save</button>
            <button class="ghost-button" id="saveOutputLibraryButton" type="button">Save to Library</button>
            <button class="ghost-button" id="regenerateOutputButton" type="button">Regenerate</button>
            <button class="ghost-button" id="printOutputButton" type="button">Print</button>
            <button class="ghost-button" id="downloadOutputButton" type="button">Download</button>
          </div>
        </div>
        <pre id="generatorOutput" contenteditable="true" spellcheck="true">Fill out the form and generate a childcare-ready result.</pre>
      </div>
    </div>
  `;
  renderGeneratedHistory();
}

function renderGeneratorField(field) {
  const [name, label, type, value] = field;
  if (type === "select") {
    return `
      <label>
        ${label}
        <select name="${name}">
          ${value.map((option) => `<option>${option}</option>`).join("")}
        </select>
      </label>
    `;
  }
  if (type === "textarea") {
    return `
      <label>
        ${label}
        <textarea name="${name}" rows="4" placeholder="${value}"></textarea>
      </label>
    `;
  }
  return `
    <label>
      ${label}
      <input name="${name}" placeholder="${value}" />
    </label>
  `;
}

function renderFutureTools(activeToolId = futureTools[0].id) {
  const grid = document.querySelector("#futureToolGrid");
  const workspace = document.querySelector("#futureToolWorkspace");
  if (!grid || !workspace) return;
  const activeTool = futureTools.find((tool) => tool.id === activeToolId) || futureTools[0];
  grid.innerHTML = futureTools.map((tool) => `
    <article class="future-tool-card ${tool.id === activeTool.id ? "active-future-tool" : ""}">
      <span class="tag">${tool.id === "licensing" ? "Checklist" : "Builder"}</span>
      <h3>${tool.title}</h3>
      <p>${tool.detail}</p>
      <button class="primary-button" data-future-tool="${tool.id}" type="button">Open Tool</button>
    </article>
  `).join("");
  workspace.innerHTML = `
    <div class="future-panel">
      <form class="panel-form future-tool-form" id="futureToolForm" data-future="${activeTool.id}">
        <p class="eyebrow">Provider Tool</p>
        <h3>${activeTool.title}</h3>
        <p>${activeTool.detail}</p>
        ${activeTool.fields.map(renderGeneratorField).join("")}
        <button class="primary-button" type="submit">Create Printable</button>
      </form>
      <div class="ai-output-panel">
        <div class="output-toolbar">
          <div>
            <p class="eyebrow">Printable Result</p>
            <h3 id="futureOutputTitle">Ready when you are</h3>
          </div>
          <div class="output-actions">
            <button class="ghost-button" id="copyFutureOutputButton" type="button">Copy</button>
            <button class="ghost-button" id="downloadFutureOutputButton" type="button">Download</button>
          </div>
        </div>
        <pre id="futureOutput">Fill out the form to create a ready-to-edit provider tool.</pre>
      </div>
    </div>
  `;
}

function generateFutureToolOutput(toolId, data) {
  const generators = {
    licensing: generateLicensingChecklist,
    schedule: generateDailySchedule,
    curriculum: generateCurriculumPlan,
    attendance: generateAttendanceTracker,
    meal: generateMealPlanner,
    portfolio: generatePortfolioPage,
  };
  return generators[toolId](data);
}

function childStore(key, fallback = []) {
  return readSavedJson(`llhChild${key}`, fallback);
}

function saveChildStore(key, value) {
  localStorage.setItem(`llhChild${key}`, JSON.stringify(value));
}

function childRecords() {
  return {
    children: childStore("Profiles"),
    observations: childStore("Observations"),
    supportPlans: childStore("SupportPlans"),
    goals: childStore("Goals"),
    differentiations: childStore("Differentiations"),
    attendance: childStore("Attendance"),
    meals: childStore("Meals"),
    reports: childStore("Reports"),
    communications: childStore("Communications"),
  };
}

function childName(childId) {
  return childRecords().children.find((child) => child.id === childId)?.name || "Child";
}

function selectedChild(records = childRecords()) {
  return records.children.find((child) => child.id === selectedChildId) || records.children[0] || null;
}

function currentWeekStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function isThisWeek(dateText) {
  if (!dateText) return false;
  const date = new Date(`${dateText}T12:00:00`);
  const start = currentWeekStart();
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function lastObservationDate(childId, observations = childRecords().observations) {
  const dates = observations.filter((item) => item.childId === childId).map((item) => item.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : "None yet";
}

function childOptions(selected = "") {
  const records = childRecords();
  return records.children.map((child) => `<option value="${child.id}" ${child.id === selected ? "selected" : ""}>${child.name}</option>`).join("");
}

function areaOptions(selected = "") {
  return developmentalAreas.map((area) => `<option ${area === selected ? "selected" : ""}>${area}</option>`).join("");
}

function lockedFeatureCard(title, detail = "Upgrade to Pro to unlock this child management tool.") {
  return `
    <div class="locked-tool">
      <span class="tag access-tag">Pro</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(detail)}</p>
      <button class="primary-button" data-pro-feature="${slug(title)}" type="button">Upgrade to Pro</button>
    </div>
  `;
}

function renderChildManagement() {
  const app = document.querySelector("#childManagementApp");
  if (!app) return;
  const records = childRecords();
  if (!selectedChildId && records.children[0]) selectedChildId = records.children[0].id;
  const child = selectedChild(records);
  const weeklyCompletedIds = new Set(records.observations.filter((item) => isThisWeek(item.date)).map((item) => item.childId));
  const completedChildren = records.children.filter((item) => weeklyCompletedIds.has(item.id));
  const stillNeedChildren = records.children.filter((item) => !weeklyCompletedIds.has(item.id));
  const weeklyPercent = records.children.length ? Math.round((completedChildren.length / records.children.length) * 100) : 0;
  const childObservations = child ? records.observations.filter((item) => item.childId === child.id) : [];
  const filteredObservations = childObservations.filter((item) => {
    const matchesSearch = [item.text, item.area, item.nextSteps].join(" ").toLowerCase().includes(childObservationSearch.toLowerCase());
    const matchesArea = childObservationAreaFilter === "All" || item.area === childObservationAreaFilter;
    const matchesDate = !childObservationDateFilter || item.date === childObservationDateFilter;
    return matchesSearch && matchesArea && matchesDate;
  });

  app.innerHTML = `
    <section class="child-dashboard">
      <div class="home-stats">
        <div><strong>${records.children.length}</strong><span>children enrolled</span></div>
        <div><strong>${completedChildren.length}</strong><span>observations this week</span></div>
        <div><strong>${stillNeedChildren.length}</strong><span>still need observations</span></div>
        <div><strong>${weeklyPercent}%</strong><span>weekly progress</span></div>
      </div>
      <div class="section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Weekly Observation Progress</p>
            <h3>${completedChildren.length} of ${records.children.length} children completed</h3>
          </div>
        </div>
        <div class="progress-bar"><span style="width:${weeklyPercent}%"></span></div>
        <div class="weekly-lists">
          <div><strong>Completed</strong><p>${completedChildren.length ? completedChildren.map((item) => item.name).join(", ") : "None yet"}</p></div>
          <div><strong>Still Need</strong><p>${stillNeedChildren.length ? stillNeedChildren.map((item) => item.name).join(", ") : "All children have an observation this week."}</p></div>
        </div>
      </div>
    </section>

    <section class="child-layout">
      <aside class="child-sidebar section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Child Profiles</p>
            <h3>Add child</h3>
          </div>
        </div>
        <form id="childProfileForm" class="mini-form">
          <input name="id" type="hidden" />
          <label>Child Name<input name="name" required placeholder="Emma" /></label>
          <label>Age Group<select name="ageGroup"><option>Infant</option><option>Toddler</option><option>Preschool</option></select></label>
          <label>Date of Birth<input name="dob" type="date" /></label>
          <label>Enrollment Date<input name="enrollmentDate" type="date" /></label>
          <label>Parent/Guardian Information<textarea name="parentInfo" rows="2" placeholder="Name, phone, email"></textarea></label>
          <label>Emergency Contacts<textarea name="emergency" rows="2" placeholder="Emergency contacts"></textarea></label>
          <label>Allergies<textarea name="allergies" rows="2" placeholder="Allergies"></textarea></label>
          <label>Medical Notes<textarea name="medical" rows="2" placeholder="Medical notes"></textarea></label>
          <label>Child Photo<input name="photo" type="file" accept="image/*" /></label>
          <label>Additional Notes<textarea name="notes" rows="2" placeholder="Anything helpful"></textarea></label>
          <button class="primary-button" type="submit">Save Child</button>
          ${!isProUser() ? `<p class="form-note">Free plan includes up to ${freeChildProfileLimit} child profiles.</p>` : ""}
        </form>
        <div class="child-list">
          ${records.children.length ? records.children.map((item) => `
            <button class="child-list-item ${child?.id === item.id ? "active-child" : ""}" data-select-child="${item.id}">
              ${item.photo ? `<img src="${item.photo}" alt="${item.name}" />` : `<span>${item.name.slice(0, 1).toUpperCase()}</span>`}
              <strong>${item.name}</strong>
              <small>${item.ageGroup}</small>
            </button>
          `).join("") : `<div class="empty-state">Add a child name and age group to begin.</div>`}
        </div>
      </aside>

      <section class="child-profile-area">
        ${child ? renderChildProfile(child, records, filteredObservations) : `<div class="section-block empty-state">Child management is optional. Add a child when you are ready to track observations, goals, support plans, attendance, meals, reports, and portfolios.</div>`}
      </section>
    </section>
  `;
}

function renderChildProfile(child, records, filteredObservations) {
  const observations = records.observations.filter((item) => item.childId === child.id);
  const supportPlans = records.supportPlans.filter((item) => item.childId === child.id);
  const goals = records.goals.filter((item) => item.childId === child.id);
  const attendance = records.attendance.filter((item) => item.childId === child.id);
  const meals = records.meals.filter((item) => item.childId === child.id);
  const reports = records.reports.filter((item) => item.childId === child.id);
  const comms = records.communications.filter((item) => item.childId === child.id);
  const differentiations = records.differentiations.filter((item) => item.childId === child.id);
  return `
    <div class="section-block child-profile-header">
      ${child.photo ? `<img src="${child.photo}" alt="${child.name}" />` : `<div class="child-avatar">${child.name.slice(0, 1).toUpperCase()}</div>`}
      <div>
        <p class="eyebrow">Child Profile</p>
        <h3>${child.name}</h3>
        <p>${child.ageGroup} ¬∑ Last observation: ${lastObservationDate(child.id, records.observations)}</p>
        <p>${child.allergies ? `Allergies: ${child.allergies}` : "No allergies listed."}</p>
      </div>
      <button class="ghost-button" ${isProUser() ? `data-export-portfolio="${child.id}"` : `data-pro-feature="child-portfolios"`} type="button">Export Portfolio</button>
    </div>

    <div class="child-profile-grid">
      <section class="section-block">
        <p class="eyebrow">Observations</p>
        <h3>${observations.length} total observations</h3>
        <div class="child-filter-row">
          <input id="childObservationSearch" value="${childObservationSearch}" placeholder="Search observations" />
          <input id="childObservationDate" type="date" value="${childObservationDateFilter}" />
          <select id="childObservationArea"><option>All</option>${areaOptions(childObservationAreaFilter)}</select>
        </div>
        <form id="childObservationForm" class="mini-form">
          <input name="childId" type="hidden" value="${child.id}" />
          <label>Date<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
          <label>Developmental Area<select name="area">${areaOptions()}</select></label>
          <label>Observation<textarea name="text" rows="3" placeholder="Child stacked 6 blocks and named colors."></textarea></label>
          <label>Next Steps<textarea name="nextSteps" rows="2" placeholder="Offer more color sorting and counting practice."></textarea></label>
          <button class="primary-button" type="submit">Add Observation</button>
        </form>
        <div class="resource-list compact">${filteredObservations.length ? filteredObservations.map(observationItem).join("") : `<div class="empty-state">No observations match yet.</div>`}</div>
      </section>

      <section class="section-block">
        <p class="eyebrow">Support Plans</p>
        <h3>Individual child support</h3>
        ${isProUser() ? supportForm(child.id) : lockedFeatureCard("Individual Child Support Plans")}
        <div class="resource-list compact">${supportPlans.length ? supportPlans.map(simpleRecordItem).join("") : `<div class="empty-state">No support plans yet.</div>`}</div>
      </section>

      <section class="section-block">
        <p class="eyebrow">Development Goals</p>
        <h3>Goal tracking</h3>
        ${isProUser() ? goalForm(child.id) : lockedFeatureCard("Development Goal Tracking")}
        <div class="resource-list compact">${goals.length ? goals.map(goalItem).join("") : `<div class="empty-state">No goals yet.</div>`}</div>
      </section>

      <section class="section-block">
        <p class="eyebrow">Lesson Plan Differentiation</p>
        <h3>Individualized activities</h3>
        ${isProUser() ? differentiationForm(child.id) : lockedFeatureCard("Lesson Plan Differentiation")}
        <div class="resource-list compact">${differentiations.length ? differentiations.map(simpleRecordItem).join("") : `<div class="empty-state">No lesson plan supports yet.</div>`}</div>
      </section>

      <section class="section-block">
        <p class="eyebrow">Attendance</p>
        <h3>Daily attendance</h3>
        ${isProUser() ? attendanceForm(child.id) : lockedFeatureCard("Attendance Tracking")}
        <div class="resource-list compact">${attendance.length ? attendance.slice(-5).reverse().map(simpleRecordItem).join("") : `<div class="empty-state">No attendance records yet.</div>`}</div>
      </section>

      <section class="section-block">
        <p class="eyebrow">Meals</p>
        <h3>Meal tracking</h3>
        ${isProUser() ? mealTrackingForm(child.id) : lockedFeatureCard("Meal Tracking")}
        <div class="resource-list compact">${meals.length ? meals.slice(-5).reverse().map(simpleRecordItem).join("") : `<div class="empty-state">No meal records yet.</div>`}</div>
      </section>

      <section class="section-block">
        <p class="eyebrow">Daily Reports</p>
        <h3>Report builder</h3>
        ${isProUser() ? `<button class="primary-button" data-build-daily-report="${child.id}" type="button">Generate From Today</button>` : lockedFeatureCard("Daily Reports")}
        <div class="resource-list compact">${reports.length ? reports.slice(-5).reverse().map(simpleRecordItem).join("") : `<div class="empty-state">No daily reports yet.</div>`}</div>
      </section>

      <section class="section-block">
        <p class="eyebrow">Parent Communication</p>
        <h3>Notes and updates</h3>
        ${isProUser() ? communicationForm(child.id) : lockedFeatureCard("Parent Communication Tools")}
        <div class="resource-list compact">${comms.length ? comms.slice(-5).reverse().map(simpleRecordItem).join("") : `<div class="empty-state">No parent communication yet.</div>`}</div>
      </section>
    </div>
  `;
}

function supportForm(childId) {
  return `
    <form id="supportPlanForm" class="mini-form">
      <input name="childId" type="hidden" value="${childId}" />
      <label>Developmental Area<select name="area">${areaOptions()}</select></label>
      <label>Goal<input name="goal" placeholder="Improve balance and coordination" /></label>
      <label>Support Activity<textarea name="activity" rows="2" placeholder="Tape line walking, obstacle course, hopping games"></textarea></label>
      <label>Notes<textarea name="notes" rows="2" placeholder="What helps this child?"></textarea></label>
      <label>Next Steps<textarea name="nextSteps" rows="2" placeholder="Practice 2-3 times weekly"></textarea></label>
      <label>Progress Status<select name="status"><option>Getting Started</option><option>Improving</option><option>Meeting Goal</option><option>Needs More Support</option></select></label>
      <button class="primary-button" type="submit">Add Support Plan</button>
    </form>
  `;
}

function goalForm(childId) {
  return `
    <form id="childGoalForm" class="mini-form">
      <input name="childId" type="hidden" value="${childId}" />
      <label>Developmental Area<select name="area">${areaOptions()}</select></label>
      <label>Goal<input name="goal" placeholder="Use 3-word phrases during play" /></label>
      <label>Target Date<input name="targetDate" type="date" /></label>
      <label>Progress<select name="progress"><option>Not Started</option><option>In Progress</option><option>Improving</option><option>Complete</option></select></label>
      <label>Notes<textarea name="notes" rows="2" placeholder="Progress notes"></textarea></label>
      <button class="primary-button" type="submit">Add Goal</button>
    </form>
  `;
}

function differentiationForm(childId) {
  return `
    <form id="differentiationForm" class="mini-form">
      <input name="childId" type="hidden" value="${childId}" />
      <label>Whole Group Activity<input name="wholeGroup" placeholder="Obstacle course" /></label>
      <label>Individual Support Activity<textarea name="support" rows="2" placeholder="Practice balancing on tape line for 5 minutes."></textarea></label>
      <label>Accommodation Notes<textarea name="notes" rows="2" placeholder="Modification or individualized learning opportunity"></textarea></label>
      <button class="primary-button" type="submit">Add Activity Support</button>
    </form>
  `;
}

function attendanceForm(childId) {
  return `
    <form id="attendanceForm" class="mini-form">
      <input name="childId" type="hidden" value="${childId}" />
      <label>Date<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Status<select name="status"><option>Present</option><option>Absent</option></select></label>
      <label>Drop-Off Time<input name="dropoff" type="time" /></label>
      <label>Pick-Up Time<input name="pickup" type="time" /></label>
      <button class="primary-button" type="submit">Save Attendance</button>
    </form>
  `;
}

function mealTrackingForm(childId) {
  return `
    <form id="mealTrackingForm" class="mini-form">
      <input name="childId" type="hidden" value="${childId}" />
      <label>Date<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Breakfast<input name="breakfast" placeholder="Ate most / refused / not served" /></label>
      <label>Lunch<input name="lunch" placeholder="Ate all lunch" /></label>
      <label>Snack<input name="snack" placeholder="Ate snack" /></label>
      <label>Food Notes<textarea name="notes" rows="2" placeholder="Food notes"></textarea></label>
      <label>Allergy Notes<textarea name="allergyNotes" rows="2" placeholder="Allergy notes"></textarea></label>
      <button class="primary-button" type="submit">Save Meals</button>
    </form>
  `;
}

function communicationForm(childId) {
  return `
    <form id="communicationForm" class="mini-form">
      <input name="childId" type="hidden" value="${childId}" />
      <label>Type<select name="type"><option>Parent Note</option><option>Incident Report</option><option>Daily Report</option><option>Progress Update</option><option>Newsletter</option></select></label>
      <label>Date<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Message<textarea name="message" rows="3" placeholder="Write the parent communication note here."></textarea></label>
      <button class="primary-button" type="submit">Save Communication</button>
    </form>
  `;
}

function observationItem(item) {
  return `
    <div class="compact-item">
      <div>
        <strong>${item.area} ¬∑ ${item.date}</strong>
        <span>${item.text}</span>
        ${item.nextSteps ? `<span>Next: ${item.nextSteps}</span>` : ""}
      </div>
    </div>
  `;
}

function simpleRecordItem(item) {
  const title = item.title || item.type || item.area || item.status || item.date || "Record";
  const detail = item.summary || item.message || item.goal || item.activity || item.notes || item.text || item.support || `${item.date || ""} ${item.status || ""}`.trim();
  return `
    <div class="compact-item">
      <div>
        <strong>${title}</strong>
        <span>${detail || "Saved record"}</span>
      </div>
    </div>
  `;
}

function goalItem(item) {
  return `
    <div class="compact-item">
      <div>
        <strong>${item.area} ¬∑ ${item.progress}</strong>
        <span>${item.goal}${item.targetDate ? ` ¬∑ Target: ${item.targetDate}` : ""}</span>
      </div>
      ${item.progress !== "Complete" ? `<button class="ghost-button" data-complete-goal="${item.id}" type="button">Mark Complete</button>` : `<span class="tag">Complete</span>`}
    </div>
  `;
}

function appendChildRecord(key, record) {
  const items = childStore(key);
  saveChildStore(key, [...items, { id: `${key}-${Date.now()}`, createdAt: new Date().toISOString(), ...record }]);
  renderChildManagement();
}

function buildDailyReportFromChild(childId) {
  const records = childRecords();
  const child = records.children.find((item) => item.id === childId);
  if (!child) return;
  const today = new Date().toISOString().slice(0, 10);
  const attendance = records.attendance.filter((item) => item.childId === childId && item.date === today).slice(-1)[0];
  const meal = records.meals.filter((item) => item.childId === childId && item.date === today).slice(-1)[0];
  const observation = records.observations.filter((item) => item.childId === childId && item.date === today).slice(-1)[0];
  const report = `Daily Report for ${child.name}

Date: ${today}

Attendance
${attendance ? `${attendance.status}. Drop-off: ${attendance.dropoff || "not entered"}. Pick-up: ${attendance.pickup || "not entered"}.` : "Attendance was not entered yet."}

Meals
${meal ? `Breakfast: ${meal.breakfast || "not entered"}\nLunch: ${meal.lunch || "not entered"}\nSnack: ${meal.snack || "not entered"}\nFood Notes: ${meal.notes || "none"}\nAllergy Notes: ${meal.allergyNotes || child.allergies || "none"}` : "Meal tracking was not entered yet."}

Activities and Learning
${observation ? `${observation.text}\nDevelopmental Area: ${observation.area}\nNext Steps: ${observation.nextSteps || "Continue supporting this skill through play."}` : "Add an observation or activity note to personalize this section."}

Provider Note
${child.name} participated in daily routines and learning experiences. Please let me know if there is anything you would like me to watch for tomorrow.`;
  appendChildRecord("Reports", { childId, title: `Daily Report ¬∑ ${today}`, date: today, summary: report });
}

function exportChildPortfolio(childId) {
  const records = childRecords();
  const child = records.children.find((item) => item.id === childId);
  if (!child) return;
  const lines = [
    `Child Portfolio: ${child.name}`,
    "",
    `Age Group: ${child.ageGroup}`,
    `Date of Birth: ${child.dob || ""}`,
    `Enrollment Date: ${child.enrollmentDate || ""}`,
    `Parent/Guardian: ${child.parentInfo || ""}`,
    `Emergency Contacts: ${child.emergency || ""}`,
    `Allergies: ${child.allergies || ""}`,
    `Medical Notes: ${child.medical || ""}`,
    `Additional Notes: ${child.notes || ""}`,
    "",
    "Observations",
    ...records.observations.filter((item) => item.childId === childId).map((item) => `- ${item.date} ¬∑ ${item.area}: ${item.text} Next: ${item.nextSteps || ""}`),
    "",
    "Goals",
    ...records.goals.filter((item) => item.childId === childId).map((item) => `- ${item.area}: ${item.goal} ¬∑ ${item.progress} ¬∑ Target: ${item.targetDate || ""}`),
    "",
    "Support Plans",
    ...records.supportPlans.filter((item) => item.childId === childId).map((item) => `- ${item.area}: ${item.goal} ¬∑ ${item.activity} ¬∑ ${item.status}`),
    "",
    "Lesson Plan Differentiation",
    ...records.differentiations.filter((item) => item.childId === childId).map((item) => `- Whole Group: ${item.wholeGroup}. Individual Support: ${item.support}`),
    "",
    "Attendance",
    ...records.attendance.filter((item) => item.childId === childId).map((item) => `- ${item.date}: ${item.status}, drop-off ${item.dropoff || ""}, pick-up ${item.pickup || ""}`),
    "",
    "Meals",
    ...records.meals.filter((item) => item.childId === childId).map((item) => `- ${item.date}: Breakfast ${item.breakfast || ""}; Lunch ${item.lunch || ""}; Snack ${item.snack || ""}; Notes ${item.notes || ""}`),
    "",
    "Daily Reports",
    ...records.reports.filter((item) => item.childId === childId).map((item) => `- ${item.title}: ${item.summary}`),
    "",
    "Parent Communication",
    ...records.communications.filter((item) => item.childId === childId).map((item) => `- ${item.date} ¬∑ ${item.type}: ${item.message}`),
  ];
  downloadTextFile(`${child.name} Portfolio`, lines.join("\n"));
}

function preferences() {
  return readSavedJson("llhPreferences", {});
}

function preferenceLine() {
  const prefs = preferences();
  const parts = [
    prefs.programType || "home daycare",
    prefs.agesServed ? `serving ${prefs.agesServed}` : "serving mixed ages",
    prefs.standards ? `aligned with ${prefs.standards}` : "aligned with early learning guidelines",
    prefs.lessonStyle || "simple and low-prep",
  ];
  return parts.join(", ");
}

function renderSavedPreferences() {
  const target = document.querySelector("#savedPreferences");
  if (!target) return;
  const prefs = preferences();
  target.innerHTML = Object.keys(prefs).length
    ? `<p><strong>Saved:</strong> ${preferenceLine()}.</p>`
    : `<p>Save your daycare type, ages served, standards, and favorite formats so the AI can personalize future results.</p>`;
}

function generatedOutputs() {
  return readSavedJson("llhGeneratedOutputs", []);
}

function saveGeneratedOutputs(items) {
  localStorage.setItem("llhGeneratedOutputs", JSON.stringify(items.slice(0, 20)));
  saveCurrentAccountState();
  renderGeneratedHistory();
}

function currentGeneratedResult() {
  const title = document.querySelector("#outputTitle")?.textContent.trim() || "Generated Content";
  const text = document.querySelector("#generatorOutput")?.textContent.trim() || "";
  if (!text || text === "Fill out the form and generate a childcare-ready result.") return null;
  return {
    id: `ai-${Date.now()}`,
    title,
    toolId: document.querySelector("#activeGeneratorForm")?.dataset.generator || "",
    text,
    date: new Date().toLocaleDateString(),
  };
}

function categoryForGenerator(toolId) {
  const categoryMap = {
    lesson: "Lesson Plans",
    observation: "Observation Hub",
    activity: "Activity Center",
    menu: "Menu Center",
    form: "Forms Library",
    daily: "Forms Library",
    newsletter: "Forms Library",
    handbook: "Forms Library",
    contract: "Forms Library",
    assessment: "Observation Hub",
    progress: "Observation Hub",
    portfolio: "Observation Hub",
    curriculum: "Lesson Plans",
    behavior: "Observation Hub",
    learningStory: "Observation Hub",
    parentMessage: "Forms Library",
    schedule: "Forms Library",
    classroomSetup: "Forms Library",
    emergency: "Forms Library",
    substitute: "Lesson Plans",
    grant: "Forms Library",
  };
  return categoryMap[toolId] || "Forms Library";
}

function saveGeneratedResultToLibrary(result) {
  const toolId = result.toolId || document.querySelector("#activeGeneratorForm")?.dataset.generator || "";
  const resource = {
    id: `ai-library-${Date.now()}`,
    category: categoryForGenerator(toolId),
    title: result.title,
    age: "All Ages",
    plan: "Pro",
    month: "AI Saved",
    tags: ["AI Generated", result.title, toolId].filter(Boolean),
    format: "Editable Text",
    description: result.text.slice(0, 180),
    fileName: `${slug(result.title || "ai-generated-resource")}.txt`,
    fileData: `data:text/plain;charset=utf-8,${encodeURIComponent(result.text)}`,
  };
  saveUploadedResources([resource, ...uploadedResources()]);
  resources = loadResources();
  renderAdminDashboard();
  return resource;
}

function printGeneratedResult(result) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(result.title)}</title>
        <style>body{font-family:Arial,sans-serif;line-height:1.5;padding:32px;color:#222;} pre{white-space:pre-wrap;font-family:inherit;}</style>
      </head>
      <body>
        <h1>${escapeHtml(result.title)}</h1>
        <pre>${escapeHtml(result.text)}</pre>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function renderGeneratedHistory() {
  const target = document.querySelector("#generatedHistory");
  if (!target) return;
  const items = generatedOutputs();
  target.innerHTML = items.length
    ? items.map((item) => `
      <div class="compact-item generated-item">
        <div>
          <strong>${item.title}</strong>
          <span>${item.date} ¬∑ ${item.text.slice(0, 92)}${item.text.length > 92 ? "..." : ""}</span>
        </div>
        <button class="ghost-button" data-load-output="${item.id}" type="button">Open</button>
      </div>
    `).join("")
    : `<div class="empty-state">Generated AI results you save will show up here for quick reuse.</div>`;
}

function downloadTextFile(title, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "little-learner-ai-output"}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function uploadedResources() {
  return readSavedJson("llhUploadedResources", []);
}

function saveUploadedResources(items) {
  localStorage.setItem("llhUploadedResources", JSON.stringify(items));
  resources = loadResources();
}

function supportTickets() {
  return readSavedJson("llhSupportTickets", []);
}

function saveSupportTickets(items) {
  localStorage.setItem("llhSupportTickets", JSON.stringify(items));
}

function mergeSupportTickets(remoteTickets = []) {
  const merged = [...remoteTickets, ...supportTickets()];
  const seen = new Set();
  const unique = merged.filter((ticket) => {
    if (!ticket?.id || seen.has(ticket.id)) return false;
    seen.add(ticket.id);
    return true;
  });
  saveSupportTickets(unique.slice(0, 100));
  return unique;
}

async function loadSupportTicketsFromBackend({ admin = false } = {}) {
  if (!canUseLaunchBackend()) return supportTickets();
  const params = new URLSearchParams();
  if (admin && adminSession()?.token) {
    params.set("adminToken", adminSession().token);
  } else if (currentUser) {
    params.set("email", currentUser);
  } else {
    return supportTickets();
  }
  try {
    const response = await fetch(`/api/support-tickets?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Could not load support tickets.");
    return mergeSupportTickets(data.tickets || []);
  } catch (error) {
    console.warn("Support ticket sync failed", error);
    return supportTickets();
  }
}

function ticketStatusClass(status) {
  return `ticket-status-${String(status || "New").toLowerCase().replace(/\s+/g, "-")}`;
}

function supportFormMessage(form) {
  let message = form.querySelector(".form-message");
  if (!message) {
    message = document.createElement("span");
    message.className = "form-message";
    form.appendChild(message);
  }
  return message;
}

async function submitSupportTicket(form) {
  const data = collectFormData(form);
  const messageTarget = supportFormMessage(form);
  setFormMessage(messageTarget, "Submitting...", true);
  let ticket = {
    id: `ticket-${Date.now()}`,
    kind: form.dataset.ticketKind || "Support Request",
    name: data.name || "Provider",
    email: data.email || currentUser || "",
    createdBy: currentUser || data.email || "",
    topic: data.topic || "General Questions",
    message: data.message || "",
    status: "New",
    reply: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let submitMessage = "Submitted and saved.";
  if (canUseLaunchBackend()) {
    try {
      const response = await fetch("/api/support-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...ticket,
          sourceUrl: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Could not submit support ticket.");
      ticket = result.ticket || ticket;
      if (result.emailNotification?.sent) {
        submitMessage = "Submitted. An email notification was sent to support.";
      } else if (result.emailNotification?.configured) {
        submitMessage = "Submitted and saved in Admin. The email notification did not send, so support should check Admin tickets.";
      } else {
        submitMessage = "Submitted and saved in Admin. Email notifications still need an email provider key.";
      }
    } catch (error) {
      console.warn("Support ticket backend submit failed", error);
      submitMessage = "Saved in this browser. If this is urgent, please also email support.";
    }
  } else {
    submitMessage = "Saved in this browser. Connect the backend to save tickets in Admin.";
  }
  saveSupportTickets([ticket, ...supportTickets()]);
  form.reset();
  setFormMessage(messageTarget, submitMessage, true);
  renderContactPage();
  renderAdminTickets();
}

async function renderContactPage() {
  const target = document.querySelector("#userTicketList");
  if (!target) return;
  await loadSupportTicketsFromBackend();
  const currentEmail = currentUser || "";
  const tickets = supportTickets()
    .filter((ticket) => !currentEmail || ticket.email === currentEmail || ticket.createdBy === currentEmail)
    .slice(0, 8);
  target.innerHTML = tickets.length ? tickets.map(ticketCard).join("") : `<div class="empty-state">No support tickets submitted yet.</div>`;
}

function ticketCard(ticket, admin = false) {
  return `
    <article class="ticket-card">
      <div class="ticket-card-header">
        <div>
          <p class="eyebrow">${escapeHtml(ticket.kind)}</p>
          <h3>${escapeHtml(ticket.topic)}</h3>
          <p>${escapeHtml(ticket.name)} ¬∑ ${escapeHtml(ticket.email || "No email")}</p>
        </div>
        <span class="ticket-status ${ticketStatusClass(ticket.status)}">${escapeHtml(ticket.status)}</span>
      </div>
      <p>${escapeHtml(ticket.message)}</p>
      ${ticket.reply ? `<div class="ticket-reply"><strong>Admin Reply</strong><p>${escapeHtml(ticket.reply)}</p></div>` : ""}
      <small>Submitted ${new Date(ticket.createdAt).toLocaleString()}</small>
      ${admin ? adminTicketActions(ticket) : ""}
    </article>
  `;
}

function adminTicketActions(ticket) {
  return `
    <div class="ticket-admin-actions">
      <label>Status
        <select data-ticket-status="${ticket.id}">
          ${["New", "In Progress", "Complete"].map((status) => `<option ${ticket.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </label>
      <label>Reply
        <textarea data-ticket-reply="${ticket.id}" rows="2" placeholder="Write a support reply">${escapeHtml(ticket.reply || "")}</textarea>
      </label>
      <div class="table-actions">
        <button class="ghost-button" data-save-ticket-reply="${ticket.id}" type="button">Reply</button>
        <button class="primary-button" data-complete-ticket="${ticket.id}" type="button">Mark Complete</button>
      </div>
    </div>
  `;
}

async function renderAdminTickets() {
  const target = document.querySelector("#adminTicketList");
  if (!target) return;
  await loadSupportTicketsFromBackend({ admin: isAdminUnlocked() });
  const filter = document.querySelector("#ticketStatusFilter")?.value || "All Statuses";
  const tickets = supportTickets().filter((ticket) => filter === "All Statuses" || ticket.status === filter);
  target.innerHTML = tickets.length ? tickets.map((ticket) => ticketCard(ticket, true)).join("") : `<div class="empty-state">No support tickets match this status.</div>`;
}

async function updateTicket(id, updates) {
  if (canUseLaunchBackend() && isAdminUnlocked() && adminSession()?.token) {
    try {
      const response = await fetch("/api/support-ticket-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, adminToken: adminSession().token, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Could not update support ticket.");
      if (result.ticket) {
        mergeSupportTickets([result.ticket]);
      }
    } catch (error) {
      console.warn("Support ticket backend update failed", error);
    }
  }
  const updated = supportTickets().map((ticket) => ticket.id === id ? { ...ticket, ...updates, updatedAt: new Date().toISOString() } : ticket);
  saveSupportTickets(updated);
  renderContactPage();
  renderAdminTickets();
}

function isAdminUnlocked() {
  return localStorage.getItem("llhAdminUnlocked") === "true";
}

function adminPreviewMode() {
  if (!isAdminUnlocked()) return "";
  return localStorage.getItem("llhAdminPreviewMode") || "Admin";
}

function hasAdminFullAccess() {
  return isAdminUnlocked() && adminPreviewMode() === "Admin";
}

function effectiveAccessPlan() {
  const preview = adminPreviewMode();
  if (["Free", "Pro", "Founding"].includes(preview)) return preview;
  if (hasAdminFullAccess()) return "Founding";
  return currentPlan;
}

function adminSession() {
  return readSavedJson("llhAdminSession", null);
}

function isLocalPreview() {
  return window.location.protocol === "file:" || ["4173", "4179"].includes(window.location.port);
}

function setAdminSession(sessionDetail) {
  const session = {
    email: sessionDetail?.email || adminOwnerAccount.email,
    name: sessionDetail?.name || adminOwnerAccount.name,
    token: sessionDetail?.token || "",
    mode: sessionDetail?.mode || "server",
    loggedInAt: new Date().toISOString(),
  };
  localStorage.setItem("llhAdminSession", JSON.stringify(session));
  localStorage.setItem("llhAdminUnlocked", "true");
  return session;
}

function clearAdminSession() {
  localStorage.removeItem("llhAdminSession");
  localStorage.removeItem("llhAdminUnlocked");
  localStorage.removeItem("llhAdminPreviewMode");
}

function canUseSignedInOwnerAdmin() {
  const host = window.location.hostname;
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  return localHost && currentUser && currentUser.toLowerCase() === adminOwnerAccount.email.toLowerCase();
}

async function adminLogin(email, password, code) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (adminOwnerAccount.loginEndpoint && canUseStripeBackend()) {
    const response = await fetch(adminOwnerAccount.loginEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password, code }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Admin login failed.");
    return data;
  }
  if (isLocalPreview() && cleanEmail === adminOwnerAccount.email.toLowerCase() && password && code) {
    return {
      email: cleanEmail,
      name: adminOwnerAccount.name,
      token: "local-preview-admin",
      mode: "local-preview",
    };
  }
  throw new Error("Admin login requires the secure backend server. Start the Stripe/Firebase backend or use localhost preview.");
}

function allAccountsList() {
  return Object.values(accounts());
}

function adminMetric(label, value, detail = "") {
  return `
    <div>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </div>
  `;
}

function renderAdminOwnerOverview() {
  const target = document.querySelector("#adminOwnerOverview");
  if (!target || !isAdminUnlocked()) return;
  const accountRows = allAccountsList();
  const paidAccounts = accountRows.filter((account) => ["Pro", "Founding"].includes(account.plan));
  const foundingAccounts = accountRows.filter((account) => account.foundingMember);
  const ticketRows = supportTickets();
  const openTickets = ticketRows.filter((ticket) => ticket.status !== "Complete");
  const leadRows = leads();
  const events = analyticsEvents();
  const downloads = readSavedJson("llhDownloads", []);
  const aiUseTotal = Object.keys(localStorage)
    .filter((key) => key.startsWith("llhAiUsage-"))
    .reduce((total, key) => total + Number(localStorage.getItem(key) || 0), 0);
  const billingEvents = accountRows.flatMap((account) => (account.billingHistory || []).map((item) => ({ ...item, email: account.email })));
  const recentAccounts = accountRows
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, 6);
  const recentEvents = events.slice(0, 6);
  target.innerHTML = `
    <div class="admin-owner-header">
      <div>
        <p class="eyebrow">Owner Login</p>
        <h3>${escapeHtml(adminSession()?.name || adminOwnerAccount.name)}'s private command center</h3>
        <p>Signed in as ${escapeHtml(adminSession()?.email || adminOwnerAccount.email)}. Admin access unlocks every resource and tool unless Preview Mode is selected.</p>
      </div>
      <button class="ghost-button" type="button" id="adminLockButton">Lock Admin</button>
    </div>
    <div class="admin-preview-panel">
      <div>
        <p class="eyebrow">Preview Mode</p>
        <strong>Currently viewing as ${escapeHtml(adminPreviewMode())}</strong>
        <span>Use this to test Free, Pro, and Founding access while keeping Admin controls available.</span>
      </div>
      <div class="account-actions-row">
        ${["Admin", "Free", "Pro", "Founding"].map((mode) => `
          <button class="${adminPreviewMode() === mode ? "primary-button" : "ghost-button"}" data-admin-preview="${mode}" type="button">${mode}</button>
        `).join("")}
      </div>
    </div>
    <div class="admin-owner-grid">
      ${adminMetric("total accounts", accountRows.length)}
      ${adminMetric("paid accounts", paidAccounts.length)}
      ${adminMetric("founding members", foundingAccounts.length, `${foundingSpotsRemaining()} spots left`)}
      ${adminMetric("open support tickets", openTickets.length)}
      ${adminMetric("lead signups", leadRows.length)}
      ${adminMetric("viewed resources", downloads.length)}
      ${adminMetric("AI generations tracked", aiUseTotal)}
      ${adminMetric("billing events", billingEvents.length)}
    </div>
    <div class="admin-owner-lists">
      <article class="analytics-card">
        <h4>Recent Accounts</h4>
        ${recentAccounts.length ? recentAccounts.map((account) => `
          <div class="analytics-row stacked">
            <span>${escapeHtml(account.email)}</span>
            <strong>${escapeHtml(account.plan || "Free")}</strong>
            <small>${escapeHtml(account.subscriptionStatus || "Free Plan")} ¬∑ ${escapeHtml(account.monthlyPrice || "$0")}</small>
          </div>
        `).join("") : `<div class="empty-state">No accounts yet.</div>`}
      </article>
      <article class="analytics-card">
        <h4>Recent Activity</h4>
        ${recentEvents.length ? recentEvents.map((event) => `
          <div class="analytics-row stacked">
            <span>${escapeHtml(event.name)}</span>
            <strong>${escapeHtml(event.detail?.view || event.detail?.type || event.detail?.plan || "activity")}</strong>
            <small>${new Date(event.createdAt).toLocaleString()}</small>
          </div>
        `).join("") : `<div class="empty-state">No activity tracked yet.</div>`}
      </article>
    </div>
  `;
}

function renderAdminAccessShell() {
  const lockPanel = document.querySelector("#adminLockPanel");
  const protectedContent = document.querySelector("#adminProtectedContent");
  if (!lockPanel || !protectedContent) return true;
  if (!isAdminUnlocked()) {
    protectedContent.hidden = true;
    lockPanel.hidden = false;
    lockPanel.innerHTML = `
      <div class="admin-lock-content">
        <div>
          <p class="eyebrow">Private Owner Area</p>
          <h3>Admin dashboard is protected</h3>
          <p>Log in as the owner to view accounts, uploads, support tickets, AI usage, billing activity, leads, and private website analytics.</p>
        </div>
        <form id="adminUnlockForm" class="admin-unlock-form">
          <label>
            Owner Email
            <input name="adminEmail" type="email" required placeholder="little.learners.hub.customer@gmail.com" autocomplete="username" />
          </label>
          <label>
            Owner Password
            <input name="adminPassword" type="password" required placeholder="Owner password" autocomplete="current-password" />
          </label>
          <label>
            Admin Access Code
            <input name="adminCode" type="password" required placeholder="Enter owner code" autocomplete="off" />
          </label>
          <button class="primary-button" type="submit">Unlock Admin</button>
          <p class="form-note">Admin credentials are checked by the backend server. Localhost preview allows testing only on this computer.</p>
          <span id="adminUnlockMessage" class="form-message"></span>
        </form>
        ${canUseSignedInOwnerAdmin() ? `
          <div class="admin-local-owner">
            <p class="form-note">You are signed in as the owner on localhost.</p>
            <button class="ghost-button" type="button" id="localOwnerAdminUnlock">Unlock with signed-in owner account</button>
          </div>
        ` : ""}
      </div>
    `;
    return false;
  }
  protectedContent.hidden = false;
  lockPanel.hidden = false;
  lockPanel.innerHTML = `
    <div class="admin-unlocked-bar">
      <div>
        <p class="eyebrow">Private Owner Area</p>
        <strong>Admin dashboard unlocked for ${escapeHtml(adminSession()?.email || adminOwnerAccount.email)}</strong>
        <span>Accounts, analytics, leads, tickets, billing activity, AI usage, and uploads are visible in this private area.</span>
      </div>
      <button class="ghost-button" type="button" id="adminLockButton">Lock Admin</button>
    </div>
  `;
  return true;
}

function eventCount(name) {
  return analyticsEvents().filter((event) => event.name === name).length;
}

function groupCounts(items, getter) {
  return items.reduce((counts, item) => {
    const key = getter(item) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function countListHtml(counts, emptyText = "No data yet.") {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty-state">${emptyText}</div>`;
  return entries.map(([label, count]) => `
    <div class="analytics-row">
      <span>${escapeHtml(label)}</span>
      <strong>${count}</strong>
    </div>
  `).join("");
}

function renderAdminAnalytics() {
  const target = document.querySelector("#adminAnalyticsApp");
  if (!target || !isAdminUnlocked()) return;
  const events = analyticsEvents();
  const leadRows = leads();
  const checkoutSuccesses = events.filter((event) => event.name === "checkout_success");
  const pageViews = events.filter((event) => event.name === "page_view");
  const adVisits = events.filter((event) => event.name === "ad_route_visit");
  const signupClicks = eventCount("signup_click");
  const checkoutStarts = eventCount("checkout_start");
  const paidConversions = checkoutSuccesses.length;
  const conversionRate = checkoutStarts ? Math.round((paidConversions / checkoutStarts) * 100) : 0;
  const pageCounts = groupCounts(pageViews, (event) => event.detail?.view || event.path || event.hash);
  const adCounts = groupCounts(adVisits, (event) => event.detail?.route || event.attribution?.route || "Direct / Home");
  const leadCounts = groupCounts(leadRows, (lead) => lead.source || lead.attribution?.route || "Free Daycare Starter Pack");
  target.innerHTML = `
    <div class="analytics-summary-grid">
      <div><strong>${pageViews.length}</strong><span>page views tracked</span></div>
      <div><strong>${signupClicks}</strong><span>signup clicks</span></div>
      <div><strong>${checkoutStarts}</strong><span>checkout starts</span></div>
      <div><strong>${paidConversions}</strong><span>paid conversions</span></div>
      <div><strong>${conversionRate}%</strong><span>checkout conversion</span></div>
      <div><strong>${leadRows.length}</strong><span>lead magnet signups</span></div>
    </div>
    <div class="analytics-grid">
      <article class="analytics-card">
        <h4>Top Pages</h4>
        ${countListHtml(pageCounts, "No page views tracked yet.")}
      </article>
      <article class="analytics-card">
        <h4>Ad Routes</h4>
        ${countListHtml(adCounts, "No ad route visits tracked yet.")}
      </article>
      <article class="analytics-card">
        <h4>Lead Sources</h4>
        ${countListHtml(leadCounts, "No leads captured yet.")}
      </article>
      <article class="analytics-card">
        <h4>Buyer Attribution</h4>
        ${checkoutSuccesses.length ? checkoutSuccesses.slice(0, 8).map((event) => `
          <div class="analytics-row stacked">
            <span>${escapeHtml(event.user || "Guest checkout")}</span>
            <strong>${escapeHtml(event.detail?.plan || "Pro")}</strong>
            <small>${escapeHtml(event.detail?.attribution?.route || event.attribution?.route || "Direct / Home")} ¬∑ ${new Date(event.createdAt).toLocaleDateString()}</small>
          </div>
        `).join("") : `<div class="empty-state">Paid conversions will appear here after checkout success.</div>`}
      </article>
    </div>
    <p class="muted-copy">Private analytics are stored locally in this website demo. Production launch should move this data to a secure backend with owner-only access.</p>
  `;
}

function readinessItem(label, status, detail) {
  const statusClass = status === "Ready" ? "ready" : status === "Local Ready" ? "local" : "needed";
  return `
    <article class="readiness-item ${statusClass}">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <em>${escapeHtml(status)}</em>
    </article>
  `;
}

function renderLaunchReadiness() {
  const target = document.querySelector("#launchReadinessApp");
  if (!target || !isAdminUnlocked()) return;
  const hasStripeCheckout = Boolean(stripeCheckoutConfig.checkoutEndpoint);
  const hasStripePortal = Boolean(stripeCheckoutConfig.customerPortalEndpoint);
  const checklist = [
    ["Public homepage", "Ready", "Sales homepage, founding offer, samples, lead magnet, trust copy, and Pro preview are in place."],
    ["Resource library", "Local Ready", `${resources.length} local resources are available with Free/Pro locking and in-app viewing.`],
    ["AI generator suite", "Local Ready", `${aiTools.length} AI generators are available with edit, copy, save, download, print, regenerate, and save-to-library actions.`],
    ["Free vs Pro permissions", "Local Ready", "Limits, locked content, Pro prompts, and AI generation limits are enforced locally."],
    ["Private Admin", "Local Ready", "Admin, support tickets, content uploads, analytics, and launch checklist are protected by owner email, password, and access code on this device."],
    ["Analytics", "Local Ready", "Page views, signup clicks, checkout starts, conversions, lead captures, and ad routes are tracked locally."],
    ["Legal pages", "Draft Ready", "Privacy, terms, refund/cancellation, and child data notes are drafted. Final legal review is recommended before launch."],
    ["Launch backend", "Configured", "A no-install Node backend now handles Stripe Checkout, Stripe webhooks, admin login, subscription status, AI usage caps, and server-side AI calls."],
    ["Durable cloud database", "Needed", "The launch backend stores data in a local JSON file for testing. Before paid launch, move accounts, child data, AI content, support tickets, analytics, and billing status to secure cloud storage."],
    ["Stripe Checkout", hasStripeCheckout ? "Configured" : "Needed", hasStripeCheckout ? "Checkout endpoint path is configured. Add live Stripe keys and price IDs before launch." : "Needs a server endpoint that creates Stripe Checkout Sessions."],
    ["Stripe Customer Portal", hasStripePortal ? "Configured" : "Needed", hasStripePortal ? "Customer Portal endpoint path is configured. Add live Stripe keys before launch." : "Needs a server endpoint for users to manage billing and payment methods."],
    ["Stripe webhooks", "Configured", "Server webhook endpoint was added for checkout success, subscription changes, cancellations, and failed payments. Add STRIPE_WEBHOOK_SECRET before launch."],
    ["Email delivery", "Needed", "Needs welcome emails, password reset, starter pack delivery, support confirmations, and billing notices."],
    ["Public hosting/domain", "Needed", "Needs a live HTTPS domain before running ads."],
    ["Apple app path", "Later", "After the website is live and stable, package as PWA/mobile app and plan Apple-compliant subscriptions."],
  ];
  target.innerHTML = `
    <div class="readiness-summary">
      <div><strong>${checklist.filter((item) => item[1] === "Ready" || item[1] === "Local Ready" || item[1] === "Draft Ready" || item[1] === "Configured").length}</strong><span>items built or locally ready</span></div>
      <div><strong>${checklist.filter((item) => item[1] === "Needed").length}</strong><span>production items still needed</span></div>
      <div><strong>${foundingSpotsRemaining()}</strong><span>founding spots shown as left</span></div>
    </div>
    <div class="readiness-list">
      ${checklist.map((item) => readinessItem(item[0], item[1], item[2])).join("")}
    </div>
    <div class="next-build-order">
      <p class="eyebrow">Recommended Build Order</p>
      <ol>
        <li>Secure backend accounts and database</li>
        <li>Real Stripe Checkout, Customer Portal, and webhooks</li>
        <li>Email delivery for starter pack, account, support, and billing messages</li>
        <li>Production hosting with domain and HTTPS</li>
        <li>Final QA, then ads to the Free Daycare Starter Pack</li>
      </ol>
    </div>
  `;
}

function renderAdminDashboard() {
  if (!renderAdminAccessShell()) return;
  const table = document.querySelector("#adminContentTable");
  const summary = document.querySelector("#adminSummary");
  if (!table || !summary) return;
  const query = (document.querySelector("#adminSearchInput")?.value || "").trim().toLowerCase();
  const category = document.querySelector("#adminCategoryFilter")?.value || "All Categories";
  const uploads = uploadedResources();
  const filtered = uploads.filter((item) => {
    const matchesCategory = category === "All Categories" || item.category === category;
    const haystack = [item.title, item.category, item.age, item.plan, item.description, ...(item.tags || [])].join(" ").toLowerCase();
    return matchesCategory && haystack.includes(query);
  });
  const categoryCounts = ["Lesson Plans", "Observation Hub", "Forms Library", "Activity Center", "Menu Center", "Printables"]
    .map((name) => `<span>${name}: <strong>${uploads.filter((item) => item.category === name).length}</strong></span>`)
    .join("");
  summary.innerHTML = `
    <div><strong>${uploads.length}</strong><span>uploaded resources</span></div>
    <div><strong>${filtered.length}</strong><span>showing now</span></div>
    <div class="admin-category-counts">${categoryCounts}</div>
  `;
  table.innerHTML = filtered.length ? filtered.map(adminRow).join("") : `
    <tr>
      <td colspan="6">
        <div class="empty-state">No uploaded content yet. Add your first lesson plan, observation, form, activity, menu, or printable.</div>
      </td>
    </tr>
  `;
  renderAdminOwnerOverview();
  renderAdminAnalytics();
  renderLaunchReadiness();
  renderAdminTickets();
}

function adminRow(item) {
  return `
    <tr>
      <td>
        <strong>${item.title}</strong>
        <span>${item.description || "No description yet."}</span>
        <small>${(item.tags || []).join(", ") || "No tags"}</small>
      </td>
      <td>${item.category}</td>
      <td>${item.age}</td>
      <td><span class="tag access-tag">${item.plan}</span></td>
      <td>
        ${item.previewData ? `<img class="admin-thumb" src="${item.previewData}" alt="${item.title} preview" />` : ""}
        <span>${item.fileName || "No file"}</span>
        <small>${item.previewName ? `Preview: ${item.previewName}` : "No preview image"}</small>
      </td>
      <td>
        <div class="table-actions">
          <button class="ghost-button" data-admin-edit="${item.id}">Edit</button>
          <button class="danger-button" data-admin-delete="${item.id}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function resetAdminForm() {
  const form = document.querySelector("#uploadForm");
  if (!form) return;
  form.reset();
  form.querySelector('[name="id"]').value = "";
  document.querySelector("#adminSubmitButton").textContent = "Add Content";
  document.querySelector("#adminCancelEdit").style.display = "none";
}

function fillAdminForm(id) {
  const item = uploadedResources().find((resource) => resource.id === id);
  const form = document.querySelector("#uploadForm");
  if (!item || !form) return;
  form.querySelector('[name="id"]').value = item.id;
  form.querySelector('[name="title"]').value = item.title;
  form.querySelector('[name="age"]').value = item.age;
  form.querySelector('[name="category"]').value = item.category;
  form.querySelector('[name="plan"]').value = item.plan;
  form.querySelector('[name="tags"]').value = (item.tags || []).filter((tag) => tag !== "Uploaded").join(", ");
  form.querySelector('[name="description"]').value = item.description || "";
  document.querySelector("#adminSubmitButton").textContent = "Save Changes";
  document.querySelector("#adminCancelEdit").style.display = "inline-flex";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteAdminResource(id) {
  const uploads = uploadedResources();
  saveUploadedResources(uploads.filter((item) => item.id !== id));
  favorites = favorites.filter((favorite) => favorite !== id);
  saveFavorites();
  renderAdminDashboard();
}

function addDemoAdminResource() {
  const previewSvg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="#fffaf1"/>
      <rect x="42" y="42" width="516" height="316" rx="18" fill="#f6dcd8" stroke="#e4cfb3" stroke-width="8"/>
      <text x="300" y="168" text-anchor="middle" font-family="Arial" font-size="42" font-weight="700" fill="#386062">Demo Preview</text>
      <text x="300" y="224" text-anchor="middle" font-family="Arial" font-size="28" fill="#746b63">Toddler Farm Lesson</text>
    </svg>
  `);
  const demo = {
    id: `upload-demo-${Date.now()}`,
    category: "Lesson Plans",
    title: "Demo Toddler Farm Lesson Plan",
    age: "Toddler",
    plan: "Free",
    month: "June",
    tags: ["Uploaded", "Farm", "Toddler", "Demo"],
    format: "Demo File",
    fileName: "demo-toddler-farm-lesson.txt",
    fileData: `data:text/plain;charset=utf-8,${encodeURIComponent("Demo Toddler Farm Lesson Plan\\n\\nThis is a sample uploaded resource from the admin dashboard.")}`,
    previewName: "demo-preview.svg",
    previewData: `data:image/svg+xml;charset=utf-8,${previewSvg}`,
    description: "Sample uploaded resource used to test the admin dashboard workflow.",
  };
  saveUploadedResources([...uploadedResources(), demo]);
  renderAdminDashboard();
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file || !file.name) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function collectFormData(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = String(value).trim();
  });
  return data;
}

function generateToolOutput(toolId, data) {
  const generators = {
    lesson: generateLessonPlan,
    observation: generateObservation,
    newsletter: generateNewsletter,
    daily: generateDailyReport,
    handbook: generateHandbook,
    contract: generateContract,
    activity: generateActivity,
    menu: generateAiMenu,
    form: generateDaycareForm,
    assessment: generateAssessment,
    progress: generateProgressReport,
    portfolio: generatePortfolio,
    curriculum: generateCurriculumUnit,
    behavior: generateBehaviorDocumentation,
    learningStory: generateLearningStory,
    parentMessage: generateParentMessage,
    schedule: generateAiDailySchedule,
    classroomSetup: generateClassroomSetup,
    emergency: generateEmergencyPlan,
    substitute: generateSubstitutePlan,
    grant: generateGrantLetter,
  };
  return (generators[toolId] || generateLessonPlan)(data);
}

function aiPromptFromForm(toolId, data) {
  const tool = [...aiTools, ...futureTools].find((item) => item.id === toolId);
  const fields = Object.entries(data)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return [
    `Create content for ${tool?.title || "Little Learner Hub AI Generator"}.`,
    "Use daycare-focused, age-appropriate wording for home daycare providers.",
    "Include practical sections, editable language, and clear next steps when helpful.",
    fields || "No extra details were entered.",
  ].join("\n");
}

async function generateToolOutputWithBackend(toolId, data) {
  if (!aiGenerationConfig.endpoint || !canUseLaunchBackend()) {
    return { output: generateToolOutput(toolId, data), backendUsed: false };
  }
  const response = await fetch(aiGenerationConfig.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: currentUser || "guest",
      plan: currentPlan,
      tool: toolId,
      age: data.age || data.ageGroup || data.group || "",
      prompt: aiPromptFromForm(toolId, data),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || "AI generation could not be completed.");
  }
  return {
    output: result.output || generateToolOutput(toolId, data),
    backendUsed: true,
    used: result.used,
    limit: result.limit,
  };
}

function cleanPromptTheme(prompt) {
  return String(prompt || "")
    .replace(/\b(create|make|write|generate|a|an|the|week|weekly|lesson|lessons|plan|plans|of|for)\b/gi, " ")
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function generateFromPrompt(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("observation") || lower.includes("stacking") || lower.includes("blocks")) {
    return generateObservation({ note: prompt, age: lower.includes("preschool") ? "Preschool" : "Toddler" });
  }
  if (lower.includes("newsletter")) {
    return generateNewsletter({ month: "This Month", theme: prompt, dates: "Add important dates here." });
  }
  if (lower.includes("daily report")) {
    return generateDailyReport({ child: "The child", meals: "Meals were offered according to the daily menu.", nap: "Rest time was supported.", highlights: prompt });
  }
  if (lower.includes("contract") || lower.includes("agreement")) {
    return generateContract({ program: "Your Daycare Name", tuition: "Tuition is due on the scheduled payment date.", schedule: "Care schedule should be listed here.", policies: "Add late fees, sick policy, vacation, and termination notice." });
  }
  if (lower.includes("menu")) {
    return generateMenu(prompt);
  }
  if (lower.includes("activity") || lower.includes("sensory") || lower.includes("art")) {
    return generateActivity({ age: lower.includes("infant") ? "Infant" : lower.includes("preschool") ? "Preschool" : "Toddler", theme: prompt, skill: lower.includes("sensory") ? "sensory" : "creative learning" });
  }
  if (lower.includes("handbook")) {
    return generateHandbook({ program: "Your Daycare Name", tuition: "Tuition is due on the scheduled payment date.", sick: "Children should stay home when ill.", pickup: "Authorized adults must sign children in and out." });
  }
  return generateLessonPlan({ age: lower.includes("infant") ? "Infant" : lower.includes("preschool") ? "Preschool" : "Toddler", theme: cleanPromptTheme(prompt) || "Farm", days: "5", focus: "language, social-emotional development, fine motor, and play-based learning" });
}

function generateLessonPlan(data) {
  const age = data.age || "Toddler";
  const theme = data.theme || "Farm";
  const planLength = data.planLength || "Weekly";
  const days = Number(data.days || 5);
  const focus = data.focus || "language, fine motor, social-emotional skills";
  const materials = data.materials || "pictures or props, books, crayons, paper, sensory bin items, blocks, music, and simple printable pages";
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Monday 2", "Tuesday 2", "Wednesday 2", "Thursday 2", "Friday 2"];
  const daily = dayNames.slice(0, days).map((day, index) => {
    const activities = ["Explore and Talk", "Create and Connect", "Move and Match", "Build and Sort", "Review and Share"];
    return `${day}: ${theme} ${activities[index % activities.length]}
- Circle Time: Introduce ${theme} vocabulary with pictures, props, and simple questions.
- Art: Offer a low-prep ${theme.toLowerCase()} art invitation using crayons, paper, glue, or safe collage pieces.
- Sensory: Provide a supervised sensory bin or texture tray connected to ${theme.toLowerCase()}.
- Fine Motor: Practice grasping, sorting, stacking, tracing, squeezing, or placing small safe materials.
- Gross Motor: Add movement such as crawling, marching, tossing, balancing, dancing, or animal walks.
- Learning Goal: Children will build ${focus} through hands-on play and guided conversation.`;
  }).join("\n\n");
  return `${planLength} Lesson Plan Overview
Age Group: ${age}
Theme: ${theme}
Learning Focus: ${focus}
Style: ${preferenceLine()}

Materials List
${materials}

Learning Objectives
- Build vocabulary connected to ${theme.toLowerCase()}.
- Practice ${focus}.
- Encourage social-emotional growth through choice-making, turn-taking, and participation.
- Support early learning guidelines through play-based, hands-on experiences.

Daily Plans
${daily}

Books and Songs
- Choose simple board books or picture books connected to ${theme.toLowerCase()}.
- Use repeat-after-me songs, fingerplays, movement songs, and name songs.

Optional Printables
Vocabulary cards, tracing page, matching page, coloring page, and family note.

Provider Note
Adjust timing, materials, and supervision to fit your group size, ages, and state childcare requirements.`;
}

function generateObservation(data) {
  const note = data.note || "Child counted to 10 and identified colors.";
  const age = data.age || "Toddler";
  const area = data.area || "Cognitive";
  const nextStep = data.nextStep || "Offer a similar activity with a small new challenge.";
  return `Professional Observation
During play, the ${age.toLowerCase()} demonstrated growing confidence and understanding while ${note.charAt(0).toLowerCase() + note.slice(1)} This shows the child is making meaningful connections through hands-on exploration, communication, and problem-solving.

Developmental Area
${area} development, with supporting connections to language, approaches to learning, and fine motor development when appropriate.

Skills Demonstrated
- Early problem-solving
- Vocabulary and concept development
- Attention and persistence
- Hand-eye coordination
- Confidence participating in learning experiences

What to Look For Next
Watch for the child repeating the skill independently, using more descriptive language, staying engaged longer, or applying the skill in a new activity.

Next Steps for Learning
${nextStep} Model new words, ask simple open-ended questions, and provide time for the child to practice at their own pace.

Learning Standard Category
Early learning guideline area: cognitive development, communication/language, approaches to learning, and fine motor skills.`;
}

function generateActivity(data) {
  const age = data.age || "Preschool";
  const theme = data.theme || "Ocean";
  const skill = data.skill || "fine motor";
  const materials = data.materials || "Tray or bin, themed pictures or props, child-safe manipulatives, tongs or scoops if age-appropriate, paper, crayons, and a small basket for sorting.";
  return `Activity Title
${theme} ${skill} Discovery Tray

Age Group
${age}

Materials
${materials}

Instructions
1. Introduce the ${theme.toLowerCase()} materials and name each item clearly.
2. Invite children to touch, sort, match, move, or describe the materials.
3. Model the target skill: ${skill}.
4. Keep the activity short, playful, and flexible.
5. Observe what children notice, say, choose, and try independently.

Learning Goals
- Build ${skill} through hands-on practice.
- Encourage language, attention, choice-making, and confidence.
- Support curiosity and problem-solving.

Extensions
Add books, songs, counting, color matching, movement, or a simple take-home note connected to ${theme.toLowerCase()}.`;
}

function generateAiMenu(data) {
  const age = data.age || "Mixed Ages";
  const menuLength = data.menuLength || "Weekly";
  const restrictions = data.restrictions || "Adjust for allergies, choking safety, and age-appropriate textures.";
  const preferences = data.preferences || "Simple CACFP-friendly meals with fruits, vegetables, whole grains, protein, and milk.";
  const week = generateMenu("").replace("Daycare Menu for Next Week", `${menuLength} Daycare Menu`);
  return `${menuLength} Daycare Menu

Age Group
${age}

CACFP-Friendly Planning Notes
- Include milk or an approved milk alternative when appropriate.
- Offer fruits, vegetables, whole grains, and protein across the day.
- Keep portions and textures age-appropriate.
- Follow family allergy plans and state/food program rules.

Preferences
${preferences}

Restrictions
${restrictions}

${week}`;
}

function generateDaycareForm(data) {
  const formType = data.formType || "Custom Form";
  const program = data.program || "Your Daycare Name";
  const purpose = data.purpose || "Collect parent permission, required details, and signatures.";
  const fieldsNeeded = data.fieldsNeeded || "Child name, parent name, date, signature, notes";
  return `${formType}

Program
${program}

Purpose
${purpose}

Provider Instructions
Review this form, customize it for your program, and confirm any state licensing or parent notification requirements before use.

Required Information
${fieldsNeeded.split(",").map((field) => `- ${field.trim()}: ______________________________`).join("\n")}

Details / Notes
__________________________________________________________________
__________________________________________________________________
__________________________________________________________________

Parent/Guardian Acknowledgment
I understand the information above and give permission where applicable.

Parent/Guardian Signature: ______________________________ Date: ____________
Provider Signature: ______________________________ Date: ____________`;
}

function generateAssessment(data) {
  const child = data.child || "Child";
  const age = data.age || "Preschool";
  const domains = data.domains || "Language, social emotional, fine motor, cognitive";
  const evidence = data.evidence || "Recent observation notes and activity examples.";
  return `Developmental Assessment Draft

Child
${child}

Age Group
${age}

Domains Reviewed
${domains}

Observation Evidence
${evidence}

Strengths
- Shows growing confidence during familiar routines.
- Participates in play-based learning experiences.
- Uses emerging skills with support, modeling, and repetition.

Current Development Notes
The child is demonstrating progress across the listed domains. Continued observation should focus on independence, communication, engagement, and use of skills in multiple settings.

Learning Goals
- Offer repeated practice through play and routines.
- Model language connected to the child's actions.
- Provide small challenges that match the child's current ability.

Next Steps
Share this draft with families as appropriate and adjust wording to match your program documentation style and state requirements.`;
}

function generateProgressReport(data) {
  return `Child Progress Report

Child
${data.child || "Child"}

Report Period
${data.period || "Current Period"}

Strengths
${data.strengths || "The child is showing growth in play, routines, communication, and independence."}

Areas of Growth
- Participates in daily routines with increasing confidence.
- Engages with materials, peers, and adults during learning experiences.
- Practices age-appropriate self-help and communication skills.

Next Goals
${data.goals || "Continue supporting language, social-emotional growth, fine motor skills, and independence."}

Family Connection
Families can support progress by reading together, naming feelings, encouraging simple choices, and practicing everyday routines at home.`;
}

function generatePortfolio(data) {
  return `Child Portfolio Entry

Child
${data.child || "Child"} ¬∑ ${data.age || "Age not listed"}

Learning Snapshot
${data.observations || "Add observations, learning moments, photos notes, or milestones here."}

Skills Highlighted
- Communication and language
- Social-emotional growth
- Fine motor and hands-on exploration
- Cognitive problem-solving

Goals
${data.goals || "Continue supporting confidence, independence, and age-appropriate learning goals."}

Provider Reflection
This portfolio entry shows meaningful growth through play, routine participation, and child-led exploration.

Next Step
Offer related activities and save future observations to continue building the child's portfolio.`;
}

function generateCurriculumUnit(data) {
  const age = data.age || "Preschool";
  const theme = data.theme || "Community Helpers";
  const length = data.length || "1 Month";
  const goals = data.goals || "language, social emotional, math, science";
  return `Themed Curriculum Unit

Age Group
${age}

Theme
${theme}

Length
${length}

Learning Goals
${goals}

Unit Overview
Children will explore ${theme.toLowerCase()} through books, songs, sensory play, art, dramatic play, movement, math, science, and outdoor experiences.

Weekly Focus Ideas
- Week 1: Introduce vocabulary and real-life connections.
- Week 2: Add hands-on centers, props, and small group activities.
- Week 3: Extend learning through art, STEM, stories, and pretend play.
- Week 4: Review, document observations, and share family connections.

Materials
Books, picture cards, props, art supplies, sensory materials, blocks, dramatic play items, music, and printable pages.

Family Connection
Send home a short note with vocabulary words, book ideas, and one simple activity families can try at home.`;
}

function generateBehaviorDocumentation(data) {
  return `Behavior Documentation Draft

What Happened
${data.incident || "Describe the behavior or incident factually."}

Support Given
${data.support || "Comfort was offered, safety was maintained, and the child was redirected using calm guidance."}

Professional Observation
The child needed support with regulation, communication, or peer interaction during this moment. Documentation should remain factual, respectful, and focused on support.

Follow-Up Plan
${data.plan || "Teach replacement language, offer visual reminders, provide close supervision, and practice the skill during calm moments."}

Parent Communication Wording
${data.tone || "Warm and professional"}: Today we supported your child through a challenging moment. We used calm guidance, helped everyone stay safe, and will continue practicing the skills needed for successful play and routines.

Provider Note
Review program policy and licensing requirements for incident reports, injury documentation, and parent notification.`;
}

function generateLearningStory(data) {
  return `Learning Story

Child
${data.child || "Child"}

What Happened
${data.observation || "Add the observation here."}

What This Learning Means
This moment shows growth in ${data.domain || "development"} as the child explored, made choices, communicated, solved problems, and participated in meaningful play.

Skills Noticed
- Curiosity and engagement
- Communication and vocabulary
- Persistence and problem-solving
- Social-emotional confidence

Next Step
${data.nextStep || "Offer a related activity with one small new challenge and continue documenting growth."}

Family Connection
Share a simple note with families so they can notice and support this learning at home.`;
}

function generateParentMessage(data) {
  return `Parent Message Draft

Topic
${data.topic || "Program Update"}

Tone
${data.tone || "Warm and clear"}

Message
Hi! I wanted to share an update about ${data.topic || "your child's day"}.

${data.details || "Add the important details here."}

I appreciate your partnership and want to keep communication open. Please let me know if you have any questions or if there is anything helpful you would like me to know.

Thank you,
Your Childcare Provider`;
}

function generateAiDailySchedule(data) {
  return `Daily Schedule Draft

Hours
${data.openTime || "7:30 AM"} - ${data.closeTime || "5:30 PM"}

Ages Served
${data.ages || "Mixed ages"}

Schedule
7:30 - 8:30 Arrival, free play, breakfast
8:30 - 9:00 Diapering/toileting, handwashing, transition
9:00 - 9:20 Circle time, songs, story, vocabulary
9:20 - 10:15 Centers, sensory, art, and small group activities
10:15 - 11:00 Outdoor play or gross motor
11:00 - 11:30 Handwashing, lunch setup, calm transition
11:30 - 12:15 Lunch
12:15 - 12:30 Diapering/toileting, story, rest prep
${data.nap || "12:30 PM-2:30 PM"} Nap/rest time
2:30 - 3:00 Wake-up, diapering/toileting, snack
3:00 - 4:15 Outdoor play, music, blocks, dramatic play
4:15 - 5:30 Closing activities, parent pickup, daily communication

Provider Note
Adjust timing for infants, meals, licensing rules, school pickup, and individual child needs.`;
}

function generateClassroomSetup(data) {
  return `Classroom Setup Suggestions

Space
${data.space || "Describe your childcare space."}

Ages Served
${data.ages || "Mixed ages"}

Requested Centers
${data.centers || "Blocks, books, art, dramatic play, sensory"}

Layout Ideas
- Place quiet areas, books, and calming materials away from louder active play.
- Keep art and sensory near washable flooring or easy-clean surfaces.
- Use low shelves and labeled bins so children can access materials safely.
- Create clear walking paths for supervision and emergency exits.
- Keep choking hazards, cleaning supplies, and adult-only materials locked away.

Learning Center Ideas
- Cozy reading corner
- Blocks and building
- Dramatic play
- Fine motor/manipulatives
- Art and writing
- Sensory exploration
- Calm-down space

Safety Reminder
Review room setup with state licensing rules, safe sleep guidance, supervision needs, and age-specific hazards.`;
}

function generateEmergencyPlan(data) {
  return `Emergency Plan Draft

Program
${data.program || "Your Daycare Name"}

Emergency Types Covered
${data.risks || "Fire, severe weather, lockdown, medical emergency"}

Evacuation / Meeting Place
${data.location || "List primary and secondary meeting locations."}

Emergency Procedures
- Stay calm and account for every child.
- Bring attendance records, emergency contacts, medications, and phone if safe.
- Follow evacuation, shelter-in-place, lockdown, or medical response procedures.
- Contact emergency services when needed.
- Notify parents/guardians as soon as it is safe and appropriate.
- Document the incident after children are safe.

Practice and Review
Practice drills as required by licensing. Keep emergency contacts current and review plans with substitutes or assistants.

Provider Note
Customize this draft to match your state licensing requirements, home layout, and local emergency guidance.`;
}

function generateSubstitutePlan(data) {
  return `Substitute Teacher Plan

Date
${data.date || "Today"}

Daily Routine
${data.routine || "Arrival, meals, play, diapering/toileting, outdoor play, nap, pickup."}

Important Notes
${data.notes || "List allergies, comfort items, authorized pickups, behavior supports, emergency contacts, and medication notes."}

Quick Activity Plan
- Read a familiar book and sing a transition song.
- Offer blocks, puzzles, art, or sensory materials already prepared.
- Keep routines calm, simple, and predictable.
- Use positive guidance, choices, and redirection.

Meals and Rest
Follow posted menus, allergy plans, safe sleep guidance, and each child's routine.

End-of-Day Notes
Record meals, naps, toileting/diapers, activities, incidents, and parent communication.`;
}

function generateGrantLetter(data) {
  return `Grant and Funding Request Letter

Program
${data.program || "Your Childcare Program"}

Funding Need
${data.need || "Materials, safety upgrades, curriculum, or program support."}

Amount Requested
${data.amount || "Amount requested"}

Program Impact
${data.impact || "This funding will support safe, high-quality care and learning experiences for children."}

Draft Letter
Dear Grant Review Committee,

I am requesting ${data.amount || "funding"} to support ${data.need || "important childcare program needs"} at ${data.program || "my childcare program"}. This support would help strengthen the quality, safety, and learning opportunities available to children in care.

The requested funding would directly benefit children by supporting ${data.impact || "developmentally appropriate materials, safer routines, and stronger early learning experiences"}.

Thank you for considering this request and for supporting childcare providers and families in our community.

Sincerely,
Provider Name`;
}

function generateNewsletter(data) {
  const month = data.month || "This Month";
  const theme = data.theme || "Learning Together";
  const dates = data.dates || "Add important dates here.";
  const reminders = data.reminders || "Please label all personal items and check your child's supply bin weekly.";
  return `${month} Parent Newsletter

Theme: ${theme}

Hello Families,
This month we are focusing on playful learning experiences that support language, social-emotional growth, creativity, movement, and independence. Children will explore through stories, songs, art, sensory play, outdoor play, and hands-on activities.

What We Are Learning
- New vocabulary connected to our monthly theme
- Sharing, turn-taking, and expressing feelings
- Fine motor skills through art, building, and table activities
- Gross motor skills through movement and outdoor play
- Early problem-solving, counting, matching, and observation

Important Dates
${dates}

Reminders
${reminders}

Family Connection
At home, you can support learning by reading together, talking about your child's day, naming feelings, counting everyday objects, and encouraging independence with simple routines.

Thank you for partnering with us and trusting us with your child's care.`;
}

function generateDailyReport(data) {
  const child = data.child || "Your child";
  const mood = data.mood || "Happy and engaged";
  return `Daily Report

${child} had a positive day and participated in our daily routines and learning activities.

Mood
${mood}

Meals
${data.meals || "Meals were offered according to the daily menu."}

Rest
${data.nap || "Rest time was offered, and quiet routines were supported."}

Diapering / Toileting
${data.diapering || "Diapering, toileting, handwashing, and self-help routines were supported throughout the day."}

Highlights
${data.highlights || "Enjoyed play, stories, movement, and hands-on learning activities."}

Learning Moment
Today supported social-emotional development, communication, independence, and play-based learning.

Parent Note
${data.notes || "Please let me know if there is anything you would like me to watch for or support tomorrow."}`;
}

function generateHandbook(data) {
  return `Parent Handbook Draft

Program Name: ${data.program || "Your Daycare Name"}

Tuition Policy
${data.tuition || "Tuition is due on the scheduled payment date and reserves the child's space in care."}

Sick Policy
${data.sick || "Children should remain home when they have a fever, vomiting, diarrhea, contagious symptoms, or are unable to participate comfortably in daily activities."}

Guidance and Discipline Policy
${data.discipline || "The program uses positive guidance, redirection, clear expectations, age-appropriate choices, and calm support. Physical punishment, shaming, and harsh discipline are not used."}

Pick-up and Drop-off Procedures
${data.pickup || "Children must be signed in and out by an authorized adult. Parents should communicate schedule changes as soon as possible."}

Vacation and Closure Policy
${data.closures || "Families will receive notice of planned closures whenever possible. Providers may update this section to match paid holidays, vacation time, and emergency closure procedures."}

State-Specific Customization Notes
${data.state || "Add your state licensing requirements, required parent notices, safe sleep rules, medication rules, discipline policy requirements, and recordkeeping expectations here."}

Emergency Procedures
Emergency contacts must remain current. In an emergency, the provider will contact parents/guardians, emergency contacts, and emergency services as needed.

Provider Review Note
Review and adjust all policies to match your state licensing rules, business practices, and signed parent contract.`;
}

function generateContract(data) {
  return `Home Daycare Contract Draft

Program Name: ${data.program || "Your Daycare Name"}
Parent/Guardian Name: ______________________________
Child Name: ______________________________
Start Date: ______________________________

Care Schedule
${data.schedule || "List the child's approved days and hours of care here."}

Tuition and Payment Terms
${data.tuition || "Tuition is due on the scheduled payment date and reserves the child's space in care."}

Late Payment Policy
Payments not received by the due date may be charged a late fee. Continued late payments may result in suspended care until the account is current.

Late Pick-up Policy
Parents/guardians agree to pick up by the scheduled closing time. Late pick-up fees may apply unless the provider has approved a schedule change in advance.

Fees
${data.fees || "List late payment fees, late pick-up fees, returned payment fees, supply fees, registration fees, or deposit rules here."}

Illness and Exclusion Policy
Children should remain home when they have fever, vomiting, diarrhea, contagious symptoms, or are unable to participate comfortably in daily activities.

Vacation, Holidays, and Closures
Families will receive notice of planned closures whenever possible. Provider holidays, vacation time, and emergency closures should be listed in the parent handbook or added here.

Supplies
Parents/guardians are responsible for providing diapers, wipes, formula, extra clothing, medication forms when needed, and any other child-specific supplies requested by the provider.

Termination Notice
Either party should provide written notice before ending care. Recommended notice: two weeks unless a different policy is required by the provider or state rules.

Additional Program Policies
${data.policies || "Add program-specific policies, including guidance, meals, transportation, field trips, communication, and authorized pickup rules."}

Agreement
By signing below, parents/guardians agree to follow the policies in this contract and the parent handbook.

Parent/Guardian Signature: ______________________________ Date: ____________
Provider Signature: ______________________________ Date: ____________`;
}

function generateResource(data) {
  const type = data.resourceType || "Worksheet";
  const age = data.age || "Preschool";
  const theme = data.theme || "Shapes";
  return `${type} Idea

Title: ${theme} ${type} for ${age}

Page Layout
- Large title at the top
- Simple directions for the teacher or parent
- 4 to 6 large child-friendly practice spaces
- Optional tracing, coloring, matching, or cut-and-paste section

Prompt Text
Let's learn about ${theme.toLowerCase()}! Trace, color, match, or circle the items that belong with the theme.

Learning Goal
Children will practice early learning skills through a simple ${theme.toLowerCase()} activity designed for ${age.toLowerCase()} learners.

Teacher Tip
Use the printable during small group, table time, quiet work, or as a take-home extension.`;
}

function generateMenu(prompt) {
  return `Daycare Menu for Next Week

Monday
Breakfast: Oatmeal, banana, milk
Lunch: Turkey sandwich, peas, peaches, milk
Snack: Yogurt and crackers

Tuesday
Breakfast: Scrambled eggs, toast, fruit, milk
Lunch: Chicken pasta, green beans, applesauce, milk
Snack: Cheese cubes and whole grain crackers

Wednesday
Breakfast: Cereal, berries, milk
Lunch: Bean and cheese quesadilla, corn, fruit, milk
Snack: Apples and sunflower butter if allowed

Thursday
Breakfast: Pancakes, fruit, milk
Lunch: Meatballs, rice, carrots, pears, milk
Snack: Hummus and soft pita

Friday
Breakfast: Muffin, yogurt, fruit, milk
Lunch: Baked chicken, potatoes, broccoli, fruit, milk
Snack: Trail mix style cereal snack

Reminder: Adjust foods for allergies, choking safety, ages served, and your state or CACFP requirements.`;
}

function generateLicensingChecklist(data) {
  const state = data.state || "Your State";
  const programType = data.programType || "Home daycare";
  const ages = data.ages || "children in care";
  return `${state} ${programType} Licensing Checklist

Ages Served
${ages}

Important Reminder
This checklist is a planning tool. Providers should verify all requirements directly with their state licensing agency before opening or changing services.

Licensing Setup
[ ] Confirm whether your program needs a license, registration, permit, or exemption.
[ ] Review required training hours, background checks, and health/safety courses.
[ ] Complete CPR/first aid training if required.
[ ] Prepare household member/background check information.
[ ] Review staff-to-child ratios and group size limits for each age group.

Home and Safety
[ ] Prepare safe sleep space for infants when applicable.
[ ] Check smoke detectors, carbon monoxide detectors, fire extinguishers, and emergency exits.
[ ] Store medications, cleaning supplies, and hazards out of reach.
[ ] Create emergency evacuation, weather, lockdown, and reunification plans.
[ ] Post emergency contacts and required notices.

Paperwork
[ ] Enrollment packet
[ ] Emergency contacts
[ ] Authorized pickup list
[ ] Medical/allergy forms
[ ] Medication authorization
[ ] Parent handbook
[ ] Signed tuition agreement or contract
[ ] Attendance records
[ ] Incident/illness report forms

Daily Operations
[ ] Daily schedule
[ ] Meal plan
[ ] Cleaning/sanitizing routine
[ ] Nap/rest supervision routine
[ ] Parent communication system
[ ] Child observation/documentation plan`;
}

function generateDailySchedule(data) {
  return `Daily Schedule Builder

Hours
${data.openTime || "7:30 AM"} - ${data.closeTime || "5:30 PM"}

Ages Served
${data.ages || "Infants, toddlers, and preschoolers"}

Sample Daily Routine
${data.openTime || "7:30 AM"} Arrival, greetings, health check, free play
8:30 AM Breakfast and handwashing
9:00 AM Circle time, songs, calendar, feelings check-in
9:20 AM Learning centers and small group activities
10:00 AM Outdoor play or gross motor movement
10:45 AM Art, sensory, or fine motor invitation
11:30 AM Lunch and clean-up
12:15 PM Story, quiet music, bathroom/diaper routine
${data.nap || "12:30 PM-2:30 PM"} Nap/rest time
2:30 PM Wake-up routine, diapers/bathroom, snack
3:00 PM Outdoor play, music, or movement
4:00 PM Table toys, books, puzzles, and parent pick-up prep
${data.closeTime || "5:30 PM"} Closing

Provider Notes
Adjust times for infant feeding, diapering, safe sleep checks, school pick-ups, weather, and your state supervision rules.`;
}

function generateCurriculumPlan(data) {
  const age = data.age || "Mixed Ages";
  const month = data.month || "This Month";
  const theme = data.theme || "Learning Together";
  const goals = data.goals || "language, social-emotional skills, fine motor, and problem-solving";
  return `${month} Curriculum Builder

Age Group
${age}

Monthly Theme
${theme}

Monthly Learning Goals
${goals}

Week 1: Introduce the Theme
- Circle Time: Theme vocabulary, picture cards, songs, and questions
- Art: Simple open-ended art invitation
- Sensory: Texture bin or safe exploration tray
- Fine Motor: Sorting, stacking, tracing, or grasping practice
- Gross Motor: Movement game connected to the theme

Week 2: Explore and Compare
- Add matching, counting, color, shape, or sound activities
- Read books connected to ${theme.toLowerCase()}
- Document one observation per child when possible

Week 3: Create and Communicate
- Add pretend play, art, storytelling, and social-emotional language
- Invite children to describe what they notice, choose, or create

Week 4: Review and Share
- Repeat favorite activities with a small challenge
- Send home a family note, photo, or portfolio page
- Review observations and choose next steps

Standards Connection
Supports early learning guideline areas including approaches to learning, communication, social-emotional development, physical development, cognitive development, creative arts, math, and science.`;
}

function generateAttendanceTracker(data) {
  const children = (data.children || "Child 1\nChild 2\nChild 3").split("\n").map((child) => child.trim()).filter(Boolean);
  const rows = children.map((child) => `${child} | Mon ___/___ | Tue ___/___ | Wed ___/___ | Thu ___/___ | Fri ___/___ | Parent Signature __________`).join("\n");
  return `Weekly Attendance Tracker

Week Of: ${data.week || "__________"}

Directions
Record arrival and pick-up times daily. Add parent initials/signature if required by your program or state.

Child | Monday | Tuesday | Wednesday | Thursday | Friday | Signature
${rows}

Notes to Track
${data.notes || "Arrival, pick-up, meals, nap, parent signature"}

Provider Reminder
Keep attendance records stored with your required childcare paperwork.`;
}

function generateMealPlanner(data) {
  const age = data.age || "Mixed Ages";
  const days = Number(data.days || 5);
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].slice(0, days);
  const meals = dayNames.map((day, index) => {
    const breakfasts = ["Oatmeal, banana, milk", "Scrambled eggs, toast, peaches, milk", "Whole grain cereal, berries, milk", "Pancakes, pears, milk", "Yogurt, granola, apples, milk"];
    const lunches = ["Turkey sandwich, peas, applesauce, milk", "Chicken rice bowl, green beans, peaches, milk", "Bean quesadilla, corn, oranges, milk", "Pasta with meat sauce, broccoli, pears, milk", "Tuna pita, carrots, mixed fruit, milk"];
    const snacks = ["Cheese and crackers", "Yogurt and fruit", "Hummus and pita", "Graham crackers and apples", "Cottage cheese and peaches"];
    return `${day}
Breakfast: ${breakfasts[index]}
Lunch: ${lunches[index]}
Snack: ${snacks[index]}`;
  }).join("\n\n");
  return `Weekly Daycare Meal Planner

Age Group
${age}

Allergies or Restrictions
${data.restrictions || "List allergies, restrictions, and age-appropriate texture notes here."}

Menu
${meals}

Shopping Notes
Milk, whole grains, fruit, vegetables, protein foods, yogurt, cheese, child-safe snacks, and any infant/toddler substitutions needed.

Provider Reminder
Check your state rules and food program requirements for serving sizes, milk type, allergy substitutions, and infant feeding plans.`;
}

function generatePortfolioPage(data) {
  return `Child Portfolio Page

Child Name
${data.child || "Child Name"}

Age
${data.age || "Age"}

Strengths and Interests
${data.strengths || "Describe what the child enjoys, chooses often, and does confidently."}

Recent Growth
The child is showing growth through daily routines, play, communication, and hands-on learning experiences. Add observations, photos, work samples, or family notes here.

Developmental Areas
- Social-emotional development
- Language and communication
- Fine motor and gross motor development
- Cognitive development
- Self-help and independence
- Creative expression

Next Steps
${data.nextSteps || "Add 2-3 next steps for learning based on observations."}

Family Connection
At home, families can support this growth by reading together, talking about daily routines, offering simple choices, and encouraging independence.`;
}

function compactItem(resource) {
  const favoriteText = !isProUser() ? "Pro Save" : favorites.includes(resource.id) ? "Saved" : "Save";
  const favoriteAttribute = !isProUser() ? `data-pro-feature="favorites"` : `data-favorite="${resource.id}"`;
  return `
    <div class="compact-item">
      <div>
        <strong>${resource.title}</strong>
        <span>${resource.category} ¬∑ ${resource.age} ¬∑ ${resource.plan}</span>
      </div>
      <button class="favorite-button ${!isProUser() ? "disabled-control" : ""}" ${favoriteAttribute} type="button">${favoriteText}</button>
    </div>
  `;
}

function renderFavorites() {
  if (!isProUser()) {
    document.querySelector("#favoritesList").innerHTML = `<div class="empty-state">Saved favorites are included with Pro.</div>`;
    return;
  }
  const saved = resources.filter((resource) => favorites.includes(resource.id));
  document.querySelector("#favoritesList").innerHTML = saved.length
    ? saved.slice(0, 5).map(compactItem).join("")
    : `<div class="empty-state">Save resources you want to come back to later.</div>`;
}

function sampleResources(category, count) {
  return resources.filter((resource) => resource.category === category).slice(0, count);
}

function previewCard(resource) {
  return `
    <article class="preview-card">
      <p class="eyebrow">${escapeHtml(resource.category)}</p>
      <h3>${escapeHtml(resource.title)}</h3>
      <p>${escapeHtml(resource.description || "Ready-to-use daycare resource sample.")}</p>
      <div class="tag-row">
        <span class="tag">${escapeHtml(resource.age)}</span>
        <span class="tag">${escapeHtml(resource.format || "Preview")}</span>
      </div>
      <button class="ghost-button" data-view="${resourceViewForCategory(resource.category)}" type="button">Open Library</button>
    </article>
  `;
}

function renderPreviewLibrary() {
  const target = document.querySelector("#previewLibraryApp");
  if (!target) return;
  const samples = [
    ...sampleResources("Lesson Plans", 3),
    ...sampleResources("Observation Hub", 3),
    ...sampleResources("Forms Library", 1),
    ...sampleResources("Printables", 3),
    ...sampleResources("Menu Center", 1),
  ];
  target.innerHTML = `
    <section class="section-block preview-feature">
      <div>
        <p class="eyebrow">AI Tool Preview</p>
        <h3>Observation Generator sample output</h3>
        <p>Professional Observation: During play, the child demonstrated growing confidence while sorting colors, naming objects, and participating in a simple group routine. This supports language, cognitive development, and social-emotional growth.</p>
      </div>
      <button class="primary-button" data-view="ai" type="button">Try AI Tools</button>
    </section>
    <div class="preview-grid">
      ${samples.map(previewCard).join("")}
    </div>
  `;
}

function onboardingProgress() {
  const completed = new Set(readSavedJson("llhOnboardingComplete", []));
  if (childStore("Profiles").length) completed.add("child-profile");
  if (savedDownloads.length) completed.add("download-form");
  if (generatedOutputs().length || aiUsageCount() > 0) completed.add("generate-observation");
  if (localStorage.getItem("llhWeeklyPlanner")) completed.add("weekly-planner");
  if (favorites.length) completed.add("save-resource");
  if (isProUser()) completed.add("upgrade-library");
  return completed;
}

function renderOnboardingChecklist() {
  const target = document.querySelector("#onboardingChecklist");
  if (!target) return;
  const completed = onboardingProgress();
  target.innerHTML = `
    <div class="onboarding-list">
      ${onboardingSteps.map((step) => `
        <button class="onboarding-item ${completed.has(step.id) ? "complete" : ""}" data-view="${step.view}" type="button">
          <span>${completed.has(step.id) ? "Done" : "Next"}</span>
          <strong>${escapeHtml(step.label)}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

function featureListHtml(items) {
  return `<ul class="feature-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function foundingStatusCard() {
  const remaining = foundingSpotsRemaining();
  const claimed = foundingSpotsClaimed();
  return `
    <section class="founding-banner">
      <div>
        <p class="eyebrow">Founding Member Special</p>
        <h3>First 50 Members: $9.99/month for life</h3>
        <p>Regular pricing after founding spots are claimed: $19.99/month or $199/year.</p>
      </div>
      <div class="spots-meter" aria-label="${remaining} founding spots remaining">
        <strong>${remaining}</strong>
        <span>of ${foundingMemberLimit} spots left</span>
        <small>${claimed} claimed</small>
      </div>
    </section>
  `;
}

function renderHomeFoundingOffer() {
  const target = document.querySelector("#homeFoundingOffer");
  if (!target) return;
  const remaining = foundingSpotsRemaining();
  const claimed = foundingSpotsClaimed();
  target.innerHTML = `
    <div class="founding-banner home-founding-banner">
      <div>
        <p class="eyebrow">Founding Member Special</p>
        <h3>$9.99/month for life for the first 50 members</h3>
        <p>${claimed} spots are already filled. Claim one of the ${remaining} remaining lifetime price-lock spots before regular Pro pricing begins.</p>
      </div>
      <div class="spots-meter" aria-label="${claimed} founding spots filled and ${remaining} remaining">
        <strong>${remaining}</strong>
        <span>spots left</span>
        <small>${claimed} of ${foundingMemberLimit} filled</small>
      </div>
      <button class="primary-button" data-view="plans" type="button">Claim Founding Spot</button>
    </div>
  `;
}

function pricingCard(planKey, options = {}) {
  const plan = billingPlans[planKey];
  const buttonClass = options.primary ? "primary-button" : "ghost-button";
  const buttonText = options.buttonText || "Choose Plan";
  return `
    <article class="price-card ${options.featured ? "featured" : ""}">
      ${options.eyebrow ? `<p class="eyebrow">${escapeHtml(options.eyebrow)}</p>` : ""}
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="price">${plan.price}<span>${plan.interval}</span></p>
      ${featureListHtml(plan.features)}
      <button class="${buttonClass}" ${options.free ? `data-plan="Free"` : `data-checkout-plan="${options.checkoutType}"`} type="button">${escapeHtml(buttonText)}</button>
    </article>
  `;
}

function renderPricingPage() {
  const target = document.querySelector("#pricingApp");
  if (!target) return;
  const remaining = foundingSpotsRemaining();
  target.innerHTML = `
    ${foundingStatusCard()}
    <div class="pricing-grid">
      ${pricingCard("Free", { free: true, buttonText: "Use Free" })}
      ${remaining > 0
        ? pricingCard("Founding", { featured: true, primary: true, eyebrow: "First 50 Members", checkoutType: "founding", buttonText: "Claim Founding Spot" })
        : pricingCard("ProMonthly", { featured: true, primary: true, eyebrow: "Main Paid Plan", checkoutType: "monthly", buttonText: "Choose Pro Monthly" })}
      ${pricingCard("ProAnnual", { checkoutType: "annual", buttonText: "Choose Pro Annual" })}
    </div>
    <section class="section-block billing-links">
      <button class="ghost-button" data-view="upgrade" type="button">Upgrade Page</button>
      <button class="ghost-button" data-view="billing" type="button">Billing Management</button>
      <button class="ghost-button" data-view="subscription" type="button">Subscription Status</button>
      <button class="ghost-button" data-view="billing-history" type="button">Billing History</button>
    </section>
  `;
}

function renderUpgradePage() {
  const target = document.querySelector("#upgradeApp");
  if (!target) return;
  const remaining = foundingSpotsRemaining();
  target.innerHTML = `
    ${foundingStatusCard()}
    <div class="pricing-grid">
      ${remaining > 0
        ? pricingCard("Founding", { featured: true, primary: true, eyebrow: "Best Launch Offer", checkoutType: "founding", buttonText: "Checkout for $9.99/month" })
        : pricingCard("ProMonthly", { featured: true, primary: true, eyebrow: "Pro", checkoutType: "monthly", buttonText: "Checkout for $19.99/month" })}
      ${pricingCard("ProMonthly", { checkoutType: "monthly", buttonText: "Checkout Monthly" })}
      ${pricingCard("ProAnnual", { checkoutType: "annual", buttonText: "Checkout Annual" })}
    </div>
    <section class="section-block">
      <p class="eyebrow">Stripe Checkout</p>
      <h3>Secure payment handoff</h3>
      <p class="muted-copy">In production, these buttons create a Stripe Checkout Session on your server. In this local file, they run a safe test checkout simulation so billing permissions can be verified.</p>
    </section>
  `;
}

function subscriptionSummaryHtml() {
  const account = currentAccount();
  const planLabel = currentUser ? billingPlanLabel() : "Guest";
  return `
    <div class="billing-summary-grid">
      <div><span>Current Plan</span><strong>${escapeHtml(planLabel)}</strong></div>
      <div><span>Monthly Price</span><strong>${escapeHtml(billingPriceLabel(account))}</strong></div>
      <div><span>Price Lock</span><strong>${account?.foundingMember ? "Lifetime" : isProUser() ? "Regular Pro pricing" : "None"}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(account?.subscriptionStatus || "No account")}</strong></div>
      <div><span>AI Usage</span><strong>${aiUsageCount()} / ${aiMonthlyLimit()}</strong></div>
      <div><span>AI Reset</span><strong>${escapeHtml(aiResetLabel())}</strong></div>
    </div>
  `;
}

function renderBillingPage() {
  const target = document.querySelector("#billingApp");
  if (!target) return;
  const account = currentAccount();
  target.innerHTML = `
    <section class="account-layout">
      <div class="account-panel">
        <p class="eyebrow">Billing Management</p>
        <h3>${escapeHtml(currentUser || "Guest")}</h3>
        ${subscriptionSummaryHtml()}
        <div class="account-actions-row">
          <button class="primary-button" data-view="upgrade" type="button">${isProUser() ? "Change Plan" : "Upgrade to Pro"}</button>
          <button class="ghost-button" data-update-payment type="button">Update Payment Method</button>
          <button class="ghost-button" data-view="billing-history" type="button">View Billing History</button>
          ${isProUser() ? `<button class="danger-button" data-view="cancel-subscription" type="button">Cancel Subscription</button>` : ""}
        </div>
      </div>
      <div class="account-panel">
        <p class="eyebrow">Payment Method</p>
        <h3>${escapeHtml(account?.paymentMethod || "No payment method on file")}</h3>
        <p>Stripe Customer: ${escapeHtml(account?.stripeCustomerId || "Created after live checkout")}</p>
        <p>Subscription: ${escapeHtml(account?.stripeSubscriptionId || "Created after live checkout")}</p>
      </div>
    </section>
  `;
}

function renderSubscriptionPage() {
  const target = document.querySelector("#subscriptionApp");
  if (!target) return;
  target.innerHTML = `
    <section class="section-block">
      ${subscriptionSummaryHtml()}
      <div class="account-actions-row">
        <button class="ghost-button" data-view="plans" type="button">Pricing Page</button>
        <button class="ghost-button" data-view="billing" type="button">Billing Management</button>
        <button class="ghost-button" data-view="account" type="button">Account Page</button>
      </div>
    </section>
  `;
}

function renderBillingHistoryPage() {
  const target = document.querySelector("#billingHistoryApp");
  if (!target) return;
  const history = currentBillingHistory();
  target.innerHTML = `
    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Billing History</p>
          <h3>${history.length} event${history.length === 1 ? "" : "s"}</h3>
        </div>
        <button class="ghost-button" data-view="billing" type="button">Billing Management</button>
      </div>
      <div class="billing-history-list">
        ${history.length ? history.map((item) => `
          <div class="billing-history-item">
            <div>
              <strong>${escapeHtml(item.type)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
            <div>
              <strong>${escapeHtml(item.amount || "-")}</strong>
              <span>${new Date(item.date).toLocaleString()}</span>
            </div>
          </div>
        `).join("") : `<div class="empty-state">No billing history yet.</div>`}
      </div>
    </section>
  `;
}

function renderPaymentSuccessPage() {
  const target = document.querySelector("#paymentSuccessApp");
  if (!target) return;
  target.innerHTML = `
    <section class="section-block success-panel">
      <p class="eyebrow">Active Subscription</p>
      <h3>${escapeHtml(billingPlanLabel())} is active</h3>
      ${subscriptionSummaryHtml()}
      <div class="account-actions-row">
        <button class="primary-button" data-view="account" type="button">View Account</button>
        <button class="ghost-button" data-view="billing" type="button">Billing Management</button>
      </div>
    </section>
  `;
}

function renderPaymentFailedPage() {
  const target = document.querySelector("#paymentFailedApp");
  if (!target) return;
  target.innerHTML = `
    <section class="section-block failed-panel">
      <p class="eyebrow">Payment Failed</p>
      <h3>No plan change was made.</h3>
      <p class="muted-copy">Try checkout again or update the payment method in Stripe Billing Management.</p>
      <div class="account-actions-row">
        <button class="primary-button" data-view="upgrade" type="button">Try Again</button>
        <button class="ghost-button" data-update-payment type="button">Update Payment Method</button>
      </div>
    </section>
  `;
}

function renderCancelSubscriptionPage() {
  const target = document.querySelector("#cancelSubscriptionApp");
  if (!target) return;
  target.innerHTML = `
    <section class="section-block failed-panel">
      <p class="eyebrow">Cancel Subscription</p>
      <h3>Return this account to Free?</h3>
      <p class="muted-copy">Free limits will apply immediately. If this account claimed Founding Member status, that status remains stored permanently for future billing recovery.</p>
      <div class="account-actions-row">
        <button class="danger-button" data-confirm-cancel type="button">Confirm Cancel</button>
        <button class="ghost-button" data-view="billing" type="button">Keep Subscription</button>
      </div>
    </section>
  `;
}

function renderResetPasswordPage() {
  const message = document.querySelector("#resetPasswordMessage");
  if (!message) return;
  const params = new URLSearchParams(window.location.search);
  if (firebaseAuthEnabled && params.get("mode") === "resetPassword" && params.get("oobCode")) {
    setFormMessage(message, "Enter a new password to complete your secure reset.", true);
  } else if (!firebaseAuthEnabled && localStorage.getItem("llhDemoResetToken")) {
    setFormMessage(message, "Demo reset mode is active. Enter a new password to test the recovery screen.", true);
  } else {
    setFormMessage(message, "Request a password reset email from the login screen first.");
  }
}

function renderAccountPage() {
  const emailLabel = document.querySelector("#accountEmailLabel");
  const planLabel = document.querySelector("#accountPlanLabel");
  const verificationLabel = document.querySelector("#accountVerificationLabel");
  const statusLabel = document.querySelector("#subscriptionStatusLabel");
  const detailLabel = document.querySelector("#subscriptionDetailLabel");
  const favoritesTarget = document.querySelector("#accountFavoritesList");
  const downloadsTarget = document.querySelector("#accountDownloadsList");
  const phoneInput = document.querySelector("#accountPhoneInput");
  const demoButton = document.querySelector("#demoAccountButton");
  const upgradeButton = document.querySelector("#accountUpgradeButton");
  const resendButton = document.querySelector("#resendVerificationButton");
  const cancelButton = document.querySelector("#accountCancelButton");
  const signOutButton = document.querySelector("#signOutButton");
  if (!emailLabel || !planLabel || !statusLabel || !detailLabel || !favoritesTarget || !downloadsTarget) return;

  if (!currentUser) {
    emailLabel.textContent = "Guest";
    planLabel.textContent = "Create a Free account or log in to save your work.";
    statusLabel.textContent = "No account yet";
    detailLabel.textContent = "Use the Log in or Sign up button at the top to create a Free account.";
    if (verificationLabel) {
      verificationLabel.textContent = "No account recovery settings yet.";
      verificationLabel.classList.remove("verified");
    }
    if (phoneInput) phoneInput.value = "";
    if (demoButton) demoButton.style.display = "inline-flex";
    if (upgradeButton) upgradeButton.textContent = "Create Account First";
    if (resendButton) resendButton.style.display = "none";
    if (cancelButton) cancelButton.style.display = "none";
    if (signOutButton) signOutButton.style.display = "none";
    favoritesTarget.innerHTML = `<div class="empty-state">Log in to save favorites.</div>`;
    downloadsTarget.innerHTML = `<div class="empty-state">Log in to save viewed resources.</div>`;
    renderOnboardingChecklist();
    return;
  }

  const account = currentAccount();
  emailLabel.textContent = currentUser;
  planLabel.textContent = `${billingPlanLabel()} account`;
  if (verificationLabel) {
    verificationLabel.textContent = account?.emailVerified
      ? `Email verified through ${account?.authProvider || authProviderName}.`
      : `Email not verified. ${firebaseAuthEnabled ? "Please verify before launch use." : "Connect Firebase Auth to send verification emails."}`;
    verificationLabel.classList.toggle("verified", Boolean(account?.emailVerified));
  }
  if (phoneInput) phoneInput.value = account?.phone || "";
  statusLabel.textContent = account?.subscriptionStatus || (isProUser() ? `${billingPlanLabel()} Subscription Active` : "Free Plan");
  detailLabel.innerHTML = isProUser()
    ? `Current Plan: ${escapeHtml(billingPlanLabel())}<br>Monthly Price: ${escapeHtml(billingPriceLabel(account))}<br>Price Lock: ${account?.foundingMember ? "Lifetime" : "Regular Pro pricing"}<br>Account Recovery: ${escapeHtml(account?.authProvider || authProviderName)}<br>AI Usage: ${aiUsageCount()} of ${paidAiMonthlyLimit} used this billing month. Resets ${escapeHtml(aiResetLabel())}.<br>Your account has full in-app resources, menus, child profiles, portfolios, tracking tools, provider tools, future premium features, and ${paidAiMonthlyLimit} AI generations per month.`
    : `Your Free account includes 3 lesson plans, 15 observations, 3 forms, 5 activities, 5 printables, ${freeAiMonthlyLimit} AI generations per month, up to 3 child profiles, and the weekly observation tracker. Account Recovery: ${escapeHtml(account?.authProvider || authProviderName)}. AI Usage: ${aiUsageCount()} of ${freeAiMonthlyLimit} used. Resets ${escapeHtml(aiResetLabel())}.`;
  if (demoButton) demoButton.style.display = "none";
  if (upgradeButton) {
    upgradeButton.textContent = isProUser() ? "Manage Billing" : "Upgrade to Pro";
    upgradeButton.disabled = false;
    upgradeButton.classList.remove("disabled-control");
  }
  if (resendButton) resendButton.style.display = account?.emailVerified ? "none" : "inline-flex";
  if (cancelButton) cancelButton.style.display = isProUser() ? "inline-flex" : "none";
  if (signOutButton) signOutButton.style.display = "inline-flex";

  const savedFavoriteResources = resources.filter((resource) => favorites.includes(resource.id));
  const downloadedResources = resources.filter((resource) => savedDownloads.includes(resource.id));
  favoritesTarget.innerHTML = savedFavoriteResources.length
    ? savedFavoriteResources.slice(0, 10).map(accountListItem).join("")
    : `<div class="empty-state">${isProUser() ? "No saved favorites yet." : "Saved favorites are included with Pro."}</div>`;
  downloadsTarget.innerHTML = downloadedResources.length
    ? downloadedResources.slice(0, 10).map(accountListItem).join("")
    : `<div class="empty-state">${isProUser() ? "No viewed resources yet." : "Viewed resources are included with your account."}</div>`;
  renderOnboardingChecklist();
}

function accountListItem(resource) {
  return `
    <div class="compact-item">
      <div>
        <strong>${resource.title}</strong>
        <span>${resource.category} ¬∑ ${resource.age}</span>
      </div>
      <button class="ghost-button" data-view="${resourceViewForCategory(resource.category)}">Open</button>
    </div>
  `;
}

function resourceViewForCategory(category) {
  const map = {
    "Lesson Plans": "lessons",
    "Observation Hub": "observations",
    "Forms Library": "forms",
    "Activity Center": "activities",
    "Menu Center": "menus",
    "Printables": "printables",
  };
  return map[category] || "home";
}

function updatePlanLabel() {
  currentPlanLabel.textContent = billingPlanLabel();
  const summary = document.querySelector("#planAccessSummary");
  if (!summary) return;
  summary.textContent = isProUser()
    ? `${billingPlanLabel()} active: ${billingPriceLabel()} with full in-app library access, saved favorites, viewed resources, and ${Math.max(paidAiMonthlyLimit - aiUsageCount(), 0)} AI generations left this month. Viewed resources: ${savedDownloads.length}.`
    : `Free: 3 lesson plans, 15 observations, 3 forms, 5 activities, 5 printables, up to 3 child profiles, and ${Math.max(freeAiMonthlyLimit - aiUsageCount(), 0)} AI generations left this month.`;
}

function setFreePlan() {
  trackEvent("free_plan_selected");
  currentPlan = "Free";
  localStorage.setItem("llhPlan", currentPlan);
  updateCurrentAccountBilling({
    plan: "Free",
    subscriptionCadence: "",
    subscriptionStatus: "Free Plan",
    monthlyPrice: "$0",
  });
  addBillingHistory("Plan Changed", "Free plan selected", "$0");
  saveCurrentAccountState();
  updateAuthButtons();
  updatePlanLabel();
  renderPricingPage();
  setView("account");
}

async function startCheckout(type) {
  if (!requireBillingAccount()) return;
  const remaining = foundingSpotsRemaining();
  const checkoutType = type === "founding" && remaining <= 0 ? "monthly" : type;
  const amount = checkoutAmount(checkoutType);
  const checkoutButton = document.querySelector(`[data-checkout-plan="${type}"]`);
  if (checkoutButton) {
    checkoutButton.disabled = true;
    checkoutButton.textContent = "Opening Stripe...";
  }
  const pending = {
    type: checkoutType,
    amount,
    email: currentUser,
    startedAt: new Date().toISOString(),
    foundingEligible: checkoutType === "founding",
  };
  localStorage.setItem("llhPendingCheckout", JSON.stringify(pending));
  trackEvent("checkout_start", { type: checkoutType, amount });
  addBillingHistory("Checkout Started", `${checkoutType === "annual" ? "Annual" : checkoutType === "founding" ? "Founding Member" : "Monthly"} Stripe checkout started`, amount);

  if (stripeCheckoutConfig.checkoutEndpoint && canUseStripeBackend()) {
    try {
      const response = await fetch(stripeCheckoutConfig.checkoutEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentUser,
          plan: checkoutType,
          successUrl: `${window.location.origin}${window.location.pathname}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}${window.location.pathname}?checkout=cancel`,
          priceKey: checkoutType === "founding" ? billingPlans.Founding.stripePriceKey : checkoutType === "annual" ? billingPlans.ProAnnual.stripePriceKey : billingPlans.ProMonthly.stripePriceKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Stripe checkout could not start.");
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch (error) {
      addBillingHistory("Stripe Error", error.message || "Checkout endpoint did not return a usable Stripe URL.", amount);
    } finally {
      if (checkoutButton) {
        checkoutButton.disabled = false;
        checkoutButton.textContent = type === "founding" ? "Claim Founding Spot" : type === "annual" ? "Choose Pro Annual" : "Choose Pro Monthly";
      }
    }
  }

  setView("upgrade");
  const upgradeTarget = document.querySelector("#upgradeApp");
  if (upgradeTarget) {
    upgradeTarget.insertAdjacentHTML("afterbegin", `
      <section class="section-block checkout-test-panel">
        <p class="eyebrow">Stripe Test Checkout</p>
        <h3>${escapeHtml(amount)} checkout ready</h3>
        <p class="muted-copy">Local test mode is active because the Stripe backend is not running or not configured yet.</p>
        <div class="account-actions-row">
          <button class="primary-button" data-complete-checkout type="button">Complete Test Payment</button>
          <button class="ghost-button" data-fail-checkout type="button">Simulate Payment Failure</button>
        </div>
      </section>
    `);
  }
}

function completeCheckout() {
  const pending = readSavedJson("llhPendingCheckout", null);
  if (!pending || !currentUser) {
    setView("payment-failed");
    return;
  }
  const type = pending.type;
  let plan = planFromCheckoutType(type);
  let cadence = type === "annual" ? "annual" : "monthly";
  let foundingMember = currentAccount()?.foundingMember || false;
  let foundingMemberNumber = currentAccount()?.foundingMemberNumber || null;
  let priceLock = "";
  let monthlyPrice = type === "annual" ? "$199/year" : "$19.99/month";
  let status = type === "annual" ? "Pro Annual Subscription Active" : "Pro Monthly Subscription Active";

  if (type === "founding" || currentAccount()?.foundingMember) {
    const claim = claimFoundingMembership(currentUser);
    if (claim.claimed || currentAccount()?.foundingMember) {
      plan = "Founding";
      foundingMember = true;
      foundingMemberNumber = claim.memberNumber || currentAccount()?.foundingMemberNumber;
      priceLock = "Lifetime";
      monthlyPrice = "$9.99/month";
      status = "Founding Member Subscription Active";
      cadence = "monthly";
    }
  }

  updateCurrentAccountBilling({
    plan,
    subscriptionCadence: cadence,
    subscriptionStatus: status,
    subscriptionStartedAt: currentAccount()?.subscriptionStartedAt || new Date().toISOString(),
    foundingMember,
    foundingMemberNumber,
    priceLock,
    monthlyPrice,
    stripeCustomerId: currentAccount()?.stripeCustomerId || `cus_test_${Date.now()}`,
    stripeSubscriptionId: currentAccount()?.stripeSubscriptionId || `sub_test_${Date.now()}`,
    paymentMethod: "Visa ending in 4242",
  });
  addBillingHistory("Payment Succeeded", `${billingPlanLabel(plan)} subscription activated`, monthlyPrice);
  trackEvent("checkout_success", { plan, monthlyPrice, attribution: currentAttribution() });
  localStorage.removeItem("llhPendingCheckout");
  saveCurrentAccountState();
  updateAuthButtons();
  updatePlanLabel();
  setView("payment-success");
}

async function completeCheckoutFromStripeSession(session) {
  if (!session?.paid) {
    addBillingHistory("Payment Pending", "Stripe checkout returned, but payment was not marked paid yet.", "");
    setView("payment-failed");
    return;
  }
  const pending = readSavedJson("llhPendingCheckout", null);
  const type = session.plan || pending?.type || "monthly";
  if (session.email && session.email !== currentUser) {
    currentUser = session.email;
    localStorage.setItem("llhUser", currentUser);
    ensureAccount(currentUser);
    loadAccountState(currentUser);
  }
  localStorage.setItem("llhPendingCheckout", JSON.stringify({
    type,
    amount: checkoutAmount(type),
    email: currentUser || session.email,
    startedAt: new Date().toISOString(),
    foundingEligible: type === "founding",
  }));
  completeCheckout();
  updateCurrentAccountBilling({
    stripeCustomerId: session.customerId || currentAccount()?.stripeCustomerId,
    stripeSubscriptionId: session.subscriptionId || currentAccount()?.stripeSubscriptionId,
    paymentMethod: "Managed in Stripe",
  });
  await syncSubscriptionFromBackend(currentUser || session.email);
  saveCurrentAccountState();
  renderPaymentSuccessPage();
}

async function verifyStripeReturnIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("checkout") === "cancel") {
    failCheckout();
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  }
  if (params.get("checkout") !== "success") return false;
  const sessionId = params.get("session_id");
  if (!sessionId || !stripeCheckoutConfig.checkoutStatusEndpoint || !canUseStripeBackend()) {
    completeCheckout();
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  }
  try {
    const response = await fetch(`${stripeCheckoutConfig.checkoutStatusEndpoint}?session_id=${encodeURIComponent(sessionId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Could not verify Stripe checkout.");
    await completeCheckoutFromStripeSession(data);
  } catch (error) {
    addBillingHistory("Stripe Verification Error", error.message || "Checkout returned but could not be verified.", "");
    setView("payment-failed");
  }
  window.history.replaceState({}, "", window.location.pathname);
  return true;
}

function failCheckout() {
  const pending = readSavedJson("llhPendingCheckout", null);
  addBillingHistory("Payment Failed", "Stripe checkout payment failed or was declined.", pending?.amount || "");
  localStorage.removeItem("llhPendingCheckout");
  setView("payment-failed");
}

function cancelSubscription() {
  if (!currentUser) return;
  const account = currentAccount();
  currentPlan = "Free";
  favorites = [];
  savedDownloads = [];
  localStorage.setItem("llhPlan", currentPlan);
  localStorage.setItem("llhFavorites", JSON.stringify(favorites));
  localStorage.setItem("llhDownloads", JSON.stringify(savedDownloads));
  updateCurrentAccountBilling({
    plan: "Free",
    subscriptionCadence: "",
    subscriptionStatus: "Canceled - Free Plan Active",
    monthlyPrice: "$0",
    priceLock: account?.foundingMember ? "Lifetime" : "",
  });
  addBillingHistory("Subscription Canceled", "Pro permissions removed and Free limits restored.", "$0");
  saveCurrentAccountState();
  updateAuthButtons();
  updatePlanLabel();
  setView("subscription");
}

async function openCustomerPortal() {
  if (!requireBillingAccount()) return;
  if (stripeCheckoutConfig.customerPortalEndpoint && canUseStripeBackend()) {
    try {
      const response = await fetch(stripeCheckoutConfig.customerPortalEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentUser,
          returnUrl: `${window.location.origin}${window.location.pathname}?billing=portal-return`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Stripe Billing Portal could not open.");
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch (error) {
      addBillingHistory("Stripe Portal Error", error.message || "Customer Portal endpoint did not return a usable URL.", billingPriceLabel());
    }
  }
  updatePaymentMethod();
}

function updatePaymentMethod() {
  const account = updateCurrentAccountBilling({
    paymentMethod: "Visa ending in 4242",
    stripeCustomerId: currentAccount()?.stripeCustomerId || `cus_test_${Date.now()}`,
  });
  addBillingHistory("Payment Method Updated", "Payment method updated through Stripe Billing Portal.", account?.monthlyPrice || billingPriceLabel(account));
  renderBillingPage();
}

async function signOut() {
  saveCurrentAccountState();
  if (firebaseAuthEnabled) {
    try {
      const client = await getFirebaseAuthClient();
      await client.signOut(client.auth);
    } catch (error) {
      console.warn("Firebase sign out did not complete", error);
    }
  }
  currentUser = "";
  currentPlan = "Free";
  favorites = [];
  savedDownloads = [];
  localStorage.removeItem("llhUser");
  localStorage.setItem("llhPlan", currentPlan);
  localStorage.setItem("llhFavorites", JSON.stringify(favorites));
  localStorage.setItem("llhDownloads", JSON.stringify(savedDownloads));
  updateAuthButtons();
  updatePlanLabel();
  setView("home");
}

function toggleFavorite(id) {
  if (!isProUser()) return;
  favorites = favorites.includes(id) ? favorites.filter((favorite) => favorite !== id) : [...favorites, id];
  saveFavorites();
  const activeView = document.querySelector(".active-view")?.id.replace("view-", "") || "home";
  if (activeView === "home") renderHome();
  if (viewMap[activeView]) renderCategoryPage(activeView);
}

function showSearchResults() {
  const results = searchedResources();
  if (!searchInput.value.trim()) return;
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
  document.querySelector("#view-home").classList.add("active-view");
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === "home");
  });
  const section = document.querySelector("#view-home");
  section.innerHTML = `
    <div class="page-title">
      <p class="eyebrow">Search Results</p>
      <h2>Results for "${searchInput.value.trim()}"</h2>
      <p>Search is checking titles, ages, skills, themes, descriptions, and categories.</p>
    </div>
    <div class="resource-grid">
      ${results.length ? results.map(resourceCard).join("") : `<div class="empty-state">No matches yet. Try toddler, forms, menu, ocean, farm, fine motor, or observation.</div>`}
    </div>
  `;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (event) => {
  const adminPreviewButton = event.target.closest("[data-admin-preview]");
  if (adminPreviewButton) {
    event.preventDefault();
    if (!isAdminUnlocked()) return;
    localStorage.setItem("llhAdminPreviewMode", adminPreviewButton.dataset.adminPreview);
    updateAuthButtons();
    updatePlanLabel();
    renderAdminDashboard();
    const activeView = document.querySelector(".active-view")?.id.replace("view-", "");
    if (viewMap[activeView]) renderCategoryPage(activeView);
    if (activeView === "ai") renderAiPage();
    if (activeView === "children") renderChildManagement();
    return;
  }

  const localOwnerUnlockButton = event.target.closest("#localOwnerAdminUnlock");
  if (localOwnerUnlockButton) {
    event.preventDefault();
    if (!canUseSignedInOwnerAdmin()) return;
    setAdminSession({
      email: currentUser,
      name: adminOwnerAccount.name,
      token: "local-owner-account",
      mode: "local-owner-account",
    });
    trackEvent("admin_unlocked", { email: currentUser, mode: "local-owner-account" });
    renderAdminDashboard();
    return;
  }

  const proFeatureButton = event.target.closest("[data-pro-feature]");
  if (proFeatureButton) {
    event.preventDefault();
    const message = proFeatureButton.dataset.proFeature === "resource-limit"
      ? freeResourceLimitMessage
      : "Upgrade to Pro to unlock this feature.";
    showProFeatureModal(message);
    return;
  }

  const freePlanButton = event.target.closest("[data-plan='Free']");
  if (freePlanButton) {
    event.preventDefault();
    if (!currentUser) {
      openAuthModal("signup");
      return;
    }
    setFreePlan();
    return;
  }

  const checkoutButton = event.target.closest("[data-checkout-plan]");
  if (checkoutButton) {
    event.preventDefault();
    startCheckout(checkoutButton.dataset.checkoutPlan);
    return;
  }

  const completeCheckoutButton = event.target.closest("[data-complete-checkout]");
  if (completeCheckoutButton) {
    event.preventDefault();
    completeCheckout();
    return;
  }

  const failCheckoutButton = event.target.closest("[data-fail-checkout]");
  if (failCheckoutButton) {
    event.preventDefault();
    failCheckout();
    return;
  }

  const updatePaymentButton = event.target.closest("[data-update-payment]");
  if (updatePaymentButton) {
    event.preventDefault();
    openCustomerPortal();
    return;
  }

  const cancelButton = event.target.closest("[data-confirm-cancel]");
  if (cancelButton) {
    event.preventDefault();
    cancelSubscription();
    return;
  }

  const scrollButton = event.target.closest("[data-scroll-target]");
  if (scrollButton) {
    event.preventDefault();
    const target = document.querySelector(`#${scrollButton.dataset.scrollTarget}`);
    if (target) {
      setView("home");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      trackEvent("homepage_scroll_click", { target: scrollButton.dataset.scrollTarget });
    }
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    activeFilter = "All";
    if (searchInput) searchInput.value = "";
    if (viewButton.dataset.view === "plans" || viewButton.dataset.view === "upgrade") {
      trackEvent("upgrade_click", { targetView: viewButton.dataset.view });
    }
    setMobileNavOpen(false);
    setView(viewButton.dataset.view);
    return;
  }

  const viewResourceButton = event.target.closest("[data-view-resource]");
  if (viewResourceButton) {
    event.preventDefault();
    openResourceViewer(viewResourceButton.dataset.viewResource);
    return;
  }

  const toolButton = event.target.closest("[data-tool]");
  if (toolButton) {
    event.preventDefault();
    setView("generators");
    renderGeneratorWorkspace(toolButton.dataset.tool);
    document.querySelector("#generatorWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const futureToolButton = event.target.closest("[data-future-tool]");
  if (futureToolButton) {
    event.preventDefault();
    if (!isProUser()) {
      showProFeatureModal("Provider business tools are Pro features.");
      return;
    }
    renderFutureTools(futureToolButton.dataset.futureTool);
    document.querySelector("#futureToolWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const selectChildButton = event.target.closest("[data-select-child]");
  if (selectChildButton) {
    selectedChildId = selectChildButton.dataset.selectChild;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    renderChildManagement();
  }

  const promptButton = event.target.closest("[data-prompt]");
  if (promptButton) {
    const prompt = promptButton.dataset.prompt;
    if (!canUseAi()) {
      addAiMessage("assistant", aiLimitMessage());
      return;
    }
    const promptBox = document.querySelector("#aiPrompt");
    if (promptBox) promptBox.value = prompt;
    addAiMessage("user", prompt);
    addAiMessage("assistant", generateFromPrompt(prompt));
    recordAiUse();
  }

  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) toggleFavorite(favoriteButton.dataset.favorite);

  const downloadButton = event.target.closest("[data-download]");
  if (downloadButton && isProUser()) {
    event.preventDefault();
    openResourceViewer(downloadButton.dataset.download);
    const id = downloadButton.dataset.download;
    if (!savedDownloads.includes(id)) {
      savedDownloads = [...savedDownloads, id];
      saveDownloads();
      updatePlanLabel();
    }
    downloadButton.textContent = "View";
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    activeFilter = filterButton.dataset.filter;
    const activeView = document.querySelector(".active-view")?.id.replace("view-", "");
    if (viewMap[activeView]) renderCategoryPage(activeView);
  }

  const editObservationButton = event.target.closest("[data-edit-observation]");
  if (editObservationButton) {
    activeObservationEditId = editObservationButton.dataset.editObservation;
    renderCategoryPage("observations");
  }

  const closeObservationEditorButton = event.target.closest("[data-close-observation-editor]");
  if (closeObservationEditorButton) {
    activeObservationEditId = "";
    renderCategoryPage("observations");
  }

  const addObservationChildButton = event.target.closest("[data-add-observation-child]");
  if (addObservationChildButton) {
    const resource = resources.find((item) => item.id === addObservationChildButton.dataset.addObservationChild);
    const records = childRecords();
    const child = selectedChild(records);
    if (!resource || !child) {
      setView("children");
      return;
    }
    const area = resource.tags.find((tag) => learningAreas.includes(tag)) || "Cognitive";
    appendChildRecord("Observations", {
      childId: child.id,
      date: new Date().toISOString().slice(0, 10),
      area,
      text: resource.observationText || resource.description,
      nextSteps: resource.nextSteps || "Continue observing and offer a similar activity with one small added challenge.",
      sourceResourceId: resource.id,
    });
    setView("children");
  }

  const customizeLessonButton = event.target.closest("[data-customize-lesson-ai]");
  if (customizeLessonButton) {
    const resource = resources.find((item) => item.id === customizeLessonButton.dataset.customizeLessonAi);
    setView("generators");
    renderGeneratorWorkspace("lesson");
    if (resource) {
      const form = document.querySelector("#activeGeneratorForm");
      if (form) {
        form.querySelector('[name="age"]').value = resource.age;
        form.querySelector('[name="theme"]').value = resource.theme || resource.tags[0] || "";
        form.querySelector('[name="focus"]').value = resource.developmentalArea || resource.tags.find((tag) => learningAreas.includes(tag)) || "";
        form.querySelector('[name="materials"]').value = resource.materials || "";
      }
    }
  }

  const findLessonActivitiesButton = event.target.closest("[data-find-lesson-activities]");
  if (findLessonActivitiesButton) {
    const resource = resources.find((item) => item.id === findLessonActivitiesButton.dataset.findLessonActivities);
    if (resource) {
      activeFilter = activityTypes.includes(resource.activityFocus) ? resource.activityFocus : "All";
      searchInput.value = lessonThemes.slice(0, 12).includes(resource.theme) ? resource.theme : "";
    }
    setView("activities");
  }

  const addLessonSupportButton = event.target.closest("[data-add-lesson-support]");
  if (addLessonSupportButton) {
    const resource = resources.find((item) => item.id === addLessonSupportButton.dataset.addLessonSupport);
    const records = childRecords();
    const child = selectedChild(records);
    if (!resource || !child) {
      setView("children");
      return;
    }
    appendChildRecord("Differentiations", {
      childId: child.id,
      title: resource.title,
      wholeGroup: resource.title,
      support: `${child.name} - individualized ${resource.developmentalArea || "learning"} support during ${resource.theme || "the weekly"} lesson activities.`,
      notes: `Connected from Lesson Plan Library. Activity focus: ${resource.activityFocus || "small group support"}.`,
      sourceResourceId: resource.id,
    });
    setView("children");
  }

  const plannerResourceButton = event.target.closest("[data-planner-resource]");
  if (plannerResourceButton) {
    const planner = weeklyPlanner();
    planner.resourceId = plannerResourceButton.dataset.plannerResource;
    const resource = resources.find((item) => item.id === planner.resourceId);
    if (resource) {
      planner.theme = resource.theme || resource.tags[0] || planner.theme;
      planner.ageGroup = resource.age === "All Ages" ? planner.ageGroup : resource.age;
      planner.focus = resource.developmentalArea || resource.activityFocus || planner.focus;
    }
    saveWeeklyPlanner(planner);
    renderWeeklyPlanner();
  }

  const copyPlannerButton = event.target.closest("#copyPlannerButton");
  if (copyPlannerButton) {
    const form = document.querySelector("#weeklyPlannerForm");
    const planner = form ? collectPlannerData(form) : weeklyPlanner();
    saveWeeklyPlanner(planner);
    navigator.clipboard?.writeText(plannerExportText(planner));
    copyPlannerButton.textContent = "Copied";
    setTimeout(() => {
      copyPlannerButton.textContent = "Copy Plan";
    }, 1200);
  }

  const downloadPlannerButton = event.target.closest("#downloadPlannerButton");
  if (downloadPlannerButton) {
    const form = document.querySelector("#weeklyPlannerForm");
    const planner = form ? collectPlannerData(form) : weeklyPlanner();
    saveWeeklyPlanner(planner);
    downloadTextFile(`${planner.theme || "Weekly"} Plan`, plannerExportText(planner));
  }

  const clearPlannerButton = event.target.closest("#clearPlannerButton");
  if (clearPlannerButton) {
    saveWeeklyPlanner(defaultPlanner());
    renderWeeklyPlanner();
  }

  const copyButton = event.target.closest("#copyOutputButton");
  if (copyButton) {
    const output = document.querySelector("#generatorOutput")?.textContent || "";
    navigator.clipboard?.writeText(output);
    copyButton.textContent = "Copied";
    setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1200);
  }

  const editOutputButton = event.target.closest("#editOutputButton");
  if (editOutputButton) {
    const output = document.querySelector("#generatorOutput");
    if (output) {
      output.focus();
      editOutputButton.textContent = "Editing";
      setTimeout(() => {
        editOutputButton.textContent = "Edit";
      }, 1200);
    }
  }

  const saveButton = event.target.closest("#saveOutputButton");
  if (saveButton) {
    if (!isProUser()) {
      showProFeatureModal("Saving generated AI content is a Pro feature.");
      return;
    }
    const result = currentGeneratedResult();
    if (!result) return;
    saveGeneratedOutputs([result, ...generatedOutputs()]);
    saveButton.textContent = "Saved";
    setTimeout(() => {
      saveButton.textContent = "Save";
    }, 1200);
  }

  const saveLibraryButton = event.target.closest("#saveOutputLibraryButton");
  if (saveLibraryButton) {
    if (!isProUser()) {
      showProFeatureModal("Saving generated AI content to the library is a Pro feature.");
      return;
    }
    const result = currentGeneratedResult();
    if (!result) return;
    saveGeneratedOutputs([result, ...generatedOutputs()]);
    saveGeneratedResultToLibrary(result);
    saveLibraryButton.textContent = "Saved to Library";
    setTimeout(() => {
      saveLibraryButton.textContent = "Save to Library";
    }, 1400);
  }

  const regenerateButton = event.target.closest("#regenerateOutputButton");
  if (regenerateButton) {
    const form = document.querySelector("#activeGeneratorForm");
    form?.requestSubmit();
  }

  const printOutputButton = event.target.closest("#printOutputButton");
  if (printOutputButton) {
    if (!isProUser()) {
      showProFeatureModal("Printing generated AI content is a Pro feature.");
      return;
    }
    const result = currentGeneratedResult();
    if (!result) return;
    printGeneratedResult(result);
  }

  const downloadOutputButton = event.target.closest("#downloadOutputButton");
  if (downloadOutputButton) {
    if (!isProUser()) {
      showProFeatureModal("Downloading generated AI content is a Pro feature.");
      return;
    }
    const result = currentGeneratedResult();
    if (!result) return;
    downloadTextFile(result.title, result.text);
  }

  const loadOutputButton = event.target.closest("[data-load-output]");
  if (loadOutputButton) {
    const item = generatedOutputs().find((saved) => saved.id === loadOutputButton.dataset.loadOutput);
    if (!item) return;
    document.querySelector("#outputTitle").textContent = item.title;
    document.querySelector("#generatorOutput").textContent = item.text;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const copyFutureButton = event.target.closest("#copyFutureOutputButton");
  if (copyFutureButton) {
    const output = document.querySelector("#futureOutput")?.textContent || "";
    navigator.clipboard?.writeText(output);
    copyFutureButton.textContent = "Copied";
    setTimeout(() => {
      copyFutureButton.textContent = "Copy";
    }, 1200);
  }

  const downloadFutureButton = event.target.closest("#downloadFutureOutputButton");
  if (downloadFutureButton) {
    const title = document.querySelector("#futureOutputTitle")?.textContent.trim() || "Provider Tool";
    const text = document.querySelector("#futureOutput")?.textContent.trim() || "";
    if (!text || text === "Fill out the form to create a ready-to-edit provider tool.") return;
    downloadTextFile(title, text);
  }

  const completeGoalButton = event.target.closest("[data-complete-goal]");
  if (completeGoalButton) {
    if (!isProUser()) {
      showProFeatureModal("Development goal tracking is a Pro feature.");
      return;
    }
    const goals = childStore("Goals").map((goal) => goal.id === completeGoalButton.dataset.completeGoal ? { ...goal, progress: "Complete" } : goal);
    saveChildStore("Goals", goals);
    renderChildManagement();
  }

  const buildDailyReportButton = event.target.closest("[data-build-daily-report]");
  if (buildDailyReportButton) {
    if (!isProUser()) {
      showProFeatureModal("Daily reports are a Pro feature.");
      return;
    }
    buildDailyReportFromChild(buildDailyReportButton.dataset.buildDailyReport);
  }

  const exportPortfolioButton = event.target.closest("[data-export-portfolio]");
  if (exportPortfolioButton) {
    if (!isProUser()) {
      showProFeatureModal("Child portfolios are a Pro feature.");
      return;
    }
    exportChildPortfolio(exportPortfolioButton.dataset.exportPortfolio);
  }

  const adminEdit = event.target.closest("[data-admin-edit]");
  if (adminEdit) fillAdminForm(adminEdit.dataset.adminEdit);

  const adminDelete = event.target.closest("[data-admin-delete]");
  if (adminDelete) deleteAdminResource(adminDelete.dataset.adminDelete);

  const adminLockButton = event.target.closest("#adminLockButton");
  if (adminLockButton) {
    clearAdminSession();
    renderAdminDashboard();
    return;
  }

  const clearAnalyticsButton = event.target.closest("#clearAnalyticsButton");
  if (clearAnalyticsButton) {
    localStorage.removeItem("llhAnalyticsEvents");
    localStorage.removeItem("llhAttribution");
    renderAdminAnalytics();
    return;
  }

  const saveTicketReplyButton = event.target.closest("[data-save-ticket-reply]");
  if (saveTicketReplyButton) {
    const id = saveTicketReplyButton.dataset.saveTicketReply;
    const reply = document.querySelector(`[data-ticket-reply="${id}"]`)?.value || "";
    updateTicket(id, { reply, status: "In Progress" });
  }

  const completeTicketButton = event.target.closest("[data-complete-ticket]");
  if (completeTicketButton) {
    updateTicket(completeTicketButton.dataset.completeTicket, { status: "Complete" });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setMobileNavOpen(false);
  closeResourceViewer();
  closeProFeatureModal();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") showSearchResults();
});

searchInput.addEventListener("input", () => {
  const activeView = document.querySelector(".active-view")?.id.replace("view-", "");
  if (viewMap[activeView]) renderCategoryPage(activeView);
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#childObservationSearch")) {
    childObservationSearch = event.target.value;
    renderChildManagement();
  }
  if (event.target.matches("#childObservationDate")) {
    childObservationDateFilter = event.target.value;
    renderChildManagement();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("#childObservationArea")) {
    childObservationAreaFilter = event.target.value;
    renderChildManagement();
  }
  if (event.target.matches("#ticketStatusFilter")) {
    renderAdminTickets();
  }
  if (event.target.matches("[data-ticket-status]")) {
    updateTicket(event.target.dataset.ticketStatus, { status: event.target.value });
  }
});

const modal = document.querySelector("#authModal");
const authTitle = document.querySelector("#authTitle");

document.querySelector("#signinButton").addEventListener("click", () => {
  trackEvent("login_click");
  if (currentUser) {
    setView("account");
    return;
  }
  openAuthModal("login");
});

document.querySelector("#signupButton").addEventListener("click", () => {
  trackEvent("signup_click");
  if (currentUser) {
    setView(isProUser() ? "account" : "plans");
    return;
  }
  openAuthModal("signup");
});

document.querySelector("#closeModal").addEventListener("click", () => {
  closeAuthModal();
});

document.querySelector("#forgotPasswordButton").addEventListener("click", () => setAuthMode("forgot"));

document.querySelector("#switchAuthModeButton").addEventListener("click", () => {
  if (currentAuthMode === "forgot") {
    setAuthMode("login");
    return;
  }
  setAuthMode(currentAuthMode === "signup" ? "login" : "signup");
});

document.querySelector("#closeProModal").addEventListener("click", closeProFeatureModal);

document.querySelector("#proModalUpgrade").addEventListener("click", () => {
  closeProFeatureModal();
  setView("plans");
});

document.querySelector("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#emailInput").value;
  const password = document.querySelector("#passwordInput").value;
  const phone = document.querySelector("#phoneInput").value;
  const submitButton = document.querySelector("#authSubmitButton");
  submitButton.disabled = true;
  setFormMessage("#authMessage", "Working...", true);
  try {
    if (currentAuthMode === "forgot") {
      const message = await sendPasswordReset(email);
      setFormMessage("#authMessage", message, true);
      trackEvent("password_reset_requested");
      closeAuthModal();
      setView("reset-password");
      return;
    }
    if (currentAuthMode === "signup") {
      const result = await signUpWithProvider(email, password, phone);
      loadAccountState(result.email);
      await syncSubscriptionFromBackend(result.email);
      trackEvent("account_signup_complete");
      setFormMessage("#authMessage", result.message || "Account created.", true);
    } else {
      const result = await loginWithProvider(email, password);
      loadAccountState(result.email);
      await syncSubscriptionFromBackend(result.email);
      trackEvent("account_login_complete");
    }
    closeAuthModal();
    setView("account");
  } catch (error) {
    setFormMessage("#authMessage", friendlyAuthError(error));
  } finally {
    submitButton.disabled = false;
  }
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches("#adminUnlockForm")) return;
  event.preventDefault();
  const form = new FormData(event.target);
  const email = form.get("adminEmail");
  const password = form.get("adminPassword");
  const code = form.get("adminCode");
  const message = document.querySelector("#adminUnlockMessage");
  const button = event.target.querySelector("button[type='submit']");
  button.disabled = true;
  if (message) {
    message.textContent = "Checking owner login...";
    message.classList.add("success");
  }
  try {
    const session = await adminLogin(email, password, code);
    setAdminSession(session);
    trackEvent("admin_unlocked", { email: session.email, mode: session.mode || "server" });
    renderAdminDashboard();
    return;
  } catch (error) {
    if (message) {
      message.textContent = error.message || "Admin login failed.";
      message.classList.remove("success");
    }
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const editId = form.get("id");
  const file = form.get("file");
  const preview = form.get("preview");
  const existingItem = editId ? uploadedResources().find((item) => item.id === editId) : null;
  const fileData = file?.name ? await fileToDataUrl(file) : existingItem?.fileData || "";
  const previewData = preview?.name ? await fileToDataUrl(preview) : existingItem?.previewData || "";
  const tags = String(form.get("tags") || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const uploaded = {
    id: editId || `upload-${Date.now()}`,
    category: form.get("category"),
    title: form.get("title"),
    age: form.get("age"),
    plan: form.get("plan"),
    month: "June",
    tags: ["Uploaded", ...tags],
    format: file?.name ? "Uploaded File" : "Manual Resource",
    fileName: file?.name || existingItem?.fileName || "",
    fileData,
    previewName: preview?.name || existingItem?.previewName || "",
    previewData,
    description: form.get("description") || "New uploaded resource.",
  };
  const savedUploads = uploadedResources();
  const updatedUploads = editId
    ? savedUploads.map((item) => item.id === editId ? uploaded : item)
    : [...savedUploads, uploaded];
  saveUploadedResources(updatedUploads);
  resetAdminForm();
  renderAdminDashboard();
});

document.querySelectorAll(".support-form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSupportTicket(event.currentTarget);
  });
});

document.querySelector("#leadCaptureForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  saveLead(new FormData(form).get("email"), "Free Daycare Starter Pack");
  form.reset();
  const button = form.querySelector("button");
  if (button) {
    button.textContent = "Starter Pack Saved";
    setTimeout(() => {
      button.textContent = "Send Starter Pack";
    }, 1400);
  }
});

document.querySelector("#adminCancelEdit").addEventListener("click", resetAdminForm);

document.querySelector("#adminAddDemo").addEventListener("click", addDemoAdminResource);

document.querySelector("#adminSearchInput").addEventListener("input", renderAdminDashboard);

document.querySelector("#adminCategoryFilter").addEventListener("change", renderAdminDashboard);

document.querySelector("#demoAccountButton").addEventListener("click", () => {
  loadAccountState("demo@littlelearnerhub.com");
  renderAccountPage();
});

document.querySelector("#accountUpgradeButton").addEventListener("click", () => {
  if (!currentUser) {
    openAuthModal("signup");
    return;
  }
  setView(isProUser() ? "billing" : "upgrade");
});

document.querySelector("#accountCancelButton").addEventListener("click", () => {
  setView("cancel-subscription");
});

document.querySelector("#signOutButton").addEventListener("click", signOut);

document.querySelector("#resendVerificationButton").addEventListener("click", async () => {
  setFormMessage("#profileSettingsMessage", "Sending...", true);
  try {
    const message = await resendVerificationEmail();
    setFormMessage("#profileSettingsMessage", message, true);
    renderAccountPage();
  } catch (error) {
    setFormMessage("#profileSettingsMessage", friendlyAuthError(error));
  }
});

document.querySelector("#profileSettingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentUser) {
    setFormMessage("#profileSettingsMessage", "Please log in before saving account settings.");
    openAuthModal("login");
    return;
  }
  const phone = new FormData(event.target).get("phone");
  updateAccount(currentUser, { phone: String(phone || "").trim() });
  setFormMessage("#profileSettingsMessage", "Profile saved.", true);
  renderAccountPage();
});

document.querySelector("#changePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const button = event.target.querySelector("button[type='submit']");
  button.disabled = true;
  setFormMessage("#changePasswordMessage", "Updating...", true);
  try {
    const message = await changePassword(form.get("currentPassword"), form.get("newPassword"));
    event.target.reset();
    setFormMessage("#changePasswordMessage", message, true);
  } catch (error) {
    setFormMessage("#changePasswordMessage", friendlyAuthError(error));
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#resetPasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button[type='submit']");
  button.disabled = true;
  setFormMessage("#resetPasswordMessage", "Saving...", true);
  try {
    const message = await confirmPasswordResetFromLink(new FormData(event.target).get("newPassword"));
    event.target.reset();
    setFormMessage("#resetPasswordMessage", message, true);
    setAuthMode("login");
  } catch (error) {
    setFormMessage("#resetPasswordMessage", friendlyAuthError(error));
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#aiChatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const promptBox = document.querySelector("#aiPrompt");
  const prompt = promptBox.value.trim();
  if (!prompt) return;
  if (!canUseAi()) {
    addAiMessage("assistant", aiLimitMessage());
    return;
  }
  addAiMessage("user", prompt);
  addAiMessage("assistant", generateFromPrompt(prompt));
  recordAiUse();
  promptBox.value = "";
});

document.querySelector("#preferencesForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const prefs = collectFormData(event.currentTarget);
  localStorage.setItem("llhPreferences", JSON.stringify(prefs));
  renderSavedPreferences();
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches("#activeGeneratorForm")) return;
  event.preventDefault();
  const toolId = event.target.dataset.generator;
  if (!canUseAi()) {
    document.querySelector("#outputTitle").textContent = "AI Limit Reached";
    document.querySelector("#generatorOutput").textContent = aiLimitMessage();
    return;
  }
  const data = collectFormData(event.target);
  const title = aiTools.find((tool) => tool.id === toolId)?.title || "Generated Result";
  document.querySelector("#outputTitle").textContent = title.replace("AI ", "");
  document.querySelector("#generatorOutput").textContent = "Generating...";
  try {
    const result = await generateToolOutputWithBackend(toolId, data);
    document.querySelector("#generatorOutput").textContent = result.output;
    recordAiUse();
  } catch (error) {
    document.querySelector("#outputTitle").textContent = "AI Generation Error";
    document.querySelector("#generatorOutput").textContent = error.message || "AI generation could not be completed.";
  }
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#futureToolForm")) return;
  event.preventDefault();
  const toolId = event.target.dataset.future;
  const tool = futureTools.find((item) => item.id === toolId) || futureTools[0];
  const data = collectFormData(event.target);
  const output = generateFutureToolOutput(toolId, data);
  document.querySelector("#futureOutputTitle").textContent = tool.title;
  document.querySelector("#futureOutput").textContent = output;
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#weeklyPlannerForm")) return;
  event.preventDefault();
  const planner = collectPlannerData(event.target);
  saveWeeklyPlanner(planner);
  renderWeeklyPlanner();
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#observationEditForm")) return;
  event.preventDefault();
  const data = collectFormData(event.target);
  const existing = resources.find((item) => item.id === data.id);
  if (!existing) return;
  const edits = observationEdits();
  const tags = Array.from(new Set([data.area, "Observation Wording", "Next Steps", "Learning Standard"]));
  edits[data.id] = {
    title: data.title,
    tags,
    description: data.observationText,
    observationText: data.observationText,
    lookFor: data.lookFor,
    nextSteps: data.nextSteps,
    standard: data.standard,
  };
  saveObservationEdits(edits);
  resources = loadResources();
  activeObservationEditId = "";
  renderCategoryPage("observations");
  renderHome();
});

document.addEventListener("submit", async (event) => {
  if (!event.target.matches("#childProfileForm")) return;
  event.preventDefault();
  if (!isProUser() && childStore("Profiles").length >= freeChildProfileLimit) {
    showProFeatureModal(`Free plan includes up to ${freeChildProfileLimit} child profiles. Upgrade to Pro for unlimited child profiles.`);
    return;
  }
  const form = event.target;
  const data = collectFormData(form);
  const photoFile = new FormData(form).get("photo");
  const photo = photoFile?.name ? await fileToDataUrl(photoFile) : "";
  const child = {
    id: `child-${Date.now()}`,
    name: data.name,
    ageGroup: data.ageGroup,
    dob: data.dob,
    enrollmentDate: data.enrollmentDate,
    parentInfo: data.parentInfo,
    emergency: data.emergency,
    allergies: data.allergies,
    medical: data.medical,
    photo,
    notes: data.notes,
    createdAt: new Date().toISOString(),
  };
  const children = childStore("Profiles");
  saveChildStore("Profiles", [...children, child]);
  selectedChildId = child.id;
  localStorage.setItem("llhSelectedChild", selectedChildId);
  form.reset();
  renderChildManagement();
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#childObservationForm")) return;
  event.preventDefault();
  const data = collectFormData(event.target);
  appendChildRecord("Observations", data);
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#supportPlanForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Individual child support plans are a Pro feature.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("SupportPlans", { ...data, title: `${data.area} Support Plan`, summary: `${data.goal} ¬∑ ${data.status}` });
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#childGoalForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Development goal tracking is a Pro feature.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("Goals", data);
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#differentiationForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Lesson plan differentiation is a Pro feature.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("Differentiations", { ...data, title: data.wholeGroup || "Lesson Support", summary: data.support });
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#attendanceForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Attendance tracking is a Pro feature.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("Attendance", { ...data, title: `${data.date} ¬∑ ${data.status}`, summary: `Drop-off: ${data.dropoff || "not entered"} ¬∑ Pick-up: ${data.pickup || "not entered"}` });
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#mealTrackingForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Meal tracking is a Pro feature.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("Meals", { ...data, title: `Meals ¬∑ ${data.date}`, summary: `Breakfast: ${data.breakfast || ""} ¬∑ Lunch: ${data.lunch || ""} ¬∑ Snack: ${data.snack || ""}` });
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#communicationForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Parent communication tools are Pro features.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("Communications", { ...data, title: `${data.type} ¬∑ ${data.date}`, summary: data.message });
});

installMobileNavigation();

if (currentUser) {
  loadAccountState(currentUser);
} else {
  updateAuthButtons();
  updatePlanLabel();
}
renderHome();

function initialViewFromLocation() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "resetPassword") return "reset-password";
  const pathView = adRouteMap[window.location.pathname];
  const hashView = adRouteMap[window.location.hash];
  return pathView || hashView || "home";
}

async function initializeAppView() {
  const handledCheckoutReturn = await verifyStripeReturnIfNeeded();
  if (handledCheckoutReturn) return;
  if (currentUser) {
    await syncSubscriptionFromBackend(currentUser);
  }
  const initialView = initialViewFromLocation();
  if (initialView !== "home") {
    const route = window.location.pathname || window.location.hash;
    saveAttribution({ route, view: initialView });
    trackEvent("ad_route_visit", { route, view: initialView });
    setView(initialView);
  }
}

initializeAppView();
