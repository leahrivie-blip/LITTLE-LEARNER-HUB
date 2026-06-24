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
    detail: "Create daily, weekly, or monthly lesson plans with objectives, materials, and activity steps — all age-appropriate.",
    fields: [
      ["age", "Age Group", "select", ["Infant", "Young Toddler", "Older Toddler", "Preschool", "School Age"]],
      ["planLength", "Plan Type", "select", ["Daily", "Weekly", "Monthly"]],
      ["theme", "Theme", "text", "Farm"],
      ["days", "Number of Days", "select", ["3", "5", "10"]],
      ["focus", "Learning Focus", "text", "colors, animals, fine motor, language"],
      ["goals", "Developmental Goals", "textarea", "language development, fine motor, social-emotional, curiosity"],
      ["materials", "Materials Already Available", "textarea", "paper, crayons, blocks, music, books, sensory bin"],
      ["providerNotes", "Provider Notes (optional)", "textarea", ""],
    ],
  },
  {
    id: "observation",
    title: "AI Observation Generator",
    detail: "Turn a quick note into professional, standards-aligned childcare documentation.",
    fields: [
      ["childName", "Child Name", "text", "Child"],
      ["childAge", "Child Age", "text", "2 years 6 months"],
      ["age", "Age Group", "select", ["Infant", "Young Toddler", "Older Toddler", "Preschool", "School Age"]],
      ["note", "What You Observed", "textarea", "Child stacked 5 blocks and said 'tower!' when finished."],
      ["area", "Developmental Area", "select", ["Cognitive", "Language", "Literacy", "Social Emotional", "Fine Motor", "Gross Motor", "Math", "Science", "Self Help", "Creative Arts", "Approaches to Learning"]],
      ["context", "Context / Setting", "text", "Free play at the block area"],
      ["concern", "Developmental Concern or Goal (optional)", "text", ""],
      ["nextStep", "Next Step Goal", "text", "Offer sorting and counting with blocks"],
      ["providerNotes", "Provider Notes (optional)", "textarea", ""],
    ],
  },
  {
    id: "newsletter",
    title: "AI Newsletter Generator",
    detail: "Make a warm, polished parent newsletter for the month — ready to send.",
    fields: [
      ["programName", "Program Name", "text", "Little Learner Home Daycare"],
      ["month", "Month", "text", "July"],
      ["theme", "Theme", "text", "Summer fun"],
      ["ageGroups", "Ages in Your Program", "text", "Infants, toddlers, preschoolers"],
      ["highlights", "What We Have Been Learning", "textarea", ""],
      ["dates", "Important Dates", "textarea", "Closed July 4, water day every Friday"],
      ["reminders", "Parent Reminders", "textarea", "Please bring labeled sunscreen, extra clothes, and a water bottle."],
      ["providerNotes", "Provider Notes (optional)", "textarea", ""],
    ],
  },
  {
    id: "daily",
    title: "AI Daily Report Generator",
    detail: "Turn daily notes into a warm, personalized parent-ready report.",
    fields: [
      ["programName", "Program Name", "text", "Little Learner Home Daycare"],
      ["date", "Date", "text", ""],
      ["childName", "Child Name", "text", "Your child"],
      ["childAge", "Child Age", "text", "2 years"],
      ["age", "Age Group", "select", ["Infant", "Young Toddler", "Older Toddler", "Preschool", "School Age"]],
      ["meals", "Meals / Feeding", "textarea", "Ate most of lunch and snack"],
      ["diapering", "Diapering / Toileting", "text", "Dry checks, diaper changes, or potty attempts noted"],
      ["nap", "Nap / Rest Time", "text", "Rested 12:30-2:00"],
      ["mood", "Mood", "select", ["Happy and engaged", "Calm", "Busy and curious", "Needed extra comfort", "Energetic", "Tired", "Fussy"]],
      ["highlights", "Highlights", "textarea", "Played with blocks, listened during story time"],
      ["learning", "Learning Moment", "textarea", ""],
      ["notes", "Parent Notes", "textarea", "Please bring extra clothes tomorrow."],
      ["tone", "Report Tone", "select", ["Warm and friendly", "Professional", "Detailed", "Short and sweet"]],
    ],
  },
  {
    id: "handbook",
    title: "AI Parent Handbook Builder",
    detail: "Build professional parent handbook policy sections from your daycare details.",
    fields: [
      ["program", "Program Name", "text", "Little Learner Home Daycare"],
      ["tuition", "Tuition Policy", "textarea", "Tuition is due each Monday."],
      ["sick", "Sick Policy", "textarea", "Children must stay home with fever, vomiting, diarrhea, or contagious illness."],
      ["pickup", "Pick-up and Drop-off", "textarea", "Parents sign children in and out daily."],
      ["discipline", "Guidance Policy", "textarea", "We use positive guidance, redirection, choices, and calm support."],
      ["closures", "Closures/Vacation", "textarea", "Families will receive notice of planned closures in advance."],
      ["state", "State-Specific Notes", "textarea", "Add licensing rules, required notices, or state policy wording to review."],
      ["tone", "Handbook Tone", "select", ["Warm and welcoming", "Professional", "Detailed and thorough"]],
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
    detail: "Generate safe, age-appropriate activities with materials, instructions, learning goals, and safety notes.",
    fields: [
      ["age", "Age Group", "select", ["Infant", "Young Toddler", "Older Toddler", "Preschool", "School Age"]],
      ["childName", "Child Name (optional)", "text", ""],
      ["theme", "Theme or Topic", "text", "Ocean"],
      ["skill", "Learning Skill or Goal", "text", "fine motor"],
      ["developmentalArea", "Developmental Area", "select", ["Fine Motor", "Gross Motor", "Cognitive", "Language", "Social Emotional", "Sensory", "Creative Arts", "STEM", "Self Help"]],
      ["concern", "Developmental Concern or Goal (optional)", "text", ""],
      ["materials", "Materials Available", "textarea", "tray, tongs, pom poms, picture cards"],
      ["providerNotes", "Provider Notes (optional)", "textarea", ""],
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
    title: "AI Behavior Support Generator",
    detail: "Create professional behavior support plans with strategies, parent wording, and age-appropriate next steps.",
    fields: [
      ["programName", "Program Name", "text", "Little Learner Home Daycare"],
      ["childName", "Child Name", "text", "Child"],
      ["childAge", "Child Age", "text", "3 years"],
      ["age", "Age Group", "select", ["Infant", "Young Toddler", "Older Toddler", "Preschool", "School Age"]],
      ["concern", "Behavior Concern", "text", "Difficulty with transitions, hitting when frustrated"],
      ["incident", "What Happened", "textarea", "Child hit a peer during cleanup time."],
      ["trigger", "Behavior Trigger (if known)", "text", "Transition from play to cleanup"],
      ["support", "Support Given", "textarea", "Comforted both children, used calm words, redirected to a turn-taking activity."],
      ["goal", "Developmental Goal or Skill to Build", "text", "Learn to express frustration with words"],
      ["plan", "Follow-up Plan", "textarea", "Practice sharing language and offer visual schedule for transitions."],
      ["tone", "Parent Message Tone", "select", ["Warm and professional", "Brief and factual", "Supportive and detailed"]],
      ["providerNotes", "Provider Notes (optional)", "textarea", ""],
    ],
  },
  {
    id: "incident",
    title: "AI Incident Report Generator",
    detail: "Create a professional, factual incident report with documentation, response, and parent notification wording.",
    fields: [
      ["programName", "Program Name", "text", "Little Learner Home Daycare"],
      ["date", "Date and Time of Incident", "text", ""],
      ["childName", "Child Name", "text", "Child"],
      ["childAge", "Child Age", "text", "2 years"],
      ["age", "Age Group", "select", ["Infant", "Young Toddler", "Older Toddler", "Preschool", "School Age"]],
      ["incident", "What Happened", "textarea", "Child fell from the step and scraped their knee."],
      ["trigger", "What Happened Before (Trigger)", "textarea", "Playing near the climbing area, lost balance."],
      ["response", "Immediate Response Given", "textarea", "Comforted child, cleaned and bandaged scrape, monitored for 30 minutes."],
      ["witnesses", "Witnesses or Others Present", "text", "Provider and 2 other children"],
      ["nextSteps", "Next Steps or Follow-Up", "textarea", "Contacted parent, reviewed climbing area safety."],
      ["tone", "Parent Notification Tone", "select", ["Factual and professional", "Warm and reassuring", "Detailed"]],
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
    detail: "Write professional, ready-to-send parent communication for updates, reminders, and sensitive conversations.",
    fields: [
      ["programName", "Program Name", "text", "Little Learner Home Daycare"],
      ["childName", "Child Name (optional)", "text", ""],
      ["topic", "Message Topic", "text", "Late pickup reminder"],
      ["details", "Details", "textarea", "Parent has arrived late twice this week. Keep tone respectful."],
      ["tone", "Tone", "select", ["Warm and clear", "Firm and professional", "Gentle and supportive", "Friendly reminder", "Detailed update"]],
      ["audience", "Message Type", "select", ["Parent-facing", "Provider-only documentation"]],
      ["providerNotes", "Provider Notes (optional)", "textarea", ""],
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

const observationCategories = [
  "Social Emotional",
  "Language & Literacy",
  "Cognitive Development",
  "Fine Motor",
  "Gross Motor",
  "Physical Development",
  "Creative Arts",
  "Approaches to Learning",
];
const developmentalAreas = observationCategories;
const weeklyObservationsPerChild = 3;
const childDataKeys = ["Profiles", "Observations", "SupportPlans", "Goals", "Differentiations", "Attendance", "Meals", "Reports", "Communications"];
const plannerDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
let selectedChildId = localStorage.getItem("llhSelectedChild") || "";
let childObservationSearch = "";
let childObservationAreaFilter = "All";
let childObservationDateFilter = "";
let activePortfolioChildId = "";
let childPortfolioSearch = "";
let childPortfolioAreaFilter = "All";
let childPortfolioDateFilter = "";
let activeObservationEditId = "";
let childManagementMode = "list";
let childProfileTab = "overview";
let childToolsTab = "attendance";
let activeChildObservationEditId = "";
let activeChildProfileEditId = "";
let pendingObservationArea = "";
let activeObservationChildLock = "";
let pendingGoalArea = "";
let activeSupportCategoryId = "";
let activeSupportTopicId = "";
let activeSupportTab = "why";
let activeSupportChildId = selectedChildId;
let supportCenterSearch = "";
let childCloudSaveTimer = null;
let childCloudSyncing = false;

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
    id: "form-home-daycare-mega-bundle",
    category: "Forms Library",
    title: "Home Daycare Forms Mega Bundle",
    age: "All Ages",
    plan: "Pro",
    month: "All Year",
    tags: ["Home Daycare", "Enrollment Forms", "Medical Forms", "Daily Forms", "Business Forms", "Parent Communication", "Safety Forms", "Editable", "PDF", "In-App"],
    format: "In-App Printable + PDF",
    description: "A complete home daycare forms packet with enrollment, tuition, parent agreements, emergency, medical, daily report, communication, and business forms.",
    customContent: homeDaycareFormsMegaBundleContent(),
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
    tags: ["Letters", "Tracing", "Worksheets", "PDF Ready"],
    format: "Worksheet PDF",
    description: "Printable letter practice pages for early writing and fine motor skills.",
    pdfReady: true,
    pdfFileName: "preschool-letter-tracing-pack.pdf",
  },
  {
    id: "printable-shapes",
    category: "Printables",
    title: "Toddler Shapes Coloring Pages",
    age: "Toddler",
    plan: "Free",
    month: "June",
    tags: ["Shapes", "Coloring", "Printables", "PDF Ready"],
    format: "Worksheet PDF",
    description: "Simple shape coloring pages for toddlers and young preschoolers.",
    pdfReady: true,
    pdfFileName: "toddler-shapes-coloring-pages.pdf",
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
const printableTypes = ["Infant Activity Guide", "Tracing Worksheets", "Coloring Pages", "Alphabet Practice", "Number Practice", "Shape Practice", "Name Writing", "Cutting Practice", "Matching Activities", "Seasonal Worksheets", "Holiday Worksheets"];
const professionalPrintableTypes = ["Infant Activity Guide", "Tracing Worksheets", "Coloring Pages", "Alphabet Practice", "Number Practice", "Shape Practice", "Name Writing", "Cutting Practice", "Matching Activities", "Assessment Forms", "Seasonal Worksheets", "Holiday Worksheets"];
const printableQualityBlockedTerms = ["placeholder", "draw here", "blank box", "coming soon", "lorem ipsum", "unfinished", "ai draft", "ai-generated"];
const printablePdfLimit = Number.POSITIVE_INFINITY;
// Set to true to temporarily hide the user-facing printables library while the section is being refreshed.
// Admins always retain full access. Flip back to false to re-enable for users.
const PRINTABLES_HIDDEN = true;

function isPrintablesUpgradeModeActive() {
  return PRINTABLES_HIDDEN && !hasAdminFullAccess();
}

function isResourceVisibleToCurrentUser(resource) {
  if (!resource) return false;
  if (resource.category === "Printables" && isPrintablesUpgradeModeActive()) return false;
  return true;
}

function isCategoryVisibleToCurrentUser(category) {
  return !(category === "Printables" && isPrintablesUpgradeModeActive());
}

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

function homeDaycareFormsMegaBundleContent() {
  return [
`HOME DAYCARE FORMS MEGA BUNDLE
Editable and printable childcare forms for home daycare providers, family child care homes, and small childcare programs.

What's included:
- Enrollment packet
- Child information and development forms
- Parent and guardian information forms
- Emergency contact and authorized pick-up forms
- Medical, allergy, immunization, and emergency medical authorization forms
- Tuition and financial agreements
- Parent handbook and policy acknowledgments
- Incident, accident, medication, attendance, and daily report forms
- Meal, diaper, potty, health, communication, and parent conference forms
- Photo, field trip, transportation, sunscreen, water play, supply, and business forms

Who it's for:
Home daycare providers, family child care homes, childcare centers, preschool teachers, and program owners who need organized family paperwork that can be viewed, printed, saved as PDF, and customized for their own program.

How to use it:
1. Add your program name, provider name, phone, email, address, rates, hours, and policy details.
2. Print the forms you need or save selected pages as a PDF.
3. Review all family-facing forms with the parent or guardian before signatures.
4. Keep signed forms in the child's file.
5. Confirm all language with your state licensing rules and your own parent handbook before use.

Printing tips:
- Print enrollment packets single-sided for signatures and scanning.
- Print daily reports, logs, and trackers in multiples and keep them on a clipboard or in a binder.
- Print emergency cards on cardstock and keep copies near exits, travel bags, and emergency binders.
- Use Print / Save PDF in Little Learner Hub to create a polished copy.`,

`ENROLLMENT PACKET
Use this packet before the child's first day of care.

Enrollment checklist:
[ ] Welcome letter reviewed
[ ] Child information form completed
[ ] Child development information completed
[ ] Parent/guardian information completed
[ ] Emergency contact form completed
[ ] Authorized pick-up form completed
[ ] Medical information form completed
[ ] Allergy information form completed
[ ] Immunization verification completed
[ ] Emergency medical authorization signed
[ ] Tuition agreement signed
[ ] Parent handbook receipt signed
[ ] Permission forms completed

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`WELCOME LETTER
Dear Families,

Thank you for choosing our childcare program. We are honored that you have entrusted us with the care and education of your child. Our goal is to provide a safe, nurturing, and developmentally appropriate environment where children can learn, grow, play, and feel loved.

Please complete all enrollment forms and return them before your child's first day of care. If any information changes during the year, please let the provider know right away so records stay current.

Provider Name: __________________________________________
Program Name: ___________________________________________
Phone: ___________________________________________________
Email: ___________________________________________________
Date: ____________________________________________________`,

`CHILD INFORMATION FORM
Child Full Name: _________________________________________
Preferred Name: __________________________________________
Date of Birth: ___________________________________________
Age: _____________________________________________________
Primary Language: ________________________________________
Home Address: ____________________________________________

Favorite foods: __________________________________________
Favorite toys/activities: ________________________________
Comfort items: ___________________________________________
Foods disliked: __________________________________________
Known allergies: _________________________________________
Medical notes: ___________________________________________

Other important child information:
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________`,

`CHILD DEVELOPMENT AND ROUTINES QUESTIONNAIRE
Has your child previously attended childcare? [ ] Yes  [ ] No
Does your child receive special services? [ ] Yes  [ ] No

Communication style:
________________________________________________________________________

Social development:
________________________________________________________________________

Toileting status:
________________________________________________________________________

Usual nap time and average nap length:
________________________________________________________________________

Parent goals for child:
________________________________________________________________________
________________________________________________________________________

What would you like us to know about your child?
________________________________________________________________________
________________________________________________________________________`,

`PARENT / GUARDIAN INFORMATION
Parent / Guardian #1
Name: ____________________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
Email: ___________________________________________________
Employer: ________________________________________________
Work Phone: ______________________________________________

Parent / Guardian #2
Name: ____________________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
Email: ___________________________________________________
Employer: ________________________________________________
Work Phone: ______________________________________________`,

`EMERGENCY CONTACT FORM
Emergency Contact #1
Name: ____________________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
Authorized Pick-Up? [ ] Yes  [ ] No

Emergency Contact #2
Name: ____________________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
Authorized Pick-Up? [ ] Yes  [ ] No

Emergency Contact #3
Name: ____________________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
Authorized Pick-Up? [ ] Yes  [ ] No`,

`AUTHORIZED PICK-UP FORM
Authorized Person #1
Name: ____________________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
ID Checked By: ___________________________________________

Authorized Person #2
Name: ____________________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
ID Checked By: ___________________________________________

Authorized Person #3
Name: ____________________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
ID Checked By: ___________________________________________

Restricted individuals:
________________________________________________________________________
________________________________________________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`MEDICAL INFORMATION FORM
Child Full Name: _________________________________________
Date of Birth: ___________________________________________
Primary Physician: _______________________________________
Physician Phone Number: _________________________________
Physician Address: _______________________________________
Preferred Hospital: ______________________________________
Insurance Provider: ______________________________________
Policy Number: ___________________________________________
Medical Conditions: ______________________________________
Daily Medication: ________________________________________
Special Care Instructions:
________________________________________________________________________
________________________________________________________________________`,

`ALLERGY INFORMATION FORM
Child Full Name: _________________________________________
Date of Birth: ___________________________________________

Food allergies:
________________________________________________________________________

Medication allergies:
________________________________________________________________________

Environmental allergies:
________________________________________________________________________

Insect allergies:
________________________________________________________________________

Symptoms / reactions:
________________________________________________________________________

Emergency medication needed:
________________________________________________________________________

Emergency response plan:
________________________________________________________________________
________________________________________________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`IMMUNIZATION RECORD VERIFICATION FORM
Child Full Name: _________________________________________
Date of Birth: ___________________________________________

[ ] Up-to-date on required immunizations
[ ] Approved immunization schedule
[ ] Medical exemption
[ ] Religious exemption

Physician Name: __________________________________________
Clinic Name: _____________________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`EMERGENCY MEDICAL AUTHORIZATION
In the event of an emergency, I authorize the childcare provider to seek emergency medical care for my child if I cannot be reached immediately.

Child Name: ______________________________________________
Parent/Guardian Name: ____________________________________
Preferred Hospital: ______________________________________
Insurance Provider: ______________________________________
Policy Number: ___________________________________________
Emergency Contact Phone: _________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`TUITION AND FINANCIAL AGREEMENT PACKET
Use this packet to document payment expectations and prevent confusion.

Tuition agreement:
Child Full Name: _________________________________________
Enrollment Date: _________________________________________
Weekly Tuition Rate: $____________________________________
Monthly Tuition Rate: $___________________________________
Registration Fee: $_______________________________________
Supply Fee: $_____________________________________________
Other Fees: $_____________________________________________

Payment schedule:
[ ] Weekly
[ ] Bi-weekly
[ ] Monthly
Payment Due Date: ________________________________________
Accepted Payment Methods: [ ] Cash  [ ] Check  [ ] Money Order  [ ] Electronic Payment  [ ] Child Care Subsidy

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`LATE PAYMENT, RETURNED PAYMENT, AND VACATION POLICIES
Late payment policy:
A late fee may be assessed for payments received after the due date.
Late Fee Amount: $________________________________________
Grace Period: ____________________________________________
Repeated late payments may result in:
[ ] Written warning
[ ] Suspension of services
[ ] Termination of services

Returned payment policy:
Returned checks or failed electronic payments may be subject to additional fees.
Returned Payment Fee: $___________________________________
Number of Returned Payments Allowed: _____________________

Vacation / absence policy:
I understand that tuition reserves my child's enrollment space. Tuition remains due during:
[ ] Child illness
[ ] Family vacations
[ ] Temporary absences
[ ] Provider holidays
[ ] Weather closures
[ ] Emergency closures

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`WITHDRAWAL NOTICE FORM
Parent/Guardian Name: ____________________________________
Child Name: ______________________________________________
Last Day of Care Requested: ______________________________

Reason for withdrawal:
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Balance Due / Credit: ____________________________________
Items to Return: [ ] Extra clothing  [ ] Bottles/cups  [ ] Medication  [ ] Other: __________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`FINANCIAL RESPONSIBILITY AGREEMENT
I understand that I am financially responsible for:
[ ] Tuition
[ ] Registration fees
[ ] Supply fees
[ ] Late fees
[ ] Returned payment fees
[ ] Outstanding balances

I acknowledge that I have read, understand, and agree to the tuition and financial policies outlined by the childcare program.

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`PARENT AGREEMENTS PACKET
Parent handbook receipt:
I acknowledge that I have received a copy of the Parent Handbook.
Parent Name: _____________________________________________
Child Name: ______________________________________________

Family communication agreement:
I agree to maintain open and respectful communication with the provider.

Behavior guidance acknowledgment:
I understand the program uses positive guidance techniques and does not use prohibited discipline methods.

Illness policy agreement:
I understand the illness exclusion policies and agree to keep my child home when required.

Attendance agreement:
I agree to notify the provider regarding absences, schedule changes, and late arrivals.

Confidentiality agreement:
I understand that family and child information is kept confidential.

Parent responsibilities:
I agree to provide updated contact information, emergency contacts, and required paperwork.

Final parent acknowledgment:
I have read, understand, and agree to comply with all program policies.

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`INCIDENT REPORT FORM
Date: ____________________________________________________
Child Name: ______________________________________________
Time of Incident: ________________________________________

Description of incident:
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Action taken:
________________________________________________________________________
________________________________________________________________________

Parent notified: [ ] Yes  [ ] No
Follow-up needed: [ ] Yes  [ ] No

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`ACCIDENT REPORT FORM
Date: ____________________________________________________
Child Name: ______________________________________________
Time of Accident: ________________________________________
Injury Location: _________________________________________

What happened?
________________________________________________________________________
________________________________________________________________________

First aid provided:
________________________________________________________________________
________________________________________________________________________

Parent notified: [ ] Yes  [ ] No
Further medical care recommended: [ ] Yes  [ ] No

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`MEDICATION AUTHORIZATION FORM
Child Name: ______________________________________________
Medication: ______________________________________________
Dosage: __________________________________________________
Administration Time: _____________________________________
Start Date: ______________________________________________
End Date: ________________________________________________

Special instructions:
________________________________________________________________________
________________________________________________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`EMERGENCY CONTACT CARD
Child Name: ______________________________________________
Parent/Guardian Name: ____________________________________
Parent Phone: ____________________________________________
Emergency Contact: _______________________________________
Emergency Phone: _________________________________________
Preferred Hospital: ______________________________________
Allergies / Medical Notes:
________________________________________________________________________`,

`ATTENDANCE SIGN IN / OUT SHEET
Date: ____________________________________________________

Child Name: ___________________ Time In: ______ Time Out: ______ Signature: ___________________
Child Name: ___________________ Time In: ______ Time Out: ______ Signature: ___________________
Child Name: ___________________ Time In: ______ Time Out: ______ Signature: ___________________
Child Name: ___________________ Time In: ______ Time Out: ______ Signature: ___________________
Child Name: ___________________ Time In: ______ Time Out: ______ Signature: ___________________
Child Name: ___________________ Time In: ______ Time Out: ______ Signature: ___________________
Child Name: ___________________ Time In: ______ Time Out: ______ Signature: ___________________`,

`INFANT DAILY REPORT
Child Name: ______________________________________________
Date: ____________________________________________________
Arrival Time: __________________ Departure Time: __________

Mood Today: [ ] Happy  [ ] Calm  [ ] Sleepy  [ ] Fussy  [ ] Playful

Bottle feedings:
Time / Amount: ___________________________________________
Time / Amount: ___________________________________________
Time / Amount: ___________________________________________

Solid foods:
Breakfast: _______________________________________________
Lunch: ___________________________________________________
Snack: ___________________________________________________

Diapering:
[ ] Wet  [ ] BM  Time: __________
[ ] Wet  [ ] BM  Time: __________
[ ] Wet  [ ] BM  Time: __________

Naps:
Start / End: _____________________________________________
Start / End: _____________________________________________

Learning and activities:
________________________________________________________________________
________________________________________________________________________

Notes for family:
________________________________________________________________________
________________________________________________________________________

Provider Signature: _____________________________________`,

`TODDLER DAILY REPORT
Child Name: ______________________________________________
Date: ____________________________________________________
Arrival Time: __________________ Departure Time: __________

Mood Today: [ ] Happy  [ ] Calm  [ ] Sleepy  [ ] Fussy  [ ] Playful
Breakfast: _______________________________________________
Lunch: ___________________________________________________
Snack: ___________________________________________________
Nap / Rest Time: _________________________________________
Bathroom / Potty Notes: _________________________________

Learning and activities:
________________________________________________________________________
________________________________________________________________________

Notes for family:
________________________________________________________________________
________________________________________________________________________

Provider Signature: _____________________________________`,

`PRESCHOOL DAILY REPORT
Child Name: ______________________________________________
Date: ____________________________________________________
Arrival Time: __________________ Departure Time: __________

Mood Today: [ ] Happy  [ ] Calm  [ ] Sleepy  [ ] Fussy  [ ] Playful
Breakfast: _______________________________________________
Lunch: ___________________________________________________
Snack: ___________________________________________________
Nap / Rest Time: _________________________________________
Bathroom / Potty Notes: _________________________________

Learning and activities:
________________________________________________________________________
________________________________________________________________________

Notes for family:
________________________________________________________________________
________________________________________________________________________

Provider Signature: _____________________________________`,

`MEAL, DIAPER, AND POTTY TRACKING FORMS
Meal tracking:
Child Name: ______________________________________________
Date: ____________________________________________________
Breakfast: _______________________________________________
AM Snack: ________________________________________________
Lunch: ___________________________________________________
PM Snack: ________________________________________________
Notes: ___________________________________________________

Diaper log:
Time: __________ [ ] Wet [ ] BM Notes: ________________________________
Time: __________ [ ] Wet [ ] BM Notes: ________________________________
Time: __________ [ ] Wet [ ] BM Notes: ________________________________
Time: __________ [ ] Wet [ ] BM Notes: ________________________________
Time: __________ [ ] Wet [ ] BM Notes: ________________________________

Potty training log:
Time: __________ [ ] Tried [ ] Potty [ ] Accident Notes: ______________
Time: __________ [ ] Tried [ ] Potty [ ] Accident Notes: ______________
Time: __________ [ ] Tried [ ] Potty [ ] Accident Notes: ______________
Time: __________ [ ] Tried [ ] Potty [ ] Accident Notes: ______________
Time: __________ [ ] Tried [ ] Potty [ ] Accident Notes: ______________`,

`HEALTH AND MEDICAL FORMS
Health medical information:
Child Name: ______________________________________________
Date of Birth: ___________________________________________
Primary Physician: _______________________________________
Medical Conditions: ______________________________________
Preferred Hospital: ______________________________________

Allergy alert:
Child Name: ______________________________________________
Allergy Type: ____________________________________________
Symptoms: ________________________________________________
Emergency Medication: ____________________________________
Emergency Response Plan:
________________________________________________________________________
________________________________________________________________________

Health packet medication authorization:
Child Name: ______________________________________________
Medication Name: _________________________________________
Dosage: __________________________________________________
Administration Time: _____________________________________
Special Instructions:
________________________________________________________________________
________________________________________________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`PARENT COMMUNICATION FORMS
Behavior communication form:
Child Name: ______________________________________________
Date: ____________________________________________________
Behavior Observed:
________________________________________________________________________
What Happened Before?
________________________________________________________________________
Teacher Response:
________________________________________________________________________
Parent Comments:
________________________________________________________________________

Daily communication form:
Child Name: ______________________________________________
Date: ____________________________________________________
Today we worked on:
________________________________________________________________________
Something great from today:
________________________________________________________________________
Reminders / Supplies Needed:
________________________________________________________________________

Parent conference notes:
Child Name: ______________________________________________
Date: ____________________________________________________
Parent/Guardian: _________________________________________
Provider: ________________________________________________
Strengths:
________________________________________________________________________
Goals / Next Steps:
________________________________________________________________________
Family Notes:
________________________________________________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`PARENT CONCERN / FEEDBACK FORM
Parent/Guardian Name: ____________________________________
Child Name: ______________________________________________
Date: ____________________________________________________

Concern / feedback:
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Provider response / follow up:
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`BONUS PERMISSION AND SUPPLY FORMS
Supply checklist:
[ ] Extra clothing
[ ] Diapers / Pull-Ups
[ ] Wipes
[ ] Blanket
[ ] Bottle / Sippy Cup
[ ] Formula / Breast Milk
[ ] Weather-appropriate clothing
[ ] Sunscreen
[ ] Medication forms
[ ] Comfort item
Additional supplies needed:
________________________________________________________________________

Photo release:
I give permission for my child to be photographed during childcare activities.
[ ] Classroom display
[ ] Private parent communication
[ ] Program social media
[ ] Printed materials
[ ] I do not give permission

Field trip permission:
Child Name: ______________________________________________
Field Trip Location: _____________________________________
Date: ____________________________________________________
Departure Time: ______________ Return Time: ______________
I give permission for my child to attend the field trip listed above.

Transportation permission:
I give permission for my child to be transported by the childcare provider for approved childcare activities or emergencies.
Approved Transportation Reasons:
________________________________________________________________________

Sunscreen authorization:
I authorize the provider to apply sunscreen to my child as needed for outdoor play.
Sunscreen Brand / Type: __________________________________
Known Skin Sensitivities: ________________________________

Water play permission:
I give permission for my child to participate in supervised water play activities.
[ ] Sprinklers
[ ] Water tables
[ ] Splash play
[ ] Other approved water activities

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`BONUS BUSINESS AND PROVIDER FORMS
Trial period agreement:
Child Name: ______________________________________________
Trial Start Date: ________________________________________
Trial End Date: __________________________________________
Regular Schedule: ________________________________________
Provider Notes:
________________________________________________________________________
During the trial period, either the provider or parent/guardian may decide the arrangement is not the best fit. Any tuition, notice, or refund terms should follow the provider's written policy.

Rate change notice:
Family / Child Name: _____________________________________
Current Rate: ____________________________________________
New Rate: ________________________________________________
Effective Date: __________________________________________
Reason / Notes:
________________________________________________________________________

Schedule change request:
Child Name: ______________________________________________
Current Schedule: ________________________________________
Requested Schedule: ______________________________________
Requested Start Date: ____________________________________
Reason for Request: ______________________________________
Provider Approval / Notes:
________________________________________________________________________

Absence / vacation request:
Child Name: ______________________________________________
Date(s) Absent: __________________________________________
Reason: __________________________________________________
Will tuition still be due? [ ] Yes  [ ] No  [ ] See policy
Provider Notes:
________________________________________________________________________`,

`PROVIDER BUSINESS TRACKING FORMS
Payment receipt:
Family / Child Name: _____________________________________
Payment Date: ____________________________________________
Amount Paid: $____________________________________________
Payment Method: [ ] Cash  [ ] Check  [ ] Card  [ ] Online  [ ] Other: __________
Payment Period: __________________________________________
Received By: _____________________________________________

Year-end payment summary:
Family / Child Name: _____________________________________
Tax Year: ________________________________________________
Provider / Business Name: ________________________________
Provider Tax ID / EIN: ___________________________________
Total Paid for Childcare: $_______________________________
Provider Signature: ______________________________________
Date: ____________________________________________________

Emergency drill log:
Date: __________ Drill Type: [ ] Fire [ ] Tornado [ ] Lockdown [ ] Other  Time Started: ______ Time Completed: ______ Notes: ______________
Date: __________ Drill Type: [ ] Fire [ ] Tornado [ ] Lockdown [ ] Other  Time Started: ______ Time Completed: ______ Notes: ______________
Date: __________ Drill Type: [ ] Fire [ ] Tornado [ ] Lockdown [ ] Other  Time Started: ______ Time Completed: ______ Notes: ______________

Cleaning and sanitizing checklist:
Tables and eating surfaces: [ ] Daily [ ] Weekly Notes: __________________
High chairs / booster seats: [ ] Daily [ ] Weekly Notes: __________________
Toys and manipulatives: [ ] Daily [ ] Weekly Notes: __________________
Nap mats / bedding: [ ] Daily [ ] Weekly Notes: __________________
Bathroom / potty chairs: [ ] Daily [ ] Weekly Notes: __________________
Entryway / cubbies: [ ] Daily [ ] Weekly Notes: __________________
Outdoor play items: [ ] Daily [ ] Weekly Notes: __________________`,

`SUBSTITUTE CARE AUTHORIZATION
Child Name: ______________________________________________
Approved Substitute Name: ________________________________
Substitute Phone: ________________________________________
Date(s) of Substitute Care: ______________________________
Parent / Guardian Authorization:
________________________________________________________________________
Provider Notes:
________________________________________________________________________

Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`,

`CHILD FILE ANNUAL UPDATE
Use this page once per year to confirm each child's file is current.

[ ] Parent / guardian contact information reviewed
[ ] Emergency contacts reviewed
[ ] Authorized pickup list reviewed
[ ] Medical information reviewed
[ ] Allergies and food restrictions reviewed
[ ] Immunization documentation reviewed
[ ] Current schedule and tuition agreement reviewed
[ ] Photo, field trip, transportation, sunscreen, and water play permissions reviewed

Child Name: ______________________________________________
Review Date: _____________________________________________
Parent / Guardian Signature: _____________________________
Provider Initials: _______________________________________

Provider note:
This bundle is a template and does not replace legal, tax, medical, or licensing advice. Review and customize all forms for your state, licensing agency, and individual business policies before using with families.`
  ].join("\n\n");
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
  return printableTypes.flatMap((type, typeIndex) => lessonThemes.map((theme, index) => {
    const printableNumber = (typeIndex * lessonThemes.length) + index + 1;
    const pdfReady = printableNumber <= printablePdfLimit;
    return {
      id: `printable-${slug(type)}-${slug(theme)}`,
      category: "Printables",
      title: `${theme} ${type}`,
      age: index % 3 === 0 ? "Toddler" : "Preschool",
      plan: index % 9 === 0 ? "Free" : "Pro",
      month: holidays.includes(theme) ? "Holiday" : months[index % months.length],
      tags: [type, theme, holidays.includes(theme) ? "Holiday" : "Seasonal", "Printable", ...(pdfReady ? ["PDF Ready"] : [])],
      format: pdfReady ? "Worksheet PDF" : "PDF",
      description: `Printable ${type.toLowerCase()} for ${theme.toLowerCase()} practice, designed for quick daycare use.`,
      printableNumber,
      pdfReady,
      pdfFileName: `${slug(theme)}-${slug(type)}.pdf`,
    };
  }));
}

const accessRank = { Free: 0, Founding: 1, Pro: 1, Premium: 2 };
const foundingMemberLimit = 50;
const foundingPublicClaimedBase = 4;
let foundingStatusCache = {
  limit: foundingMemberLimit,
  claimed: foundingPublicClaimedBase,
  remaining: foundingMemberLimit - foundingPublicClaimedBase,
  soldOut: false,
  source: "local",
  updatedAt: "",
};
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
    features: ["5 Lesson Plans", "10 Observations", "10 Forms", "10 Activity Ideas", "10 Printables", "10 AI Generations Per Month", "Up to 3 Child Profiles", "Weekly Observation Tracker"],
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
  foundingStatusEndpoint: "/api/founding-status",
  promoValidationEndpoint: "/api/validate-promo-code",
  defaultTrialDays: 90,
  promoExpiresLabel: "October 31, 2026",
};
const aiGenerationConfig = {
  endpoint: "/api/ai-generate",
};
const analyticsConfig = {
  eventEndpoint: "/api/analytics/event",
  adminEndpoint: "/api/admin/analytics",
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
  "Lesson Plans": 5,
  "Observation Hub": 10,
  "Forms Library": 10,
  "Menu Center": 0,
  "Activity Center": 10,
  "Printables": 10,
};
const freeAiMonthlyLimit = 10;
const paidAiMonthlyLimit = 250;
const freeChildProfileLimit = 3;
const freeObservationRecordLimit = 10;
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

// Views that are accessible without being logged in.
// All other views redirect to the login modal for unauthenticated visitors.
const guestAllowedViews = new Set([
  "home", "plans", "upgrade", "legal", "faq", "contact", "admin",
  "reset-password", "payment-success", "payment-failed",
]);

// Human-readable names for pro-only nav items, used in upgrade modal messages.
const proNavLabels = {
  "child-tools-attendance": "Attendance Tracking",
  "child-tools-meals": "Meal Tracking",
  "child-tools-reports": "Daily Reports",
  "child-tools-communication": "Parent Communication",
  portfolio: "Portfolio Builder",
  reports: "Reports & Analytics",
  favorites: "Saved Favorites",
};
const adRouteMap = {
  "/free-daycare-forms": "forms",
  "/daycare-lesson-plans": "lessons",
  "/observation-generator": "ai",
  "/home-daycare-provider-tools": "home",
  "/admin": "admin",
  "#/free-daycare-forms": "forms",
  "#/daycare-lesson-plans": "lessons",
  "#/observation-generator": "ai",
  "#/home-daycare-provider-tools": "home",
  "#/admin": "admin",
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

function saveAnalyticsEvents(events) {
  localStorage.setItem("llhAnalyticsEvents", JSON.stringify(events));
}

function analyticsId(key, prefix) {
  let id = localStorage.getItem(key);
  if (!id) {
    const random = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    id = `${prefix}_${random}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function visitorId() {
  return analyticsId("llhVisitorId", "visitor");
}

function analyticsSessionId() {
  try {
    let id = sessionStorage.getItem("llhSessionId");
    if (!id) {
      const random = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      id = `session_${random}`;
      sessionStorage.setItem("llhSessionId", id);
    }
    return id;
  } catch (error) {
    return analyticsId("llhSessionFallbackId", "session");
  }
}

function trafficSource() {
  const params = new URLSearchParams(window.location.search);
  const utm = params.get("utm_source") || params.get("source");
  if (utm) return utm;
  if (params.get("fbclid")) return "Facebook";
  if (params.get("ttclid")) return "TikTok";
  if (params.get("gclid")) return "Google";
  const referrer = document.referrer || "";
  if (/facebook|instagram/i.test(referrer)) return "Facebook";
  if (/tiktok/i.test(referrer)) return "TikTok";
  if (/google/i.test(referrer)) return "Google";
  if (/bing|yahoo|duckduckgo/i.test(referrer)) return "Search";
  return referrer ? "Referral" : "Direct";
}

function currentAttribution() {
  return readSavedJson("llhAttribution", {});
}

function saveAttribution(detail = {}) {
  const attribution = {
    route: detail.route || window.location.pathname || window.location.hash || "home",
    view: detail.view || "home",
    source: detail.source || trafficSource(),
    firstSeenAt: new Date().toISOString(),
  };
  localStorage.setItem("llhAttribution", JSON.stringify(attribution));
  return attribution;
}

function sendAnalyticsEvent(event) {
  if (!analyticsConfig.eventEndpoint || !canUseLaunchBackend()) return;
  const payload = JSON.stringify({ event });
  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(analyticsConfig.eventEndpoint, new Blob([payload], { type: "application/json" }));
      if (sent) return;
    }
  } catch (error) {
    // Fall back to fetch below.
  }
  fetch(analyticsConfig.eventEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

function trackEvent(name, detail = {}) {
  const attribution = currentAttribution();
  const event = {
    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    detail,
    visitorId: visitorId(),
    sessionId: analyticsSessionId(),
    path: window.location.pathname,
    hash: window.location.hash,
    url: window.location.href,
    pageTitle: document.title,
    referrer: document.referrer || "",
    source: detail.source || attribution.source || trafficSource(),
    user: currentUser || "",
    plan: currentPlan,
    attribution,
    createdAt: new Date().toISOString(),
  };
  saveAnalyticsEvents([event, ...analyticsEvents()]);
  sendAnalyticsEvent(event);
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

function showProFeatureModal(message = "This is a Pro Feature.", type = "feature") {
  const modal = document.querySelector("#proModal");
  const body = document.querySelector("#proModalBody");
  const eyebrow = document.querySelector("#proModalEyebrow");
  const title = document.querySelector("#proModalTitle");
  if (!modal || !body) {
    setView("plans");
    return;
  }
  if (type === "limit") {
    if (eyebrow) eyebrow.textContent = "Free Plan Limit Reached";
    if (title) title.textContent = "You've reached your Free Plan limit.";
    body.innerHTML = `
      <p>${escapeHtml(message)}</p>
      <p>Upgrade to Pro to unlock unlimited child profiles, observations, lesson plans, resources, AI tools, Family Hub features, parent messaging, attendance tracking, and daily reports.</p>
      <p><small>Start a 7-day free trial. Credit card required. You will be charged after 7 days unless you cancel.</small></p>
    `;
  } else {
    if (eyebrow) eyebrow.textContent = "Pro Feature";
    if (title) title.textContent = "This is a Pro Feature";
    body.innerHTML = `
      <p>${escapeHtml(message)}</p>
      <p>Upgrade to Pro to unlock advanced AI tools, portfolio builder, parent messaging, attendance tracking, daily reports, and the full resource library.</p>
      <p><small>Start a 7-day free trial. Credit card required. You will be charged after 7 days unless you cancel.</small></p>
    `;
  }
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeProFeatureModal() {
  const modal = document.querySelector("#proModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function billingStatusIndicatesFree(status = "") {
  const cleanStatus = String(status || "").toLowerCase();
  return cleanStatus.includes("free plan")
    || cleanStatus.includes("cancel")
    || cleanStatus.includes("failed");
}

function billingStatusIndicatesPaid(status = "") {
  const cleanStatus = String(status || "").toLowerCase();
  return cleanStatus.includes("active")
    || cleanStatus.includes("trial")
    || cleanStatus.includes("paid");
}

function normalizeBillingPlan(plan = currentPlan, account = null) {
  const rawPlan = String(account?.plan || plan || "Free").trim();
  const lowerPlan = rawPlan.toLowerCase();
  const status = String(account?.subscriptionStatus || "");
  if (account && billingStatusIndicatesFree(status)) return "Free";
  if (rawPlan === "Founding" || (account?.foundingMember && billingStatusIndicatesPaid(status))) return "Founding";
  if (rawPlan === "Pro" || rawPlan === "Premium" || lowerPlan.includes("pro")) {
    return account && status && !billingStatusIndicatesPaid(status) ? "Free" : "Pro";
  }
  return "Free";
}

function accountHasPaidBilling(account = currentAccount()) {
  if (!account) return false;
  const plan = normalizeBillingPlan(account.plan || currentPlan, account);
  if (plan === "Free") return false;
  const status = String(account.subscriptionStatus || "");
  return billingStatusIndicatesPaid(status) || Boolean(account.stripeSubscriptionId || account.subscriptionStartedAt);
}

function billingPlanLabel(plan = currentPlan, account = plan === currentPlan ? currentAccount() : null) {
  const normalizedPlan = normalizeBillingPlan(plan, account);
  if (normalizedPlan === "Founding") return "Founding Member";
  if (normalizedPlan === "Pro") return "Pro";
  return "Free";
}

function billingPriceLabel(account = currentAccount()) {
  const plan = normalizeBillingPlan(account?.plan || currentPlan, account);
  if (account && !accountHasPaidBilling(account)) return "$0/month";
  if (plan === "Founding" || (account?.foundingMember && accountHasPaidBilling(account))) return "$9.99/month";
  if (account?.subscriptionCadence === "annual") return "$199/year";
  if (plan === "Pro") return "$19.99/month";
  return "$0/month";
}

function foundingMembers() {
  return readSavedJson("llhFoundingMembers", []);
}

function saveFoundingMembers(members) {
  localStorage.setItem("llhFoundingMembers", JSON.stringify([...new Set(members)]));
}

function localFoundingSpotsClaimed() {
  return Math.min(foundingPublicClaimedBase + foundingMembers().length, foundingMemberLimit);
}

function applyFoundingStatus(status = {}) {
  const limit = Number(status.limit || foundingMemberLimit);
  const localClaimed = localFoundingSpotsClaimed();
  const claimed = Math.min(Math.max(Number(status.claimed ?? localClaimed), localClaimed), limit);
  const remaining = Math.max(Number(status.remaining ?? (limit - claimed)), 0);
  foundingStatusCache = {
    ...foundingStatusCache,
    ...status,
    limit,
    claimed,
    remaining,
    soldOut: Boolean(status.soldOut) || remaining <= 0,
    source: status.source || "server",
    updatedAt: new Date().toISOString(),
  };
  return foundingStatusCache;
}

function foundingSpotsClaimed() {
  return Math.min(Number(foundingStatusCache.claimed || localFoundingSpotsClaimed()), foundingMemberLimit);
}

function foundingSpotsRemaining() {
  return Math.max(Number(foundingStatusCache.remaining ?? (foundingMemberLimit - foundingSpotsClaimed())), 0);
}

function foundingProgressPercent() {
  const limit = Number(foundingStatusCache.limit || foundingMemberLimit);
  if (!limit) return 0;
  return Math.min(100, Math.max(0, Math.round((foundingSpotsClaimed() / limit) * 100)));
}

function foundingUrgencyText() {
  const remaining = foundingSpotsRemaining();
  if (remaining <= 0) return "Founding spots are filled. Regular Pro pricing is now active.";
  if (remaining <= 3) return "Almost gone. Regular Pro pricing starts after these last spots.";
  if (remaining <= 10) return "Moving fast. These founding price-lock spots are almost filled.";
  return "Founding spots are filling now. The price changes to regular Pro when all 50 are claimed.";
}

function foundingMeterHtml() {
  const remaining = foundingSpotsRemaining();
  const claimed = foundingSpotsClaimed();
  const limit = Number(foundingStatusCache.limit || foundingMemberLimit);
  const soldOut = remaining <= 0;
  return `
    <div class="spots-meter ${soldOut ? "sold-out" : ""}" aria-label="${soldOut ? "Founding spots filled" : `${claimed} founding spots filled and ${remaining} remaining`}">
      <strong>${soldOut ? "$19.99" : remaining}</strong>
      <span>${soldOut ? "regular Pro monthly" : "spots left"}</span>
      <div class="spots-progress" aria-hidden="true"><span style="width: ${foundingProgressPercent()}%"></span></div>
      <small>${soldOut ? `${limit} of ${limit} filled` : `${claimed} of ${limit} filled`}</small>
      <em>${foundingUrgencyText()}</em>
    </div>
  `;
}

function refreshFoundingDisplays() {
  renderHomeFoundingOffer();
  const activeView = document.querySelector(".active-view")?.id.replace("view-", "");
  if (activeView === "plans") renderPricingPage();
  if (activeView === "upgrade") renderUpgradePage();
  if (activeView === "billing") renderBillingPage();
  if (activeView === "subscription") renderSubscriptionPage();
  if (activeView === "admin") renderAdminDashboard();
}

async function syncFoundingStatus(options = {}) {
  if (!stripeCheckoutConfig.foundingStatusEndpoint || !canUseLaunchBackend()) return foundingStatusCache;
  try {
    const response = await fetch(`${stripeCheckoutConfig.foundingStatusEndpoint}?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Could not load founding status.");
    applyFoundingStatus(data?.founding || data);
    if (options.render) refreshFoundingDisplays();
  } catch (error) {
    console.warn("Founding status sync did not complete", error);
  }
  return foundingStatusCache;
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
      monthlyPrice: "$0/month",
      stripeCustomerId: subscription.stripeCustomerId || "",
      stripeSubscriptionId: subscription.stripeSubscriptionId || "",
      paymentMethod: subscription.paymentMethod || "Managed in Stripe",
      promoRedemptions: accountPromoRedemptions(subscription),
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
    promoRedemptions: accountPromoRedemptions(subscription),
  };
}

async function syncSubscriptionFromBackend(email, options = {}) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !stripeCheckoutConfig.subscriptionStatusEndpoint || !canUseStripeBackend()) return null;
  try {
    const response = await fetch(`${stripeCheckoutConfig.subscriptionStatusEndpoint}?email=${encodeURIComponent(cleanEmail)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Could not sync subscription.");
    if (data?.founding) applyFoundingStatus(data.founding);
    const updates = subscriptionToAccountUpdates(data?.subscription);
    if (!updates) {
      if (options.renderFounding) refreshFoundingDisplays();
      return data;
    }
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
      if (options.renderFounding) refreshFoundingDisplays();
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
  applyFoundingStatus({
    limit: foundingMemberLimit,
    claimed: Math.max(foundingSpotsClaimed(), foundingPublicClaimedBase + members.length),
    remaining: Math.max(foundingMemberLimit - (foundingPublicClaimedBase + members.length), 0),
    source: "local",
  });
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

function normalizedCheckoutPromoCode() {
  return String(checkoutPromoCode || "").trim().replace(/\s+/g, "").toUpperCase();
}

function checkoutPromoSummary() {
  return normalizedCheckoutPromoCode()
    ? "Your promo code will be checked securely before Stripe opens."
    : `Enter a provider promo code before choosing a plan. Codes are private, can be used once per account, and expire ${stripeCheckoutConfig.promoExpiresLabel}.`;
}

function saveCheckoutPromoCode(value) {
  checkoutPromoCode = String(value || "").trim();
  localStorage.setItem("llhCheckoutPromoCode", checkoutPromoCode);
}

function promoStatusElement(panel = document) {
  return panel?.querySelector?.("#checkoutPromoCodeMessage") || document.querySelector("#checkoutPromoCodeMessage");
}

function setPromoCodeMessage(message, success = false, panel = document) {
  const target = promoStatusElement(panel);
  if (!target) return;
  target.textContent = message || "";
  target.classList.toggle("success", Boolean(success));
}

function accountPromoRedemptions(account = currentAccount()) {
  return Array.isArray(account?.promoRedemptions) ? account.promoRedemptions : [];
}

function hasRedeemedCheckoutPromoCode(code = normalizedCheckoutPromoCode(), account = currentAccount()) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return false;
  return accountPromoRedemptions(account).some((item) => String(item?.code || item || "").trim().toUpperCase() === normalized);
}

function markCheckoutPromoRedeemed(code, details = {}) {
  if (!currentUser) return;
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized || hasRedeemedCheckoutPromoCode(normalized)) return;
  const account = currentAccount() || ensureAccount(currentUser);
  updateAccount(currentUser, {
    promoRedemptions: [
      ...accountPromoRedemptions(account),
      {
        code: normalized,
        label: details.label || "",
        trialDays: details.trialDays || 0,
        redeemedAt: new Date().toISOString(),
      },
    ],
  });
}

async function validateCheckoutPromoCode(options = {}) {
  const { quiet = false } = options;
  const code = normalizedCheckoutPromoCode();
  const panel = document.querySelector(".promo-code-panel");
  if (!code) {
    if (!quiet) setPromoCodeMessage("Enter a promo code before checkout.", false, panel);
    return { valid: false, empty: true };
  }
  if (!currentUser) {
    const message = "Log in or create a free account to apply a promo code.";
    if (!quiet) setPromoCodeMessage(message, false, panel);
    if (!quiet) openAuthModal("signup");
    return { valid: false, error: message, requiresAccount: true };
  }
  if (hasRedeemedCheckoutPromoCode(code)) {
    const message = "This account has already used that promo code.";
    if (!quiet) setPromoCodeMessage(message, false, panel);
    return { valid: false, error: message, alreadyUsed: true };
  }
  if (!canUseStripeBackend() || !stripeCheckoutConfig.promoValidationEndpoint) {
    const message = "Promo codes are checked securely during checkout. Please use the live checkout page and try again.";
    if (!quiet) setPromoCodeMessage(message, false, panel);
    return { valid: false, code, error: message };
  }
  try {
    const response = await fetch(stripeCheckoutConfig.promoValidationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, email: currentUser }),
    });
    const data = await response.json();
    if (!response.ok || !data?.valid) {
      throw new Error(data?.error || "That promo code is not active. Check the code and try again.");
    }
    if (!quiet) setPromoCodeMessage(data.message || "Promo accepted. Your free trial will be applied before checkout.", true, panel);
    return data;
  } catch (error) {
    const message = error.message || "That promo code could not be checked. Please try again.";
    if (!quiet) setPromoCodeMessage(message, false, panel);
    return { valid: false, code, error: message };
  }
}

function canUseStripeBackend() {
  if (!window.location.protocol.startsWith("http")) return false;
  if (["4173", "4179"].includes(window.location.port)) return false;
  return true;
}

function canUseLaunchBackend() {
  return canUseStripeBackend();
}

function isPromoLinkActive() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("promo")) return true;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hashParams.has("promo");
}

function requireBillingAccount() {
  if (currentUser) return true;
  openAuthModal("signup");
  return false;
}

let resources = loadResources();
let favorites = readSavedJson("llhFavorites", []);
let savedDownloads = readSavedJson("llhDownloads", []);
let activeGeneratedPdfResource = null;
let currentPlan = localStorage.getItem("llhPlan") || "Free";
let currentUser = localStorage.getItem("llhUser") || "";
let activeFilter = "All";
let currentAuthMode = "login";
let checkoutPromoCode = "";
if (isPromoLinkActive()) {
  checkoutPromoCode = localStorage.getItem("llhCheckoutPromoCode") || "";
} else {
  localStorage.removeItem("llhCheckoutPromoCode");
}
let adminAnalyticsCache = null;
let adminAnalyticsLoading = false;

const searchInput = document.querySelector("#searchInput");
const currentPlanLabel = document.querySelector("#currentPlanLabel");
const homeViewTemplate = document.querySelector("#view-home").innerHTML;
const mobileNavMaxWidth = 820;
const sidebarViewAliases = {
  goals: "children",
  "child-tools": "children",
  "child-tools-attendance": "children",
  "child-tools-meals": "children",
  "child-tools-reports": "children",
  "child-tools-communication": "children",
  portfolio: "tools",
  reports: "children",
  favorites: "account",
  membership: "billing",
  settings: "account",
  help: "contact",
};

const sidebarFutureToolTargets = {
  portfolio: "portfolio",
};

function resolveSidebarView(view) {
  return sidebarViewAliases[view] || view;
}

function childToolTabFromView(view) {
  const map = {
    reports: "reports",
    "child-tools": "attendance",
    "child-tools-attendance": "attendance",
    "child-tools-meals": "meals",
    "child-tools-reports": "reports",
    "child-tools-communication": "communication",
  };
  return map[view] || "";
}

function childToolViewForTab(tab) {
  const map = {
    attendance: "child-tools-attendance",
    meals: "child-tools-meals",
    reports: "child-tools-reports",
    communication: "child-tools-communication",
  };
  return map[tab] || "child-tools-attendance";
}

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
      monthlyPrice: "$0/month",
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
  currentPlan = normalizeBillingPlan(account.plan || (account.foundingMember ? "Founding" : "Free"), account);
  if (currentPlan === "Free" && (account.plan !== "Free" || account.monthlyPrice !== "$0/month")) {
    updateAccount(account.email, {
      plan: "Free",
      subscriptionCadence: "",
      monthlyPrice: "$0/month",
      priceLock: "",
    });
  }
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

function markAccountLogin(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return;
  updateAccount(cleanEmail, {
    lastLoginAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastPlanSeen: currentPlan,
  });
}

function saveCurrentAccountState() {
  if (!currentUser) return;
  const allAccounts = accounts();
  const account = allAccounts[currentUser] || ensureAccount(currentUser);
  const normalizedPlan = normalizeBillingPlan(currentPlan, account);
  const paidBilling = accountHasPaidBilling({ ...account, plan: normalizedPlan });
  allAccounts[currentUser] = {
    ...account,
    plan: normalizedPlan,
    subscriptionStatus: paidBilling
      ? account?.subscriptionStatus || `${billingPlanLabel(normalizedPlan)} Subscription Active`
      : "Free Plan",
    subscriptionCadence: paidBilling ? account?.subscriptionCadence || "" : "",
    monthlyPrice: paidBilling ? account?.monthlyPrice || billingPriceLabel({ ...account, plan: normalizedPlan }) : "$0/month",
    priceLock: paidBilling ? account?.priceLock || "" : "",
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
  phoneField.setAttribute("aria-hidden", mode !== "signup" ? "true" : "false");
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
  updateAdminNavVisibility();
  updateBodyAuthClass();
}

// Keeps body CSS classes in sync with auth + plan state.
// body.user-authenticated — user is logged in
// body.user-pro          — user has Pro or Founding access (subset of authenticated)
function updateBodyAuthClass() {
  document.body.classList.toggle("user-authenticated", Boolean(currentUser));
  document.body.classList.toggle("user-pro", Boolean(currentUser) && isProUser());
}

function updateAdminNavVisibility() {
  document.querySelectorAll("[data-admin-nav]").forEach((button) => {
    button.hidden = !canSeeAdminNav();
  });
  document.querySelectorAll("[data-printables-entry]").forEach((button) => {
    button.hidden = isPrintablesUpgradeModeActive();
  });
}

function canSeeAdminNav() {
  return isAdminUnlocked();
}

function setView(view) {
  const requestedView = view;
  const requestedChildToolTab = childToolTabFromView(view);
  const requestedFutureTool = sidebarFutureToolTargets[requestedView] || "";
  if (requestedChildToolTab) {
    childManagementMode = "tools";
    childToolsTab = requestedChildToolTab;
    activeChildObservationEditId = "";
    activeObservationChildLock = "";
    activePortfolioChildId = "";
  }
  const resolvedView = resolveSidebarView(view);
  // Route guard: unauthenticated visitors may only access public marketing views.
  if (!isLoggedIn() && !hasAdminFullAccess() && !guestAllowedViews.has(resolvedView)) {
    openAuthModal("login");
    return;
  }
  if (resolvedView === "tools" && !isProUser()) {
    showProFeatureModal("Provider business tools are Pro features.");
    return;
  }
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
  document.querySelector(`#view-${resolvedView}`)?.classList.add("active-view");
  document.body.classList.toggle("home-view", resolvedView === "home");
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === requestedView);
  });
  if (viewMap[resolvedView]) renderCategoryPage(resolvedView);
  if (resolvedView === "home") renderHome();
  if (resolvedView === "admin") renderAdminDashboard();
  if (resolvedView === "account") renderAccountPage();
  if (resolvedView === "plans") renderPricingPage();
  if (resolvedView === "upgrade") renderUpgradePage();
  if (resolvedView === "billing") renderBillingPage();
  if (resolvedView === "subscription") renderSubscriptionPage();
  if (resolvedView === "billing-history") renderBillingHistoryPage();
  if (resolvedView === "payment-success") renderPaymentSuccessPage();
  if (resolvedView === "payment-failed") renderPaymentFailedPage();
  if (resolvedView === "cancel-subscription") renderCancelSubscriptionPage();
  if (resolvedView === "reset-password") renderResetPasswordPage();
  if (resolvedView === "contact") renderContactPage();
  if (resolvedView === "ai") renderAiPage();
  if (resolvedView === "generators") renderGeneratorWorkspace("lesson");
  if (resolvedView === "tools") renderFutureTools(requestedFutureTool || undefined);
  if (resolvedView === "children") renderChildManagement();
  if (resolvedView === "support-center") renderSupportCenterPage();
  if (resolvedView === "planner") renderWeeklyPlanner();
  trackEvent("page_view", { view: resolvedView, nav: requestedView });
  updateSidebarDashboard();
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

// Single source-of-truth for "is a real user session active?"
// Always use this instead of checking currentUser directly in feature guards.
function isLoggedIn() {
  return Boolean(currentUser);
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

function childFromSearchQuery(query = "", records = childRecords()) {
  const lower = String(query || "").toLowerCase();
  if (!lower) return null;
  return records.children.find((child) => {
    const name = String(child.name || "").toLowerCase();
    if (!name) return false;
    const first = name.split(/\s+/)[0];
    return lower.includes(name) || (first && lower.includes(first));
  }) || null;
}

function categoryResources(category) {
  const query = searchInput.value.trim().toLowerCase();
  const searchedChild = category === "Lesson Plans" ? childFromSearchQuery(query) : null;
  if (searchedChild) return childLessonRecommendations(searchedChild, childRecords(), 12);
  return resources.filter((resource) => {
    if (!isResourceVisibleToCurrentUser(resource)) return false;
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
  const searchedChild = childFromSearchQuery(query);
  if (searchedChild && query.includes("lesson")) return childLessonRecommendations(searchedChild, childRecords(), 12);
  return resources.filter((resource) => {
    if (!isResourceVisibleToCurrentUser(resource)) return false;
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
  const lessonContext = resource._childRecommendation || null;
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
      ${resource.category === "Lesson Plans" ? `
        <div class="lesson-card-context">
          ${lessonContext ? `<strong>Suggested for ${escapeHtml(lessonContext.childName)}</strong>` : ""}
          <span><b>Age Group:</b> ${escapeHtml(resource.age || "Age Group")}</span>
          <span><b>Theme:</b> ${escapeHtml(resource.theme || resource.tags?.[0] || "Theme")}</span>
          <span><b>Development Area:</b> ${escapeHtml(displayDevelopmentArea(resource.developmentalArea || lessonContext?.goalMatch || resource.tags?.find((tag) => normalizeObservationArea(tag)) || "Developmental Area"))}</span>
          ${lessonContext?.supportArea ? `<span><b>Support Area Match:</b> ${escapeHtml(lessonContext.supportArea)}</span>` : ""}
          ${lessonContext ? `<p><b>Why this helps:</b> ${escapeHtml(lessonContext.why)}</p>` : ""}
        </div>
      ` : ""}
      <div class="resource-actions">
        <button class="favorite-button ${!isProUser() ? "disabled-control" : ""}" ${!isProUser() ? `data-pro-feature="favorites"` : `data-favorite="${resource.id}"`} type="button">${favoriteText}</button>
        ${resource.category === "Lesson Plans" && !locked ? `<button class="ghost-button" data-customize-lesson-ai="${resource.id}" type="button">Customize AI</button>` : ""}
        ${resource.category === "Lesson Plans" && !locked ? `<button class="ghost-button" data-find-lesson-activities="${resource.id}" type="button">Find Activities</button>` : ""}
        ${resource.category === "Lesson Plans" && !locked ? `<button class="ghost-button" data-add-lesson-support="${resource.id}" type="button">Add Support</button>` : ""}
        ${resource.category === "Observation Hub" && !locked ? `<button class="ghost-button" data-edit-observation="${resource.id}" type="button">Edit</button>` : ""}
        ${resource.category === "Observation Hub" && !locked ? `<button class="ghost-button" data-add-observation-child="${resource.id}" type="button">Add to Child</button>` : ""}
        ${hasResourcePdf(resource) && !locked ? `<button class="ghost-button" data-download-pdf="${resource.id}" type="button">Download PDF</button>` : ""}
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
    "Printables": "A ready-to-print worksheet page with type-specific directions, child work spaces, writing lines, checkboxes, learning goal, and provider notes.",
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

function printableType(resource) {
  const exactType = printableTypes.find((type) => resource.tags.includes(type) || resource.title.includes(type));
  if (exactType) return exactType;
  const label = `${resource.title} ${resource.tags.join(" ")}`.toLowerCase();
  if (label.includes("infant activity guide")) return "Infant Activity Guide";
  if (label.includes("letter") || label.includes("alphabet")) return "Alphabet Practice";
  if (label.includes("number")) return "Number Practice";
  if (label.includes("shape")) return "Shape Practice";
  if (label.includes("name")) return "Name Writing";
  if (label.includes("cut")) return "Cutting Practice";
  if (label.includes("match")) return "Matching Activities";
  if (label.includes("holiday")) return "Holiday Worksheets";
  if (label.includes("season")) return "Seasonal Worksheets";
  if (label.includes("color")) return "Coloring Pages";
  if (label.includes("trace") || label.includes("tracing") || label.includes("worksheet")) return "Tracing Worksheets";
  return "Printable Activity";
}

function printableTheme(resource) {
  return resource.tags.find((tag) => !printableTypes.includes(tag) && !["Printable", "Seasonal", "Holiday"].includes(tag)) || resourceTheme(resource);
}

function printableThemeWords(theme) {
  const words = String(theme || "learning").split(/\s+/).map((word) => word.replace(/[^a-z0-9]/gi, "")).filter(Boolean);
  return words.length ? words.slice(0, 4) : ["learning"];
}

function printableLetter(theme) {
  const clean = String(theme || "learning").replace(/[^a-z]/gi, "").toUpperCase();
  return clean[0] || "L";
}

function printableNumber(theme) {
  return (String(theme || "learning").replace(/\s+/g, "").length % 9) + 1;
}

function printableTypeForArea(area = "", goalText = "") {
  const text = `${area} ${goalText}`.toLowerCase();
  if (text.includes("scissor") || text.includes("cut")) return "Cutting Practice";
  if (text.includes("fine motor") || text.includes("trace") || text.includes("write") || text.includes("pencil")) return "Tracing Worksheets";
  if (text.includes("speech") || text.includes("language") || text.includes("word") || text.includes("vocabulary") || text.includes("sentence")) return "Vocabulary Practice";
  if (text.includes("literacy") || text.includes("letter")) return "Alphabet Practice";
  if (text.includes("math") || text.includes("count") || text.includes("number")) return "Number Practice";
  if (text.includes("cognitive") || text.includes("match") || text.includes("sort")) return "Matching Activities";
  if (text.includes("shape")) return "Shape Practice";
  if (text.includes("name")) return "Name Writing";
  return "Tracing Worksheets";
}

function printableProfessionalFeatures(type) {
  const features = {
    "Infant Activity Guide": ["Brief one-to-one play idea", "Safe materials only", "Observation prompts", "Family-friendly next step"],
    "Tracing Worksheets": ["Dotted tracing paths", "Letter and word formation practice", "Left-to-right movement", "Teacher observation note"],
    "Coloring Pages": ["Full-page outlined scene", "Vocabulary prompts", "Color key", "Conversation extension"],
    "Alphabet Practice": ["Letter recognition", "Uppercase and lowercase tracing", "Beginning sound practice", "Independent attempt space"],
    "Vocabulary Practice": ["Picture vocabulary cards", "Naming prompts", "Choice board practice", "Conversation extension"],
    "Number Practice": ["Numeral tracing", "One-to-one counting", "Count-and-mark boxes", "Teacher check"],
    "Shape Practice": ["Shape tracing", "Visual discrimination", "Shape hunt", "Teacher check"],
    "Name Writing": ["Teacher model line", "Trace lines", "Copy lines", "Name recognition checklist"],
    "Cutting Practice": ["Scissor safety checklist", "Straight snip strips", "Zigzag and curved cutting lines", "Cut-and-sort extension"],
    "Matching Activities": ["Visual matching pairs", "Vocabulary prompts", "Fine motor pencil control", "Make-your-own match"],
    "Assessment Forms": ["Child information fields", "Skill checklist", "Observation evidence", "Provider next steps"],
  };
  return features[type] || ["Clear directions", "Age-appropriate practice", "Teacher observation note", "Portfolio-ready work sample"];
}

function printableQualityIssues(resource = {}, text = "") {
  if (resource.category !== "Printables") return [];
  const body = String(text || "");
  const lower = [
    resource.title,
    resource.description,
    resource.customContent,
    body,
    ...(resource.tags || []),
  ].join(" ").toLowerCase();
  const issues = [];
  const blocked = printableQualityBlockedTerms.filter((term) => lower.includes(term));
  if (blocked.length) issues.push("Remove placeholder or unfinished wording before publishing.");
  if (!resource.pdfReady && !resource.pdfFileName && !body.includes("Teacher Directions")) issues.push("Add print-ready PDF structure and teacher directions.");
  if (!/Name:\s*_{6,}/i.test(body) && !/Child Name:\s*_{6,}/i.test(body)) issues.push("Add child name and date fields.");
  if (!/(Trace|Cut|Match|Count|Color|Checklist|Observation|Teacher Note|Provider Note)/i.test(body)) issues.push("Add a real worksheet task, assessment section, or documentation section.");
  return Array.from(new Set(issues));
}

function printableQualityCheckHtml(resource, text) {
  if (resource.category !== "Printables") return "";
  const issues = printableQualityIssues(resource, text);
  const type = printableType(resource);
  const checks = issues.length
    ? issues
    : [
      "PDF-ready classroom layout with name/date fields.",
      "No placeholder text, blank-only sections, or unfinished directions.",
      `${type} includes ${printableProfessionalFeatures(type).slice(0, 3).join(", ").toLowerCase()}.`,
      "Black-and-white printer friendly with clean spacing.",
    ];
  return `
    <section class="print-section printable-quality-check ${issues.length ? "needs-review" : ""}">
      <h3>${issues.length ? "Needs Review Before Publishing" : "Print-Ready Quality Check"}</h3>
      <ul class="printable-list">
        ${checks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function themeVocabulary(theme) {
  const map = {
    "Farm Animals": ["cow", "pig", "hen", "barn"],
    Ocean: ["fish", "wave", "shell", "boat"],
    Dinosaurs: ["dino", "egg", "bone", "roar"],
    Transportation: ["car", "bus", "train", "plane"],
    "Community Helpers": ["help", "doctor", "mail", "truck"],
    Weather: ["sun", "rain", "cloud", "wind"],
    Seasons: ["spring", "summer", "fall", "winter"],
    Space: ["star", "moon", "rocket", "planet"],
    "Bugs & Insects": ["bug", "bee", "ant", "butterfly"],
    "Zoo Animals": ["zebra", "lion", "bear", "monkey"],
    Pets: ["cat", "dog", "fish", "bird"],
    Colors: ["red", "blue", "green", "yellow"],
    Shapes: ["circle", "square", "star", "heart"],
    Numbers: ["one", "two", "three", "four"],
    Letters: ["A", "B", "C", "D"],
    "Healthy Habits": ["wash", "brush", "sleep", "move"],
    Camping: ["tent", "fire", "map", "trail"],
    Apples: ["apple", "tree", "seed", "basket"],
    Pumpkins: ["pumpkin", "vine", "seed", "patch"],
    Winter: ["snow", "mitten", "ice", "coat"],
    Spring: ["flower", "rain", "seed", "bug"],
    Summer: ["sun", "wave", "ice cream", "ball"],
    Fall: ["leaf", "pumpkin", "apple", "wind"],
    Christmas: ["tree", "star", "gift", "bell"],
    Thanksgiving: ["thankful", "corn", "pie", "family"],
    Easter: ["egg", "bunny", "basket", "spring"],
    "Valentine's Day": ["heart", "love", "kind", "card"],
    "St. Patrick's Day": ["clover", "green", "gold", "rainbow"],
    "4th of July": ["flag", "star", "red", "blue"],
    "All About Me": ["me", "name", "family", "home"],
    Feelings: ["happy", "sad", "calm", "mad"],
  };
  return map[theme] || printableThemeWords(theme).slice(0, 4);
}

function tracingWorksheetContent(resource) {
  const theme = printableTheme(resource);
  const words = themeVocabulary(theme);
  const letter = printableLetter(theme);
  const toddler = resource.age === "Toddler";
  const wordLines = toddler
    ? `${letter}    ${letter}    ${letter}    ${letter}
${words.slice(0, 2).map((word) => `${word}    ${word}    ${word}`).join("\n")}`
    : `${letter}    ${letter}    ${letter}    ${letter}    ${letter}
${theme}
${words.slice(0, 4).map((word) => `${word}    ${word}`).join("\n")}`;
  const directions = toddler
    ? "Trace each path with a finger first, then use a thick crayon. Keep the activity short and celebrate effort."
    : "Trace the paths and theme words. Then try writing one word on your own and draw a matching picture.";
  return `Tracing Worksheet
Title: ${resource.title}
Age Group: ${resource.age}
Theme: ${theme}

Teacher Directions
${directions}

Name: ____________________________________________  Date: ______________

Warm-Up Tracing Paths
Trace each path from left to right.
1. Straight path:  ____________  ____________  ____________
2. Bumpy path:     mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
3. Zigzag path:    /\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\
4. Circle path:    O O O O O O O O O O O O O O O O

Letter And Word Tracing
Trace the beginning letter and theme words.
${wordLines}

Try It
${toddler ? `Point to or color one ${theme.toLowerCase()} picture. Say one theme word with your teacher.` : `Write one theme word on your own: _________________________________`}

Portfolio Work Sample
Use this space for the child's traced mark, copied word, or dictated idea about ${theme.toLowerCase()}.
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Provider Note
This page supports fine motor control, pre-writing practice, vocabulary, left-to-right movement, and confidence with early writing.`;
}

function printablePdfDirections(resource, type, theme) {
  const toddler = resource.age === "Toddler";
  const directions = {
    "Tracing Worksheets": toddler
      ? "Teacher: Let the child trace with a finger first, then a thick crayon. Focus on left-to-right movement and effort."
      : "Teacher: Invite the child to trace each path and theme word, then write one word independently and draw a matching picture.",
    "Coloring Pages": "Teacher: Talk about the theme first. Let the child color, draw, and name details from the page.",
    "Alphabet Practice": `Teacher: Say the ${theme} beginning sound, trace the letter, and connect the sound to theme words.`,
    "Number Practice": "Teacher: Count aloud together, touch each item once, then trace and draw the number amount.",
    "Shape Practice": "Teacher: Name each shape, trace it in the air, then find or draw shapes inside a theme picture.",
    "Name Writing": "Teacher: Model the child's name first. Let the child trace, copy, and find familiar letters.",
    "Cutting Practice": "Teacher: Use child-safe scissors with close supervision. Start with short snips before longer cutting lines.",
    "Matching Activities": "Teacher: Name each item, draw matching lines together, then invite the child to make one new match.",
    "Seasonal Worksheets": "Teacher: Talk about the season, weather, and theme words. Encourage noticing, drawing, and simple dictation.",
    "Holiday Worksheets": "Teacher: Introduce holiday vocabulary, trace the theme word, count items, and draw or color a related picture.",
  };
  return directions[type] || "Teacher: Read the directions aloud, model one example, and let the child complete the worksheet with support.";
}

function printableWorksheetContent(resource) {
  const type = printableType(resource);
  const theme = printableTheme(resource);
  const words = printableThemeWords(theme);
  const letter = printableLetter(theme);
  const number = printableNumber(theme);
  const themeLine = words.map((word) => word.toLowerCase()).join(", ");

  if (type === "Tracing Worksheets") {
    return tracingWorksheetContent(resource);
  }

  if (type === "Coloring Pages") {
    return `Coloring Page
Theme: ${theme}
Focus: color recognition, vocabulary, fine motor control, and creative expression.

Name: ____________________________________________  Date: ______________

Coloring Prompt
Color the full-page ${theme.toLowerCase()} scene. Talk about the vocabulary, details, colors, and countable items as the child works.

Picture Checklist
[ ] Main ${theme.toLowerCase()} artwork completed
[ ] Background detail added or discussed
[ ] One small item counted
[ ] Favorite color named

Color Key
[ ] Red   [ ] Blue   [ ] Yellow   [ ] Green   [ ] Orange   [ ] Purple

Printable Picture Space
Use the page image, tracing marks, or added details as the child's work sample.
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Talk About It
My favorite part of my picture is: ______________________________________`;
  }

  if (type === "Alphabet Practice") {
    return `Alphabet Practice Page
Theme: ${theme}
Letter Focus: ${letter}
Focus: letter recognition, beginning sounds, and early writing.

Name: ____________________________________________  Date: ______________

Find The Letter
Circle or color every ${letter}.
${letter}   A   ${letter.toLowerCase()}   B   ${letter}   C   ${letter.toLowerCase()}   D   ${letter}

Trace The Letter
Uppercase: ${letter}    ${letter}    ${letter}    ${letter}    ${letter}
________________________________________________________________________

Lowercase: ${letter.toLowerCase()}    ${letter.toLowerCase()}    ${letter.toLowerCase()}    ${letter.toLowerCase()}    ${letter.toLowerCase()}
________________________________________________________________________

Beginning Sound Words
Say each word. Circle the words that begin like ${theme}.
- ${theme}
- ${words[0] || "learning"}
- friend
- family
- fun

Independent Practice
Say one word that starts with ${letter}, then try writing the letter or dictating the word.
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________`;
  }

  if (type === "Number Practice") {
    return `Number Practice Page
Theme: ${theme}
Number Focus: ${number}
Focus: counting, one-to-one correspondence, and numeral formation.

Name: ____________________________________________  Date: ______________

Trace The Number
${number}    ${number}    ${number}    ${number}    ${number}    ${number}
________________________________________________________________________

Count And Mark
Count ${number} ${theme.toLowerCase()} items. Put an X in one box for each item counted.
[ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]

Count And Show
Mark, color, or place ${number} small ${theme.toLowerCase()} items.
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Compare
[ ] I counted all ${number}.
[ ] I wrote the number.
[ ] I checked my work with my teacher.`;
  }

  if (type === "Shape Practice") {
    return `Shape Practice Page
Theme: ${theme}
Focus: shape recognition, tracing, sorting, and visual discrimination.

Name: ____________________________________________  Date: ______________

Trace The Shapes
Circle:   O   O   O   O   O
Square:   [ ]   [ ]   [ ]   [ ]
Triangle: /\\   /\\   /\\   /\\
Rectangle: [____]   [____]   [____]

Shape Hunt
Find or draw shapes that could belong in a ${theme.toLowerCase()} picture.
[ ] Circle
[ ] Square
[ ] Triangle
[ ] Rectangle

Shape Builder
Use circles, squares, triangles, and rectangles to make a ${theme.toLowerCase()} design.
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Teacher Check
Shape named: __________________________  Support needed: _______________`;
  }

  if (type === "Name Writing") {
    return `Name Writing Page
Theme: ${theme}
Focus: name recognition, pencil control, and meaningful early writing.

Name: ____________________________________________  Date: ______________

My Name
Teacher writes child's name here:
________________________________________________________________________

Trace My Name
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Try My Name
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Name Hunt
[ ] I found the first letter in my name.
[ ] I pointed to my name.
[ ] I tried writing my name.
[ ] I added a ${theme.toLowerCase()} drawing.`;
  }

  if (type === "Cutting Practice") {
    return `Cutting Practice Page
Theme: ${theme}
Focus: scissor safety, hand strength, coordination, and fine motor control.

Name: ____________________________________________  Date: ______________

Provider Safety Check
[ ] Child-safe scissors
[ ] Seated at table
[ ] Close adult supervision
[ ] Small pieces removed after activity

Cutting Lines
Cut slowly on each line.
Straight line:  - - - - - - - - - - - - - - - - - - -
Short lines:    | | | | | | | | | | | | | | | | |
Zigzag line:    /\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\
Curved line:    C C C C C C C C C C C C C C C C

Cut And Sort
Cut out small ${theme.toLowerCase()} pieces, then sort them here.
Group 1: __________________________________
Group 2: __________________________________

Teacher Note
Grip: ____________________  Control: ____________________`;
  }

  if (type === "Matching Activities") {
    return `Matching Activity Page
Theme: ${theme}
Focus: visual matching, vocabulary, problem solving, and pencil control.

Name: ____________________________________________  Date: ______________

Draw Lines To Match
Match each item on the left with the best item on the right.
1. ${words[0] || theme} picture                         A. Same picture
2. Big ${theme.toLowerCase()} item                      B. Small ${theme.toLowerCase()} item
3. First sound in ${theme}                              C. ${letter}
4. Favorite color                                       D. Color box

Match Here
1 -> ______
2 -> ______
3 -> ______
4 -> ______

Make Your Own Match
Draw one ${theme.toLowerCase()} item and one matching item.
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________`;
  }

  if (type === "Seasonal Worksheets") {
    return `Seasonal Worksheet Page
Theme: ${theme}
Focus: seasonal vocabulary, observation, counting, tracing, and drawing.

Name: ____________________________________________  Date: ______________

Season Hunt
Look at the seasonal picture. Color what you see.
[ ] Sun or sky
[ ] Plant, leaf, snow, or weather detail
[ ] Something to count
[ ] Something that shows ${theme.toLowerCase()}

Color And Count
Color the ${theme.toLowerCase()} scene. Count each item with your teacher.
${words.slice(0, 4).map((word, index) => `${index + 1}. ${word}: ______`).join("\n")}

Seasonal Words
Trace or copy these words.
${words.slice(0, 4).map((word) => `${word}: ____________________________________________________`).join("\n")}

I Notice
One thing I notice about ${theme.toLowerCase()} is:
________________________________________________________________________

Seasonal Work Sample
Add one seasonal detail, copied word, tracing mark, or dictated idea.
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Teacher Note
Vocabulary used: ________________________  Next step: _________________`;
  }

  if (type === "Holiday Worksheets") {
    return `Holiday Worksheet Page
Theme: ${theme}
Focus: holiday vocabulary, counting, fine motor practice, and conversation.

Name: ____________________________________________  Date: ______________

Holiday Picture Hunt
Color the full-page picture. Find and count the holiday items.
${words.slice(0, 4).map((word, index) => `${index + 1}. ${word}: ______`).join("\n")}

Holiday Vocabulary
Say, point to, or act out words connected to ${theme.toLowerCase()}.
${words.slice(0, 4).map((word) => `- ${word}`).join("\n")}

Trace And Write
${theme}
________________________________________________________________________
________________________________________________________________________

Count The Holiday Items
Count ${number} items and color them.
[ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]

Portfolio Work Sample
Add one detail, tracing mark, copied word, or dictated idea about ${theme.toLowerCase()}.
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Talk About It
Something I can share or do kindly is: _________________________________`;
  }

  return `Printable Activity Page
Theme: ${theme}
Focus: early learning practice, fine motor control, and vocabulary.

Name: ____________________________________________  Date: ______________

Try It
1. Look at the page with your teacher.
2. Trace, color, count, match, cut, or write based on the directions.
3. Talk about what you made or noticed.

Child Work Space
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________`;
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
  return `${printableWorksheetContent(resource)}

Teacher Notes
Skill practiced: _______________________________________________________
Support needed: ________________________________________________________
Send home? [ ] Yes  [ ] No`;
}

function formLine(label) {
  return `${label}: ________________________________________________________________`;
}

function formSignatureBlock() {
  return `Parent/Guardian Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`;
}

function formCheckboxes(items) {
  return items.map((item) => `[ ] ${item}`).join("\n");
}

function formResourceContent(resource) {
  const title = resource.title;
  const label = title.toLowerCase();
  const header = `${title}

Program Name: ____________________________________________
Child Name: ______________________________________________
Date: ____________________________________________________`;
  const notes = `Notes / Details:
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________`;

  if (label.includes("enrollment packet")) {
    return `${header}

Purpose
Use this packet to collect the required information before a child begins care.

Enrollment Checklist
${formCheckboxes([
  "Child information form completed",
  "Parent/guardian information completed",
  "Emergency contacts completed",
  "Authorized pick-up list completed",
  "Medical and allergy information completed",
  "Immunization documentation reviewed",
  "Tuition agreement signed",
  "Parent handbook receipt signed",
  "Permission forms completed",
])}

Provider Review
Start Date: ______________________________________________
Schedule: ________________________________________________
Tuition Rate: ____________________________________________

${formSignatureBlock()}`;
  }

  if (label.includes("child information") || label.includes("family information") || label.includes("getting to know")) {
    return `${header}

Child Profile
${formLine("Date of Birth")}
${formLine("Preferred Name")}
${formLine("Primary Language")}
${formLine("Home Address")}
${formLine("Favorite Foods")}
${formLine("Foods Disliked")}
${formLine("Comfort Items")}
${formLine("Favorite Activities")}

Development / Routine Notes
Previous childcare experience: [ ] Yes  [ ] No
Special services or supports: [ ] Yes  [ ] No
Nap routine: _____________________________________________
Toileting status: ________________________________________
Communication style: _____________________________________

What should we know about this child?
________________________________________________________________________
________________________________________________________________________

${formSignatureBlock()}`;
  }

  if (label.includes("emergency") || label.includes("authorized pickup") || label.includes("authorized pick-up") || label.includes("pick-up password")) {
    return `${header}

Emergency / Authorized Contact Details
Contact #1 Name: _________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
Authorized Pick-Up? [ ] Yes  [ ] No

Contact #2 Name: _________________________________________
Relationship: ____________________________________________
Phone: ___________________________________________________
Authorized Pick-Up? [ ] Yes  [ ] No

Pick-Up Password: ________________________________________
Restricted Individuals:
________________________________________________________________________

Preferred Hospital: ______________________________________
Physician: __________________________ Phone: ______________

${formSignatureBlock()}`;
  }

  if (label.includes("medication") || label.includes("allergy") || label.includes("health") || label.includes("immunization") || label.includes("illness") || label.includes("fever") || label.includes("food substitution") || label.includes("ointment")) {
    return `${header}

Health / Medical Details
${formLine("Physician")}
${formLine("Physician Phone")}
${formLine("Medical Conditions")}
${formLine("Allergies")}
${formLine("Medication Name")}
${formLine("Dosage")}
${formLine("Administration Time")}
${formLine("Start Date")}
${formLine("End Date")}

Symptoms / Reactions / Instructions
________________________________________________________________________
________________________________________________________________________

Emergency Plan
________________________________________________________________________
________________________________________________________________________

Provider Documentation
Date / Time Given or Observed: ____________________________
Action Taken: ____________________________________________
Parent Notified? [ ] Yes  [ ] No

${formSignatureBlock()}`;
  }

  if (label.includes("potty training")) {
    return `${header}

Potty Training Plan
Stage: [ ] Not started   [ ] Sitting practice   [ ] Some success   [ ] Mostly independent
Bathroom words/signs used at home: _______________________
Child's usual potty schedule: ____________________________
Extra clothes available? [ ] Yes  [ ] No
Pull-ups/underwear preference: ___________________________

Potty Attempts
Time: ______  [ ] Tried  [ ] Pee  [ ] BM  [ ] Accident  Notes: __________________
Time: ______  [ ] Tried  [ ] Pee  [ ] BM  [ ] Accident  Notes: __________________
Time: ______  [ ] Tried  [ ] Pee  [ ] BM  [ ] Accident  Notes: __________________
Time: ______  [ ] Tried  [ ] Pee  [ ] BM  [ ] Accident  Notes: __________________
Time: ______  [ ] Tried  [ ] Pee  [ ] BM  [ ] Accident  Notes: __________________

Encouragement Used
[ ] Reminder given   [ ] Child asked to go   [ ] Sat calmly
[ ] Washed hands     [ ] Celebrated effort

Family Notes
What worked today? ______________________________________
Supplies needed: ________________________________________
Home follow-up: _________________________________________

Provider Initials: ___________________ Parent Initials: ___________________`;
  }

  if (label.includes("diaper change")) {
    return `${header}

Diaper Change Log
Use this page to record diaper changes, skin checks, and supplies needed.

Time: ______  [ ] Wet  [ ] BM  [ ] Dry  Cream used? [ ] Yes [ ] No  Notes: ________
Time: ______  [ ] Wet  [ ] BM  [ ] Dry  Cream used? [ ] Yes [ ] No  Notes: ________
Time: ______  [ ] Wet  [ ] BM  [ ] Dry  Cream used? [ ] Yes [ ] No  Notes: ________
Time: ______  [ ] Wet  [ ] BM  [ ] Dry  Cream used? [ ] Yes [ ] No  Notes: ________
Time: ______  [ ] Wet  [ ] BM  [ ] Dry  Cream used? [ ] Yes [ ] No  Notes: ________
Time: ______  [ ] Wet  [ ] BM  [ ] Dry  Cream used? [ ] Yes [ ] No  Notes: ________

Skin Check
[ ] No concerns
[ ] Redness noted
[ ] Rash noted
[ ] Parent notified
Details: __________________________________________________

Supplies Needed
[ ] Diapers
[ ] Wipes
[ ] Cream
[ ] Extra clothes

Provider Initials: ___________________`;
  }

  if (label.includes("nap log")) {
    return `${header}

Nap / Rest Log
Rest area used: __________________________________________
Comfort item: ____________________________________________

Rest Records
Start: ______  Asleep: ______  Wake: ______  Mood waking: ________________________
Start: ______  Asleep: ______  Wake: ______  Mood waking: ________________________
Start: ______  Asleep: ______  Wake: ______  Mood waking: ________________________

Rest Notes
[ ] Fell asleep easily
[ ] Needed comfort
[ ] Quiet rest only
[ ] Woke early
[ ] Slept well

Provider Notes
________________________________________________________________________
________________________________________________________________________

Provider Initials: ___________________`;
  }

  if (label.includes("meal tracking")) {
    return `${header}

Meal Tracking Sheet
Allergies / food restrictions: ___________________________
Texture or serving notes: ________________________________

Meals And Snacks
Breakfast offered: _______________________________________
Amount eaten: [ ] Most  [ ] Some  [ ] Little  [ ] None

Lunch offered: ___________________________________________
Amount eaten: [ ] Most  [ ] Some  [ ] Little  [ ] None

Snack offered: ___________________________________________
Amount eaten: [ ] Most  [ ] Some  [ ] Little  [ ] None

Fluids
Water: ________  Milk: ________  Other: ___________________

Notes For Family
________________________________________________________________________
________________________________________________________________________

Provider Initials: ___________________`;
  }

  if (label.includes("mood and behavior tracker")) {
    return `${header}

Mood And Behavior Tracker
Primary mood today:
[ ] Happy   [ ] Calm   [ ] Tired   [ ] Frustrated   [ ] Sad   [ ] Energetic

What was happening before?
________________________________________________________________________

Behavior / Feeling Observed
________________________________________________________________________

Support Given
[ ] Offered choices
[ ] Used calm space
[ ] Helped name feelings
[ ] Gave transition warning
[ ] Modeled words
[ ] Contacted family

What helped?
________________________________________________________________________

Pattern / Follow-Up Notes
________________________________________________________________________
________________________________________________________________________

Provider Initials: ___________________`;
  }

  if (label.includes("daily cleaning")) {
    return `${header}

Daily Cleaning Checklist
Opening Check
[ ] Tables and eating surfaces clean
[ ] Bathroom stocked
[ ] Floors checked
[ ] Toys/materials safe for use
[ ] Handwashing supplies ready

Midday Check
[ ] Meal areas cleaned
[ ] Diapering/toileting area cleaned
[ ] High-touch surfaces wiped
[ ] Trash checked
[ ] Nap/rest items separated

Closing Check
[ ] Toys sanitized or set aside
[ ] Floors swept/vacuumed
[ ] Bathroom cleaned
[ ] Dishes/food areas cleaned
[ ] Trash removed

Follow-Up Needed
________________________________________________________________________

Provider Initials: ___________________`;
  }

  if (label.includes("behavior report")) {
    return `${header}

Behavior Documentation
Time / Location: _________________________________________
Staff Present: ___________________________________________

What happened before the behavior?
________________________________________________________________________
________________________________________________________________________

Behavior observed:
________________________________________________________________________
________________________________________________________________________

Support provided:
[ ] Calm voice
[ ] Choices offered
[ ] Space or break offered
[ ] Feelings named
[ ] Safety support
[ ] Parent notified

Child response / next step:
________________________________________________________________________
________________________________________________________________________

${formSignatureBlock()}`;
  }

  if (label.includes("incident") || label.includes("injury") || label.includes("accident")) {
    return `${header}

Report Details
Date of Event: ___________________________________________
Time of Event: ___________________________________________
Location: ________________________________________________
Staff Present: ___________________________________________

What happened?
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Action Taken / Support Provided
________________________________________________________________________
________________________________________________________________________

Parent Notification
Parent notified? [ ] Yes  [ ] No
Method: [ ] Phone  [ ] Message  [ ] Pick-up discussion  [ ] Written note
Follow-up needed? [ ] Yes  [ ] No

${formSignatureBlock()}`;
  }

  if (label.includes("daily") || label.includes("infant") || label.includes("toddler") || label.includes("preschool") || label.includes("nap") || label.includes("diaper") || label.includes("potty") || label.includes("meal") || label.includes("mood") || label.includes("attendance")) {
    return `${header}

Daily Care Record
Arrival Time: ___________________ Departure Time: ___________________
Mood: [ ] Happy  [ ] Calm  [ ] Sleepy  [ ] Fussy  [ ] Playful

Meals
Breakfast: _______________________________________________
Lunch: ___________________________________________________
Snack: ___________________________________________________

Rest / Diaper / Bathroom
Nap Start/End: ___________________________________________
Diaper/Potty Notes: ______________________________________
Bathroom Attempts: _______________________________________

Learning and Activities
________________________________________________________________________
________________________________________________________________________

Supplies Needed / Family Notes
________________________________________________________________________
________________________________________________________________________

Provider Initials: ___________________`;
  }

  if (label.includes("late pick-up")) {
    return `${header}

Late Pick-Up Notice
Scheduled pick-up time: _________________________________
Actual pick-up time: ____________________________________
Late minutes: ____________________________________________
Late fee, if applicable: $_______________________________

Notice To Parent/Guardian
Your child was picked up after the scheduled pick-up time listed in your childcare agreement. Please review your program policy and contact the provider if a schedule change is needed.

Reason / Family Note
________________________________________________________________________
________________________________________________________________________

Provider Follow-Up
[ ] Reminder only
[ ] Late fee added
[ ] Schedule conversation needed
[ ] Repeated late pick-up concern

${formSignatureBlock()}`;
  }

  if (label.includes("positive behavior note")) {
    return `${header}

Positive Behavior Note
Today your child showed:
[ ] Kindness
[ ] Helping
[ ] Sharing
[ ] Trying hard
[ ] Problem solving
[ ] Gentle hands
[ ] Leadership

What I noticed:
________________________________________________________________________
________________________________________________________________________

Provider message to family:
________________________________________________________________________
________________________________________________________________________

Celebrate At Home
One thing you can ask your child: _________________________

Provider Initials: ___________________`;
  }

  if (label.includes("development update")) {
    return `${header}

Development Update
Development area:
[ ] Language   [ ] Social Emotional   [ ] Motor   [ ] Cognitive   [ ] Self-help

Strengths observed:
________________________________________________________________________
________________________________________________________________________

New skills or progress:
________________________________________________________________________
________________________________________________________________________

Provider support / next step:
________________________________________________________________________

Family connection:
________________________________________________________________________

Provider Initials: ___________________ Parent Initials: ___________________`;
  }

  if (label.includes("tuition") || label.includes("payment") || label.includes("tax") || label.includes("late payment") || label.includes("withdrawal") || label.includes("contract") || label.includes("rate") || label.includes("invoice") || label.includes("deposit") || label.includes("vacation") || label.includes("holiday") || label.includes("termination") || label.includes("fee")) {
    return `${header}

Financial / Business Details
Family Name: _____________________________________________
Payment Period: __________________________________________
Weekly Rate: $____________________________________________
Monthly Rate: $___________________________________________
Registration/Supply Fee: $________________________________
Amount Paid or Due: $_____________________________________
Due Date: ________________________________________________
Payment Method: [ ] Cash  [ ] Check  [ ] Card  [ ] Online  [ ] Subsidy

Policy / Agreement Notes
________________________________________________________________________
________________________________________________________________________

Provider Follow-Up
Balance Due: $____________________________________________
Receipt Number: __________________________________________
Effective Date: __________________________________________

${formSignatureBlock()}`;
  }

  if (label.includes("handbook") || label.includes("communication") || label.includes("newsletter") || label.includes("conference") || label.includes("supply") || label.includes("policy") || label.includes("welcome") || label.includes("transition") || label.includes("positive") || label.includes("permission") || label.includes("field trip") || label.includes("photo") || label.includes("transportation") || label.includes("water play") || label.includes("sunscreen")) {
    return `${header}

Family Communication / Permission Details
Parent/Guardian Name: ____________________________________
Topic / Permission Type: _________________________________
Effective Date(s): _______________________________________

Message / Policy / Permission Wording
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Family Response / Notes
________________________________________________________________________
________________________________________________________________________

Permission Choices
${formCheckboxes([
  "I give permission",
  "I do not give permission",
  "I have received and reviewed this information",
  "I need the provider to contact me",
])}

${formSignatureBlock()}`;
  }

  if (label.includes("drill") || label.includes("safety") || label.includes("visitor") || label.includes("checklist") || label.includes("inventory")) {
    return `${header}

Safety / Checklist Record
Date Completed: __________________________________________
Completed By: ____________________________________________
Area / Location: _________________________________________

Checklist
${formCheckboxes([
  "Area checked before use",
  "Hazards removed or documented",
  "Supplies stocked",
  "Emergency information accessible",
  "Follow-up needed",
])}

Log / Notes
Item / Drill: __________________ Time Started: ______ Time Completed: ______
Item / Drill: __________________ Time Started: ______ Time Completed: ______
Item / Drill: __________________ Time Started: ______ Time Completed: ______

${notes}

Provider Signature: _____________________________________ Date: ______________`;
  }

  if (label.includes("planning") || label.includes("theme") || label.includes("activity") || label.includes("observation") || label.includes("goal") || label.includes("portfolio") || label.includes("monthly") || label.includes("weekly")) {
    return `${header}

Planning Details
Week / Month: ____________________________________________
Theme: ___________________________________________________
Age Group: _______________________________________________
Learning Focus: __________________________________________

Planned Activities
Monday: __________________________________________________
Tuesday: _________________________________________________
Wednesday: _______________________________________________
Thursday: ________________________________________________
Friday: __________________________________________________

Materials Needed
________________________________________________________________________
________________________________________________________________________

Observation / Goal Notes
________________________________________________________________________
________________________________________________________________________

Provider Reflection
________________________________________________________________________`;
  }

  if (label.includes("staff") || label.includes("substitute") || label.includes("training") || label.includes("volunteer") || label.includes("confidentiality") || label.includes("schedule")) {
    return `${title}

Program Name: ____________________________________________
Staff / Substitute Name: _________________________________
Date: ____________________________________________________

Role / Schedule
Position: ________________________________________________
Phone: ___________________________________________________
Approved Dates/Times: ____________________________________

Checklist
${formCheckboxes([
  "Emergency procedures reviewed",
  "Child allergy/medical notes reviewed",
  "Attendance and sign-out procedure reviewed",
  "Confidentiality expectations reviewed",
  "Provider contact information shared",
])}

Training / Notes
________________________________________________________________________
________________________________________________________________________

Staff/Substitute Signature: ______________________________ Date: ______________
Provider Signature: _____________________________________ Date: ______________`;
  }

  return `${header}

Purpose
Use this form to document ${title.toLowerCase()} for your childcare program. Customize wording to match your handbook, licensing rules, and family policies.

Provider Instructions
1. Add your program name and contact information.
2. Complete the family, child, policy, or record fields.
3. Review the form with the parent, guardian, staff member, or provider.
4. Keep a signed copy in the child's file or business binder.

${notes}

${formSignatureBlock()}`;
}

function resourcePrintableText(resource) {
  return `${resourceFileText(resource)}\n\n${resourcePrintableWorksheet(resource)}`;
}

function lessonPlanPrintableText(resource) {
  return `${resourceDownloadBody(resource)}\n\n${resourcePrintableWorksheet(resource)}`;
}

function formPrintableText(resource) {
  return formResourceContent(resource);
}

function printableResourceText(resource) {
  return `${printableWorksheetContent(resource)}

Teacher Notes
Skill practiced: _______________________________________________________
Support needed: ________________________________________________________
Send home? [ ] Yes  [ ] No`;
}

function resourceDocumentText(resource) {
  if (resource.category === "Lesson Plans") return lessonPlanPrintableText(resource);
  if (resource.category === "Forms Library") return formPrintableText(resource);
  if (resource.category === "Printables") return printableResourceText(resource);
  return resourcePrintableText(resource);
}

function printableLineHtml(line) {
  if (/^(-|\*)\s+/.test(line)) return `<li>${escapeHtml(line.replace(/^(-|\*)\s+/, ""))}</li>`;
  const checkboxLine = line.match(/^\[\s?\]\s+(.*)$/);
  if (checkboxLine) return `<li class="printable-checkbox"><span></span>${escapeHtml(checkboxLine[1])}</li>`;
  if (/^[_]{8,}$/.test(line.trim())) return `<div class="printable-writing-line"></div>`;
  if (/^┌|^│|^└/.test(line)) return `<div class="printable-drawing-box-line">${escapeHtml(line)}</div>`;
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

function printableProfessionalPreviewHtml(resource) {
  if (resource.category !== "Printables") return "";
  const theme = printableTheme(resource);
  const type = printableType(resource);
  const features = printableProfessionalFeatures(type);
  const vocabulary = themeVocabulary(theme).slice(0, 4);
  const letter = printableLetter(theme);
  const number = printableNumber(theme);
  return `
    <section class="print-section printable-professional-section">
      <div class="worksheet-preview-page" role="img" aria-label="${escapeHtml(`${theme} ${type} professional worksheet preview`)}">
        <div class="worksheet-preview-header">
          <span>Little Learner Hub</span>
          <strong>${escapeHtml(type)}</strong>
        </div>
        <div class="worksheet-preview-title">
          <h3>${escapeHtml(theme)} Practice Page</h3>
          <p>Name: ____________________________ Date: ______________</p>
        </div>
        <div class="worksheet-preview-grid">
          <div class="worksheet-preview-panel">
            <span>Teacher Directions</span>
            <p>${escapeHtml(printablePdfDirections(resource, type, theme))}</p>
          </div>
          <div class="worksheet-preview-panel compact">
            <span>Skill Focus</span>
            <ul>
              ${features.slice(0, 4).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
            </ul>
          </div>
        </div>
        <div class="worksheet-preview-practice">
          <span>${type === "Number Practice" ? `Trace ${number}` : `Trace ${letter}`}</span>
          <div class="worksheet-dotted-row">${Array.from({ length: 7 }, (_, index) => `<i>${escapeHtml(type === "Number Practice" ? String(number) : letter)}</i>`).join("")}</div>
          <div class="worksheet-line-row"></div>
          <div class="worksheet-cut-row"><b></b><b></b><b></b><b></b><b></b></div>
        </div>
        <div class="worksheet-preview-footer">
          ${vocabulary.map((word) => `<span>${escapeHtml(word)}</span>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function printableCartoonPreviewHtml(resource) {
  if (resource.category !== "Printables") return "";
  return printableProfessionalPreviewHtml(resource);
  const theme = printableTheme(resource);
  const type = printableType(resource);
  const lowerTheme = theme.toLowerCase();
  const title = escapeHtml(`${theme} ${type}`);
  const label = escapeHtml(theme);
  const shell = (scene) => `
    <section class="print-section printable-cartoon-section">
      <h3>Printable Picture</h3>
      <div class="worksheet-cartoon-scene" role="img" aria-label="${title}">
        <svg viewBox="0 0 620 360" xmlns="http://www.w3.org/2000/svg" focusable="false">
          <rect x="10" y="10" width="600" height="340" rx="20" fill="#fffdf9" stroke="#302a26" stroke-width="4"/>
          ${scene}
          <text x="32" y="328" class="worksheet-caption">${label}</text>
        </svg>
      </div>
    </section>
  `;

  if (lowerTheme.includes("summer")) {
    return shell(`
      <g class="cartoon-line">
        <circle cx="490" cy="82" r="42" fill="#ffe58a"/>
        <path d="M490 18v-32M490 182v-32M424 82h-32M588 82h-32M443 35l-22-22M559 151l-22-22M443 129l-22 22M559 13l-22 22"/>
        <circle cx="476" cy="74" r="4" fill="#302a26"/>
        <circle cx="504" cy="74" r="4" fill="#302a26"/>
        <path d="M472 94c12 16 28 16 40 0"/>

        <path d="M42 260c42-22 82-22 124 0s82 22 124 0 82-22 124 0 82 22 164 0" fill="none"/>
        <path d="M42 292c42-22 82-22 124 0s82 22 124 0 82-22 124 0 82 22 164 0" fill="none"/>

        <circle cx="180" cy="198" r="48" fill="#fff"/>
        <path d="M146 164l68 68M214 164l-68 68M180 150c14 26 14 70 0 96M132 198c26-14 70-14 96 0"/>
        <circle cx="166" cy="190" r="4" fill="#302a26"/>
        <circle cx="194" cy="190" r="4" fill="#302a26"/>
        <path d="M166 210c12 12 28 12 40 0"/>

        <path d="M330 250l32-112 32 112z" fill="#fff4d2"/>
        <ellipse cx="362" cy="132" rx="44" ry="18" fill="#fff"/>
        <circle cx="342" cy="112" r="18" fill="#fff"/>
        <circle cx="370" cy="108" r="20" fill="#fff"/>
        <circle cx="356" cy="126" r="3" fill="#302a26"/>
        <circle cx="370" cy="126" r="3" fill="#302a26"/>
        <path d="M354 140c8 8 18 8 26 0"/>

        <path d="M84 118c38-62 112-62 150 0z" fill="#f7c8bf"/>
        <path d="M159 118v130M126 118c10-22 22-38 33-48M192 118c-10-22-22-38-33-48"/>
        <path d="M78 248h162"/>
      </g>
    `);
  }

  if (lowerTheme.includes("christmas")) {
    return shell(`
      <g class="cartoon-line">
        <path d="M310 46l-72 88h38l-62 74h52l-78 52h244l-78-52h52l-62-74h38z" fill="#e3f0df"/>
        <rect x="286" y="260" width="48" height="42" fill="#d8b181"/>
        <polygon points="310,24 324,52 356,56 332,76 338,108 310,92 282,108 288,76 264,56 296,52" fill="#fff0a6"/>
        <circle cx="296" cy="154" r="5" fill="#302a26"/>
        <circle cx="324" cy="154" r="5" fill="#302a26"/>
        <path d="M294 176c12 14 32 14 44 0"/>
        <circle cx="252" cy="180" r="13" fill="#fff"/>
        <circle cx="370" cy="202" r="13" fill="#fff"/>
        <circle cx="314" cy="220" r="13" fill="#fff"/>
        <circle cx="282" cy="112" r="11" fill="#fff"/>
        <circle cx="346" cy="126" r="11" fill="#fff"/>
        <rect x="82" y="248" width="74" height="54" fill="#fff"/>
        <path d="M119 248v54M82 275h74"/>
        <rect x="466" y="250" width="72" height="52" fill="#fff"/>
        <path d="M502 250v52M466 276h72"/>
      </g>
    `);
  }

  if (lowerTheme.includes("dinosaur")) {
    return shell(`
      <g class="cartoon-line">
        <ellipse cx="285" cy="196" rx="112" ry="58" fill="#e3f0df"/>
        <circle cx="402" cy="166" r="42" fill="#e3f0df"/>
        <path d="M184 190l-82-52 42 76zM234 244l-20 56M330 244l28 56"/>
        <circle cx="416" cy="158" r="5" fill="#302a26"/>
        <path d="M398 184c16 16 36 14 48 0"/>
        <path d="M204 138l22-34 22 34M252 126l22-34 22 34M304 126l22-34 22 34"/>
        <ellipse cx="484" cy="276" rx="30" ry="40" fill="#fff"/>
        <ellipse cx="536" cy="282" rx="20" ry="28" fill="#fff"/>
      </g>
    `);
  }

  if (lowerTheme.includes("ocean")) {
    return shell(`
      <g class="cartoon-line">
        <path d="M54 258c42-24 78-24 120 0s78 24 120 0 78-24 120 0 78 24 152 0" fill="none"/>
        <path d="M54 298c42-24 78-24 120 0s78 24 120 0 78-24 120 0 78 24 152 0" fill="none"/>
        <ellipse cx="246" cy="156" rx="90" ry="44" fill="#dceef5"/>
        <path d="M334 156l86-54v108z" fill="#dceef5"/>
        <circle cx="216" cy="146" r="6" fill="#302a26"/>
        <path d="M214 172c18 14 48 14 66 0"/>
        <circle cx="104" cy="110" r="14" fill="#fff"/>
        <circle cx="510" cy="120" r="10" fill="#fff"/>
        <circle cx="472" cy="178" r="16" fill="#fff"/>
      </g>
    `);
  }

  if (lowerTheme.includes("farm")) {
    return shell(`
      <g class="cartoon-line">
        <rect x="80" y="150" width="180" height="112" fill="#fff"/>
        <path d="M58 150l112-84 112 84z" fill="#f7c8bf"/>
        <rect x="148" y="202" width="52" height="60" fill="#fff"/>
        <path d="M148 202l52 60M200 202l-52 60"/>
        <ellipse cx="430" cy="214" rx="70" ry="42" fill="#fff"/>
        <circle cx="508" cy="196" r="34" fill="#fff"/>
        <circle cx="496" cy="190" r="5" fill="#302a26"/>
        <circle cx="520" cy="190" r="5" fill="#302a26"/>
        <path d="M496 208c10 10 24 10 34 0"/>
        <path d="M392 252l-10 44M462 252l14 44"/>
      </g>
    `);
  }

  return shell(`
    <g class="cartoon-line">
      <circle cx="150" cy="126" r="56" fill="#fff0a6"/>
      <rect x="264" y="94" width="120" height="120" rx="16" fill="#dceef5"/>
      <polygon points="476,84 554,214 398,214" fill="#e3f0df"/>
      <polygon points="160,226 180,268 226,276 192,308 200,352 160,330 120,352 128,308 94,276 140,268" fill="#fff"/>
      <circle cx="138" cy="116" r="5" fill="#302a26"/>
      <circle cx="162" cy="116" r="5" fill="#302a26"/>
      <path d="M136 136c10 12 28 12 38 0"/>
    </g>
  `);
}

function resourcePrintableHtml(resource) {
  const text = resourceDocumentText(resource);
  const headingPattern = /^(Short Description|What Is Included|Who It Is For|How To Use It|Materials \/ Information Needed|ELG \/ Early Learning Standard Connections|Full Resource Content|Weekly Lesson Plan|Weekly Overview|Age Group Teaching Approach|Learning Objectives|Materials|Vocabulary|Monday - Introduce the Theme|Tuesday - Build Vocabulary and Concepts|Wednesday - Hands-On .+ Practice|Thursday - Creative Expression and Child Choice|Friday - Review, Document, and Connect Home|Related Activities|Differentiation and Supports|Child Support Connection|Provider Reflection|Observation Resource|Professional Observation Wording|What to Look For|Learning Standard Category|Evidence To Add|Next Steps|Editable Note|Follow-Up Planning|Purpose|Provider Instructions|Details \/ Notes|Weekly Daycare Menu|Shopping List|Provider Reminder|Setup|Steps|Learning Objective|Extension|Teacher Directions|Child Directions|Activity Ideas|Learning Goal|Provider Note|Printable Planning Notes|Daily Notes|Printable Observation Record|Additional Write-In Space|Checklist|Menu Notes|Shopping Notes|Activity Prep Sheet|Printable Resource|Printable Type|Theme \/ Skill|Printable Page|Tracing Practice|Warm-Up Paths|Letter And Word Tracing|Portfolio Work Sample|Printable Picture Space|Independent Practice|Count And Show|Shape Builder|Child Work Space|Coloring Page|Picture Checklist|Color Key|Talk About It|Alphabet Practice Page|Find The Letter|Trace The Letter|Beginning Sound Words|Number Practice Page|Trace The Number|Count And Mark|Compare|Shape Practice Page|Trace The Shapes|Shape Hunt|Teacher Check|Name Writing Page|My Name|Trace My Name|Try My Name|Name Hunt|Cutting Practice Page|Provider Safety Check|Cutting Lines|Cut And Sort|Teacher Note|Matching Activity Page|Draw Lines To Match|Match Here|Make Your Own Match|Seasonal Worksheet Page|Weather Check|Seasonal Words|I Notice|Count And Color|Seasonal Work Sample|Holiday Worksheet Page|Holiday Vocabulary|Trace And Write|Count The Holiday Items|Teacher Notes|Printable Worksheet Page|Try It|Reflection \/ Teacher Note)$/;
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const content = blocks.map((block, index) => {
    const lines = block.split("\n").map((line) => line.trimEnd()).filter((line) => line.length);
    const first = lines[0] || "";
    const allCapsHeading = first.length >= 8 && first === first.toUpperCase() && /^[A-Z0-9][A-Z0-9 &'./():-]+$/.test(first) && !first.includes("___");
    if (index === 0 || first === "Little Learner Hub") {
      return `<section class="print-section print-cover">${printableLinesHtml(lines)}</section>`;
    }
    if ((headingPattern.test(first) || allCapsHeading) && lines.length > 1) {
      return `<section class="print-section"><h3>${escapeHtml(first)}</h3>${printableLinesHtml(lines.slice(1))}</section>`;
    }
    return `<section class="print-section">${printableLinesHtml(lines)}</section>`;
  }).join("");
  return `<article class="printable-resource-page">${printableCartoonPreviewHtml(resource)}${content}${printableQualityCheckHtml(resource, text)}</article>`;
}

function decodedTextFileData(resource) {
  if (!resource.fileData || !resource.fileData.startsWith("data:text")) return "";
  const encoded = resource.fileData.split(",")[1] || "";
  try {
    return decodeURIComponent(encoded);
  } catch (error) {
    return "";
  }
}

function lessonAgeApproach(age) {
  const approaches = {
    Infant: "Use short one-to-one or very small group moments, responsive language, safe floor play, repeated songs, picture cards, and sensory-safe materials. Keep activities brief and follow each baby's cues.",
    Toddler: "Use short active lessons with choices, movement, repetition, naming, simple turn-taking, sensory exploration, and hands-on practice. Expect children to move in and out of the activity.",
    Preschool: "Use small group discussion, hands-on investigation, early writing/drawing, counting, comparison, prediction, collaboration, and child-led extensions. Invite children to explain their thinking.",
  };
  return approaches[age] || approaches.Preschool;
}

function lessonAreaPractice(area, theme, age) {
  const ageWord = String(age || "children").toLowerCase();
  const themeWord = String(theme || "the theme").toLowerCase();
  const practices = {
    Cognitive: `${ageWord} learners sort, match, compare, remember routines, and solve simple problems using ${themeWord} pictures, props, and materials.`,
    Language: `${ageWord} learners hear, repeat, point to, name, and use ${themeWord} words during songs, books, play, and teacher-child conversation.`,
    Literacy: `${ageWord} learners explore books, pictures, print, storytelling, beginning sounds, mark making, and retelling connected to ${themeWord}.`,
    "Social Emotional": `${ageWord} learners practice connection, confidence, feelings language, turn-taking, gentle touch, waiting, helping, and belonging through ${themeWord} routines.`,
    "Fine Motor": `${ageWord} learners grasp, squeeze, place, stack, tear, trace, draw, turn pages, or use safe tools with ${themeWord} materials.`,
    "Gross Motor": `${ageWord} learners crawl, walk, balance, reach, jump, stretch, dance, carry, or move like ${themeWord} items while practicing body control.`,
    Science: `${ageWord} learners observe, ask questions, explore textures, notice changes, compare, and investigate safe ${themeWord} materials.`,
    Math: `${ageWord} learners count, match, sort, compare size, notice patterns, use position words, and group ${themeWord} materials.`,
    "Creative Arts": `${ageWord} learners create, move, sing, pretend, build, paint, collage, and use open-ended materials inspired by ${themeWord}.`,
    "Self Help": `${ageWord} learners practice simple routines, clean-up, choices, independence, handwashing, dressing, transitions, and asking for help with ${themeWord} supports.`,
  };
  return practices[area] || practices.Cognitive;
}

function lessonThemeMaterials(theme) {
  const words = themeVocabulary(theme).slice(0, 4);
  return `${theme} picture cards or photos, ${words.join(", ")} props or labels, books, music, art paper, crayons, glue sticks, sensory-safe bin materials, blocks, manipulatives, dramatic play items, and one printable extension page.`;
}

function lessonVocabulary(theme, area) {
  const words = themeVocabulary(theme).slice(0, 5);
  const areaWords = {
    Cognitive: ["same", "different", "match", "sort", "remember"],
    Language: ["say", "listen", "name", "tell", "question"],
    Literacy: ["book", "story", "letter", "picture", "print"],
    "Social Emotional": ["feel", "help", "gentle", "turn", "friend"],
    "Fine Motor": ["pinch", "trace", "place", "squeeze", "draw"],
    "Gross Motor": ["move", "jump", "crawl", "balance", "stretch"],
    Science: ["observe", "change", "texture", "compare", "wonder"],
    Math: ["count", "more", "less", "shape", "pattern"],
    "Creative Arts": ["create", "color", "music", "pretend", "design"],
    "Self Help": ["try", "clean", "choose", "help", "independent"],
  };
  return [...new Set([theme, ...words, ...(areaWords[area] || areaWords.Cognitive)])].join(", ");
}

function lessonObjectives(resource, theme, area) {
  const base = resource.learningObjectives || [
    "Support developmental growth through play-based learning.",
    "Build language, confidence, social connection, and participation.",
    "Provide hands-on activities with simple materials.",
  ];
  return [
    ...base,
    lessonAreaPractice(area, theme, resource.age),
    `Connect ${theme.toLowerCase()} learning to books, songs, sensory play, movement, art, and child-led exploration.`,
  ];
}

function lessonDailyPlans(resource, theme, area) {
  const age = resource.age || "Preschool";
  const focus = resource.activityFocus || resource.tags.find((tag) => activityTypes.includes(tag)) || "Hands-on";
  const ageSupport = {
    Infant: {
      intro: `Show one ${theme.toLowerCase()} photo or prop during floor play. Name it slowly and repeat the word while the child looks, reaches, babbles, or turns away.`,
      small: `Offer two safe ${theme.toLowerCase()} objects or picture cards. Let the child touch, look, mouth safely if appropriate, or choose one item.`,
      active: `Add a simple lap bounce, tummy-time reach, scarf movement, or gentle action song connected to ${theme.toLowerCase()}.`,
      support: "Respond to eye gaze, gestures, sounds, smiles, reaching, or turning away. Stop and adjust when the child needs a break.",
    },
    Toddler: {
      intro: `Introduce ${theme.toLowerCase()} with a short book, song, or real-life photo. Ask children to point, name, copy a sound, or choose a favorite item.`,
      small: `Invite children to sort, carry, match, stack, scoop, draw, or place ${theme.toLowerCase()} materials with simple teacher support.`,
      active: `Play a movement game where children move, freeze, crawl, jump, or pretend using ${theme.toLowerCase()} vocabulary.`,
      support: "Offer two choices, model the first step, use repeated words, and allow movement breaks.",
    },
    Preschool: {
      intro: `Begin with a ${theme.toLowerCase()} question, book, photo, or object. Invite children to predict, describe, compare, and share what they already know.`,
      small: `Guide a small group task where children sort, count, draw, write, build, investigate, or explain an idea connected to ${theme.toLowerCase()}.`,
      active: `Add a partner activity, dramatic play invitation, movement challenge, or open-ended art/science extension.`,
      support: "Ask open-ended questions, document child language, and offer an added challenge for children who are ready.",
    },
  };
  const support = ageSupport[age] || ageSupport.Preschool;
  return `Monday - Introduce the Theme
Circle Time: ${support.intro}
Main Activity: Create a shared ${theme.toLowerCase()} anchor chart or display. Add child words, drawings, photos, or teacher notes as children participate.
${area} Focus: ${lessonAreaPractice(area, theme, age)}
Teacher Language: "I see you noticing ${theme.toLowerCase()}. What can we try next?"
Observation Look-For: Watch for interest, participation, attention, gestures, words, choices, or attempts to use the material.

Tuesday - Build Vocabulary and Concepts
Circle Time: Sing a repeated song or fingerplay using ${theme.toLowerCase()} vocabulary. Pause so children can fill in a sound, motion, word, or gesture.
Small Group: ${support.small}
Printable or Table Activity: Use a simple ${theme.toLowerCase()} tracing, matching, counting, coloring, or drawing page. Keep support age-appropriate.
Teacher Language: "You found one that is the same. Let's say the word together."
Observation Look-For: Notice new words, pointing, matching, repeating, eye contact, turn-taking, or problem solving.

Wednesday - Hands-On ${area} Practice
Circle Time: Review two favorite words from the week and invite children to show, say, move, or draw an example.
Small Group: ${lessonAreaPractice(area, theme, age)}
${focus} Extension: Add blocks, art, sensory materials, dramatic play props, outdoor movement, or science tools so children can explore the idea in a new way.
Teacher Language: "You tried another way. That is careful thinking."
Observation Look-For: Document one clear example of ${area.toLowerCase()} development during play.

Thursday - Creative Expression and Child Choice
Circle Time: Revisit the theme book, song, photo, or prop. Invite children to choose what they want to explore again.
Art / Sensory / Pretend Play: ${support.active}
Choice Time: Let children repeat a favorite activity, use the materials in a new way, or work with a peer.
Teacher Language: "Tell me about your work. I want to hear your idea."
Observation Look-For: Watch for confidence, persistence, peer interaction, independent choices, and expressive language.

Friday - Review, Document, and Connect Home
Circle Time: Review the week with photos, child work, props, or a simple question: "What did we learn about ${theme.toLowerCase()}?"
Small Group: Repeat the most successful activity and add one small challenge for children who are ready.
Assessment Note: Record each child's participation, new vocabulary, developmental skill, support needed, and next step.
Family Connection: Send home one ${theme.toLowerCase()} word, song, question, or simple activity families can try over the weekend.
Teacher Reflection: ${support.support}`;
}

function resourceDownloadBody(resource) {
  const savedContent = resource.customContent || decodedTextFileData(resource);
  if (savedContent) {
    return savedContent;
  }
  if (resource.category === "Lesson Plans") {
    const theme = resource.theme || resourceTheme(resource);
    const area = resourceFocus(resource);
    const standards = resourceStandardConnections(resource);
    const objectives = lessonObjectives(resource, theme, area);
    return `Weekly Lesson Plan
Title: ${resource.title}
Theme: ${resource.theme || resource.tags[0]}
Month: ${resource.month}
Age Group: ${resource.age}
Developmental Area: ${area}
Holiday: ${resource.holiday || "Non-Holiday"}

Weekly Overview
${resource.weeklyOverview || resource.description}

Age Group Teaching Approach
${lessonAgeApproach(resource.age)}

Learning Objectives
${objectives.map((item) => `- ${item}`).join("\n")}

ELG / Early Learning Standard Connections
${standards}

Materials
${resource.materials || lessonThemeMaterials(theme)}

Vocabulary
${lessonVocabulary(theme, area)}

${lessonDailyPlans(resource, theme, area)}

Related Activities
${(resource.relatedActivities || ["Circle time", "Small group", "Printable extension"]).map((item) => `- ${item}`).join("\n")}

Differentiation and Supports
- Offer fewer materials, more modeling, shorter wait time, or one-to-one support for children who need extra help.
- Add vocabulary, sorting, drawing, counting, writing, leadership, or peer-helper roles for children who are ready for more.
- Adapt materials for allergies, sensory needs, motor access, communication supports, and family culture.

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
    return formResourceContent(resource);
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
  const type = printableType(resource);
  const theme = printableTheme(resource);
  return `Printable Resource
${resource.title}

Printable Type
${type}

Theme / Skill
${theme}

Age Group: ${resource.age}

Teacher Directions
Print or display this activity for a short small-group, table-time, portfolio, or take-home activity. Read the directions aloud, model one example, then let children complete the page with support.

Child Directions
Listen to the teacher directions. Try the activity carefully. Tell your teacher what you notice, count, color, trace, cut, match, draw, or write.

Printable Page
${printableWorksheetContent(resource)}

Learning Goal
Children will practice early literacy, math, fine motor control, vocabulary, visual discrimination, independence, and confidence with a ready-to-use printable activity.

Provider Note
Use close supervision with scissors, small pieces, or art materials. Adjust expectations for each child's age, development, and individual support needs.`;
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
          <button class="primary-button" id="downloadPdfButton" type="button" hidden>Download PDF</button>
          <button class="primary-button" id="printResourceButton" type="button">Print / Save PDF</button>
        </div>
        <div class="resource-viewer-body" id="resourceViewerBody"></div>
      </div>
    </div>
  `);
  document.querySelector("#closeResourceViewer")?.addEventListener("click", closeResourceViewer);
  document.querySelector("#downloadPdfButton")?.addEventListener("click", downloadActiveResourcePdf);
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
  activeGeneratedPdfResource = null;
}

function printResourceViewer() {
  const viewer = document.querySelector("#resourceViewerModal");
  if (!viewer?.classList.contains("open")) return;
  trackEvent("resource_print", {
    title: document.querySelector("#resourceViewerTitle")?.textContent || "Resource",
    category: document.querySelector("#resourceViewerCategory")?.textContent || "Resource",
  });
  document.body.classList.add("printing-resource");
  const cleanup = () => {
    document.body.classList.remove("printing-resource");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 1600);
}

function hasResourcePdf(resource) {
  return Boolean(resource && viewMap[resourceViewForCategory(resource.category)]);
}

function pdfEscapeText(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pdfSafeText(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

function wrapPdfText(text, maxChars) {
  const words = pdfSafeText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function createPdfBlob(content) {
  const stream = content.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function createPdfDocumentBlob(pageStreams) {
  const safeStreams = pageStreams.length ? pageStreams : [["BT /F1 12 Tf 50 720 Td (Little Learner Hub) Tj ET"].join("\n")];
  const pageRefs = safeStreams.map((_, index) => 5 + (index * 2));
  const contentRefs = safeStreams.map((_, index) => 6 + (index * 2));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${safeStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  safeStreams.forEach((lines, index) => {
    const stream = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
    const pageRef = pageRefs[index];
    const contentRef = contentRefs[index];
    objects[pageRef - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`;
    objects[contentRef - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function resourcePdfText(resource) {
  return resourceDocumentText(resource);
}

function isPdfHeading(line) {
  const text = String(line || "").trim();
  if (!text || text.includes("___")) return false;
  if (/^(Little Learner Hub|Category:|Age Group:|Access:|Format:|Tags:)/.test(text)) return false;
  if (text.length > 60) return false;
  return /^[A-Z0-9][A-Za-z0-9 &'./():-]+$/.test(text)
    && !/[.!?]$/.test(text)
    && (text === text.toUpperCase() || !text.includes(":"));
}

function buildTextResourcePdfBlob(resource) {
  const lines = resourcePdfText(resource).split("\n");
  const isFormResource = resource.category === "Forms Library";
  const pages = [];
  let page = [];
  let y = 708;
  const add = (value, x, size = 10, font = "F1", color = "0 0 0") => {
    page.push(`${color} rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscapeText(value)}) Tj ET`);
  };
  const addLine = (x1, y1, x2, y2, width = 1, color = "0.72 0.72 0.72") => {
    page.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const startPage = () => {
    page = [];
    y = 708;
    page.push("0.20 0.38 0.38 rg 36 724 540 32 re f");
    page.push(`1 1 1 rg BT /F2 12 Tf 50 736 Td (${pdfEscapeText("Little Learner Hub")}) Tj ET`);
    page.push(`0 0 0 rg BT /F2 16 Tf 50 704 Td (${pdfEscapeText(resource.title)}) Tj ET`);
    page.push(`0.25 0.25 0.25 rg BT /F1 9 Tf 50 688 Td (${pdfEscapeText(`${resource.category} | ${resource.age} | ${resource.plan}`)}) Tj ET`);
    page.push("0.82 0.82 0.82 RG 1 w 50 676 m 544 676 l S");
    y = 654;
  };
  const finishPage = () => {
    page.push(`0.35 0.35 0.35 rg BT /F1 8 Tf 50 38 Td (${pdfEscapeText("Generated by Little Learner Hub. Review and customize for your program before use.")}) Tj ET`);
    pages.push(page);
  };
  const ensureSpace = (needed = 18) => {
    if (y - needed >= 70) return;
    finishPage();
    startPage();
  };
  startPage();
  lines.forEach((rawLine) => {
    const original = pdfSafeText(rawLine).trimEnd();
    if (!original.trim()) {
      y -= isFormResource ? 12 : 8;
      ensureSpace(isFormResource ? 20 : 16);
      return;
    }
    const heading = isPdfHeading(original);
    const checkbox = /^\[\s?\]\s+/.test(original);
    const writingLine = original.includes("____");
    const bullet = /^(-|\*)\s+/.test(original);
    const wrapped = wrapPdfText(original.replace(/^(-|\*)\s+/, "- "), heading ? 58 : 92);
    if (heading) {
      ensureSpace(isFormResource ? 32 : 26);
      y -= isFormResource ? 6 : 4;
      add(original, 50, isFormResource ? 13 : 12, "F2", "0.20 0.38 0.38");
      addLine(50, y - 5, 544, y - 5, 1, "0.76 0.84 0.82");
      y -= isFormResource ? 25 : 21;
      return;
    }
    wrapped.forEach((lineText, index) => {
      ensureSpace(isFormResource ? 19 : 16);
      const x = bullet || checkbox ? 66 : 58;
      add(lineText, x, isFormResource ? 10 : 9.5, "F1");
      if (writingLine && index === wrapped.length - 1) addLine(58, y - 5, 544, y - 5, 1, "0.62 0.62 0.62");
      y -= isFormResource ? 17 : 14;
    });
  });
  finishPage();
  return createPdfDocumentBlob(pages);
}

function buildPrintablePdfBlob(resource) {
  const theme = printableTheme(resource);
  const type = printableType(resource);
  const words = themeVocabulary(theme);
  const toddler = resource.age === "Toddler";
  const letter = printableLetter(theme);
  const number = printableNumber(theme);
  const content = [];
  const text = (value, x, y, size = 11, font = "F1", color = "0 0 0") => {
    content.push(`${color} rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscapeText(value)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2, width = 1, color = "0 0 0") => {
    content.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const rect = (x, y, width, height, color = "0 0 0") => {
    content.push(`${color} RG 1 w ${x} ${y} ${width} ${height} re S`);
  };
  const fillRect = (x, y, width, height, color) => {
    content.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
  };
  const dashedLine = (x1, y1, x2, y2) => {
    content.push("[6 5] 0 d");
    line(x1, y1, x2, y2, 1, "0.65 0.65 0.65");
    content.push("[] 0 d");
  };
  const wrapped = (value, x, y, maxChars, size = 10) => {
    wrapPdfText(value, maxChars).forEach((lineText, index) => text(lineText, x, y - (index * (size + 4)), size));
  };
  const checkbox = (x, y, label) => {
    rect(x, y - 2, 10, 10, "0.25 0.25 0.25");
    text(label, x + 16, y, 10);
  };
  const writeLine = (label, y) => {
    text(label, 58, y + 4, 10, "F2");
    line(190, y, 544, y, 1, "0.55 0.55 0.55");
  };
  const drawFooter = () => {
    text("Provider note: printable supports early learning, fine motor practice, vocabulary, and confidence.", 50, 54, 9, "F1", "0.25 0.25 0.25");
  };
  const drawWorkBox = (label, y, height) => {
    text(label, 50, y + height + 10, 12, "F2");
    rect(50, y, 494, height, "0.45 0.45 0.45");
  };
  const circle = (cx, cy, r, color = "0.25 0.25 0.25", width = 1.4) => {
    const k = 0.5522847498;
    content.push(`${color} RG ${width} w ${cx + r} ${cy} m ${cx + r} ${cy + (k * r)} ${cx + (k * r)} ${cy + r} ${cx} ${cy + r} c ${cx - (k * r)} ${cy + r} ${cx - r} ${cy + (k * r)} ${cx - r} ${cy} c ${cx - r} ${cy - (k * r)} ${cx - (k * r)} ${cy - r} ${cx} ${cy - r} c ${cx + (k * r)} ${cy - r} ${cx + r} ${cy - (k * r)} ${cx + r} ${cy} c S`);
  };
  const ellipse = (cx, cy, rx, ry, color = "0.25 0.25 0.25", width = 1.4) => {
    const k = 0.5522847498;
    content.push(`${color} RG ${width} w ${cx + rx} ${cy} m ${cx + rx} ${cy + (k * ry)} ${cx + (k * rx)} ${cy + ry} ${cx} ${cy + ry} c ${cx - (k * rx)} ${cy + ry} ${cx - rx} ${cy + (k * ry)} ${cx - rx} ${cy} c ${cx - rx} ${cy - (k * ry)} ${cx - (k * rx)} ${cy - ry} ${cx} ${cy - ry} c ${cx + (k * rx)} ${cy - ry} ${cx + rx} ${cy - (k * ry)} ${cx + rx} ${cy} c S`);
  };
  const polyline = (points, close = false, color = "0.25 0.25 0.25", width = 1.4) => {
    if (!points.length) return;
    const [first, ...rest] = points;
    content.push(`${color} RG ${width} w ${first[0]} ${first[1]} m ${rest.map(([x, y]) => `${x} ${y} l`).join(" ")} ${close ? "h" : ""} S`);
  };
  const star = (cx, cy, size) => {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = (-Math.PI / 2) + (index * Math.PI / 5);
      const r = index % 2 === 0 ? size : size * 0.42;
      return [cx + (Math.cos(angle) * r), cy + (Math.sin(angle) * r)];
    });
    polyline(points, true);
  };
  const cartoonFace = (cx, cy, scale = 1, color = "0.25 0.25 0.25") => {
    circle(cx - (7 * scale), cy + (5 * scale), 1.8 * scale, color, 1);
    circle(cx + (7 * scale), cy + (5 * scale), 1.8 * scale, color, 1);
    content.push(`${color} RG ${1.2 * scale} w ${cx - (10 * scale)} ${cy - (4 * scale)} m ${cx - (4 * scale)} ${cy - (12 * scale)} ${cx + (4 * scale)} ${cy - (12 * scale)} ${cx + (10 * scale)} ${cy - (4 * scale)} c S`);
  };
  const drawTopicMark = (x, y, topic = theme, label = "") => {
    const lowerTheme = String(topic || theme).toLowerCase();
    if (lowerTheme.includes("dinosaur")) {
      ellipse(x + 13, y + 12, 15, 9);
      circle(x + 30, y + 17, 7);
      polyline([[0 + x, y + 14], [x - 12, y + 22], [x + 2, y + 18]]);
      line(x + 7, y + 3, x + 5, y - 6, 1.2, "0.25 0.25 0.25");
      line(x + 20, y + 3, x + 23, y - 6, 1.2, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("ocean")) {
      ellipse(x + 14, y + 12, 16, 9);
      polyline([[x + 29, y + 12], [x + 43, y + 22], [x + 43, y + 2]], true);
      circle(x + 8, y + 14, 1.6);
    } else if (lowerTheme.includes("transportation")) {
      rect(x - 2, y + 5, 44, 22);
      circle(x + 8, y + 4, 4);
      circle(x + 32, y + 4, 4);
      line(x + 6, y + 20, x + 36, y + 20, 1.1, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("space")) {
      polyline([[x + 14, y], [x + 26, y + 34], [x + 38, y], [x + 26, y + 8]], true);
      circle(x + 26, y + 20, 4);
      star(x + 3, y + 28, 5);
    } else if (lowerTheme.includes("bug") || lowerTheme.includes("insect")) {
      ellipse(x + 18, y + 14, 10, 14);
      ellipse(x + 33, y + 14, 10, 14);
      circle(x + 26, y + 12, 5);
      line(x + 26, y + 18, x + 20, y + 28, 1.1, "0.25 0.25 0.25");
      line(x + 26, y + 18, x + 34, y + 28, 1.1, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("weather")) {
      circle(x + 12, y + 22, 10);
      ellipse(x + 32, y + 10, 17, 8);
      line(x + 28, y - 4, x + 24, y - 13, 1.1, "0.25 0.25 0.25");
      line(x + 38, y - 4, x + 34, y - 13, 1.1, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("sun")) {
      circle(x + 20, y + 20, 10);
      Array.from({ length: 8 }).forEach((_, index) => {
        const angle = index * Math.PI / 4;
        line(x + 20 + (Math.cos(angle) * 14), y + 20 + (Math.sin(angle) * 14), x + 20 + (Math.cos(angle) * 22), y + 20 + (Math.sin(angle) * 22), 1, "0.25 0.25 0.25");
      });
    } else if (lowerTheme.includes("wave")) {
      polyline([[x + 0, y + 10], [x + 12, y + 22], [x + 24, y + 10], [x + 36, y + 22], [x + 48, y + 10]]);
      polyline([[x + 0, y + 0], [x + 12, y + 12], [x + 24, y + 0], [x + 36, y + 12], [x + 48, y + 0]]);
    } else if (lowerTheme.includes("ice cream")) {
      polyline([[x + 12, y - 4], [x + 24, y + 30], [x + 36, y - 4]], true);
      ellipse(x + 24, y + 33, 20, 8);
      circle(x + 18, y + 43, 7);
      circle(x + 29, y + 45, 7);
    } else if (lowerTheme.includes("ball")) {
      circle(x + 24, y + 18, 16);
      line(x + 13, y + 29, x + 35, y + 7, 1, "0.25 0.25 0.25");
      line(x + 13, y + 7, x + 35, y + 29, 1, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("summer")) {
      circle(x + 15, y + 24, 12);
      Array.from({ length: 8 }).forEach((_, index) => {
        const angle = index * Math.PI / 4;
        line(x + 15 + (Math.cos(angle) * 17), y + 24 + (Math.sin(angle) * 17), x + 15 + (Math.cos(angle) * 25), y + 24 + (Math.sin(angle) * 25), 1, "0.25 0.25 0.25");
      });
      circle(x + 39, y + 9, 10);
      line(x + 31, y + 15, x + 47, y + 3, 1, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("spring")) {
      circle(x + 22, y + 21, 5);
      [0, 1, 2, 3, 4, 5].forEach((index) => {
        const angle = index * Math.PI / 3;
        circle(x + 22 + (Math.cos(angle) * 11), y + 21 + (Math.sin(angle) * 11), 5);
      });
      line(x + 22, y + 15, x + 22, y - 8, 1, "0.25 0.25 0.25");
      polyline([[x + 22, y + 5], [x + 9, y + 12], [x + 22, y + 10]]);
    } else if (lowerTheme.includes("fall")) {
      polyline([[x + 22, y + 34], [x + 10, y + 22], [x + 18, y + 20], [x + 8, y + 11], [x + 20, y + 13], [x + 22, y + 0], [x + 26, y + 13], [x + 38, y + 11], [x + 28, y + 20], [x + 36, y + 22]], true);
      line(x + 22, y + 2, x + 22, y + 31, 1, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("winter")) {
      circle(x + 22, y + 7, 9);
      circle(x + 22, y + 22, 7);
      circle(x + 22, y + 34, 5);
      line(x + 8, y + 22, x + 1, y + 28, 1, "0.25 0.25 0.25");
      line(x + 36, y + 22, x + 43, y + 28, 1, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("apple")) {
      circle(x + 18, y + 16, 11);
      circle(x + 28, y + 16, 11);
      line(x + 23, y + 28, x + 24, y + 39, 1.2, "0.25 0.25 0.25");
      polyline([[x + 25, y + 33], [x + 39, y + 39], [x + 31, y + 29]], true);
    } else if (lowerTheme.includes("pumpkin")) {
      ellipse(x + 23, y + 18, 18, 14);
      ellipse(x + 23, y + 18, 8, 14);
      line(x + 23, y + 31, x + 26, y + 40, 1.2, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("christmas")) {
      polyline([[x + 24, y + 42], [x + 8, y + 20], [x + 17, y + 20], [x + 5, y + 4], [x + 43, y + 4], [x + 31, y + 20], [x + 40, y + 20]], true);
      rect(x + 19, y - 6, 10, 10);
      star(x + 24, y + 45, 5);
    } else if (lowerTheme.includes("valentine") || lowerTheme.includes("feeling") || lowerTheme.includes("friend")) {
      content.push(`0.25 0.25 0.25 RG 1.4 w ${x + 22} ${y + 8} m ${x + 0} ${y + 25} ${x + 8} ${y + 42} ${x + 22} ${y + 30} c ${x + 36} ${y + 42} ${x + 44} ${y + 25} ${x + 22} ${y + 8} c S`);
    } else if (lowerTheme.includes("st. patrick")) {
      circle(x + 16, y + 25, 8);
      circle(x + 30, y + 25, 8);
      circle(x + 23, y + 13, 8);
      line(x + 23, y + 6, x + 14, y - 8, 1.2, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("4th") || lowerTheme.includes("july")) {
      line(x + 8, y - 4, x + 8, y + 38, 1.2, "0.25 0.25 0.25");
      rect(x + 8, y + 20, 34, 18);
      line(x + 8, y + 26, x + 42, y + 26, 1, "0.25 0.25 0.25");
      line(x + 8, y + 32, x + 42, y + 32, 1, "0.25 0.25 0.25");
      star(x + 17, y + 32, 4);
    } else if (lowerTheme.includes("farm")) {
      rect(x + 3, y + 2, 34, 24);
      polyline([[x + 1, y + 26], [x + 20, y + 40], [x + 39, y + 26]], true);
      rect(x + 14, y + 2, 12, 15);
    } else if (lowerTheme.includes("shape")) {
      circle(x + 8, y + 15, 8);
      rect(x + 24, y + 7, 16, 16);
      polyline([[x + 54, y + 8], [x + 44, y + 26], [x + 64, y + 26]], true);
    } else {
      rect(x, y + 2, 42, 26);
      circle(x + 12, y + 15, 7);
      star(x + 30, y + 16, 8);
    }
    if (label) text(label, x - 2, y - 16, 7.5, "F1", "0.25 0.25 0.25");
  };
  const drawMiniThemeMark = (x, y, label = "") => drawTopicMark(x, y, theme, label);
  const drawThemeColoringScene = (x, y, width, height) => {
    rect(x, y, width, height, "0.35 0.35 0.35");
    const lowerTheme = theme.toLowerCase();
    text(`Color the ${theme.toLowerCase()} picture.`, x + 14, y + height - 24, 12, "F2");
    if (lowerTheme.includes("dinosaur")) {
      ellipse(x + 235, y + 155, 95, 46);
      circle(x + 335, y + 183, 34);
      circle(x + 346, y + 192, 3);
      polyline([[x + 145, y + 162], [x + 72, y + 205], [x + 154, y + 188]], true);
      [[180, 202], [215, 213], [250, 212], [285, 204]].forEach(([px, py]) => polyline([[x + px, y + py], [x + px + 18, y + py + 30], [x + px + 36, y + py]], true));
      line(x + 192, y + 110, x + 176, y + 56, 2, "0.25 0.25 0.25");
      line(x + 268, y + 110, x + 290, y + 56, 2, "0.25 0.25 0.25");
      circle(x + 392, y + 70, 18);
      circle(x + 430, y + 62, 12);
      text("egg", x + 384, y + 34, 9);
    } else if (lowerTheme.includes("farm")) {
      rect(x + 65, y + 92, 140, 105);
      polyline([[x + 48, y + 197], [x + 135, y + 260], [x + 224, y + 197]], true);
      rect(x + 118, y + 92, 36, 62);
      line(x + 118, y + 123, x + 154, y + 154, 1.2, "0.25 0.25 0.25");
      line(x + 154, y + 123, x + 118, y + 154, 1.2, "0.25 0.25 0.25");
      ellipse(x + 335, y + 120, 62, 34);
      circle(x + 400, y + 135, 25);
      circle(x + 392, y + 144, 2);
      circle(x + 408, y + 144, 2);
      line(x + 294, y + 88, x + 286, y + 54, 1.5, "0.25 0.25 0.25");
      line(x + 360, y + 88, x + 370, y + 54, 1.5, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("ocean")) {
      [[180, 170], [285, 120], [380, 185]].forEach(([px, py]) => drawMiniThemeMark(x + px, y + py, ""));
      for (let i = 0; i < 5; i += 1) {
        polyline([[x + 60 + (i * 78), y + 64], [x + 92 + (i * 78), y + 78], [x + 124 + (i * 78), y + 64]]);
      }
      circle(x + 90, y + 210, 7);
      circle(x + 112, y + 236, 4);
      circle(x + 430, y + 240, 6);
    } else if (lowerTheme.includes("transportation")) {
      rect(x + 118, y + 120, 250, 90);
      rect(x + 138, y + 170, 45, 28);
      rect(x + 198, y + 170, 45, 28);
      rect(x + 258, y + 170, 45, 28);
      circle(x + 170, y + 112, 20);
      circle(x + 318, y + 112, 20);
      line(x + 60, y + 84, x + 442, y + 84, 2, "0.25 0.25 0.25");
    } else if (lowerTheme.includes("space")) {
      polyline([[x + 244, y + 74], [x + 286, y + 245], [x + 328, y + 74], [x + 286, y + 110]], true);
      circle(x + 286, y + 180, 22);
      polyline([[x + 244, y + 100], [x + 206, y + 62], [x + 258, y + 78]], true);
      polyline([[x + 328, y + 100], [x + 366, y + 62], [x + 314, y + 78]], true);
      [[90, 230], [146, 116], [412, 226], [430, 108], [170, 250]].forEach(([px, py]) => star(x + px, y + py, 11));
      ellipse(x + 112, y + 70, 44, 17);
    } else if (lowerTheme.includes("bug") || lowerTheme.includes("insect")) {
      ellipse(x + 220, y + 150, 70, 85);
      ellipse(x + 350, y + 150, 70, 85);
      circle(x + 286, y + 140, 34);
      line(x + 286, y + 172, x + 244, y + 240, 1.5, "0.25 0.25 0.25");
      line(x + 286, y + 172, x + 332, y + 240, 1.5, "0.25 0.25 0.25");
      circle(x + 276, y + 150, 3);
      circle(x + 296, y + 150, 3);
      rect(x + 80, y + 44, 360, 10);
      [[120, 54], [170, 54], [415, 54]].forEach(([px, py]) => {
        line(x + px, y + py, x + px, y + py + 50, 1.2, "0.25 0.25 0.25");
        circle(x + px, y + py + 64, 14);
      });
    } else if (lowerTheme.includes("weather")) {
      circle(x + 132, y + 214, 44);
      Array.from({ length: 8 }).forEach((_, index) => {
        const angle = index * Math.PI / 4;
        line(x + 132 + (Math.cos(angle) * 58), y + 214 + (Math.sin(angle) * 58), x + 132 + (Math.cos(angle) * 78), y + 214 + (Math.sin(angle) * 78), 1.5, "0.25 0.25 0.25");
      });
      ellipse(x + 306, y + 180, 72, 30);
      ellipse(x + 256, y + 182, 42, 24);
      ellipse(x + 360, y + 184, 42, 24);
      [[270, 132], [314, 126], [360, 132]].forEach(([px, py]) => line(x + px, y + py, x + px - 12, y + py - 34, 1.4, "0.25 0.25 0.25"));
    } else if (lowerTheme.includes("summer")) {
      circle(x + 388, y + 252, 36, "0.20 0.20 0.20", 2);
      Array.from({ length: 10 }).forEach((_, index) => {
        const angle = index * Math.PI / 5;
        line(x + 388 + (Math.cos(angle) * 48), y + 252 + (Math.sin(angle) * 48), x + 388 + (Math.cos(angle) * 66), y + 252 + (Math.sin(angle) * 66), 1.8, "0.20 0.20 0.20");
      });
      cartoonFace(x + 388, y + 250, 1.1, "0.20 0.20 0.20");
      ellipse(x + 104, y + 270, 46, 17, "0.20 0.20 0.20", 1.7);
      ellipse(x + 146, y + 270, 38, 14, "0.20 0.20 0.20", 1.7);
      for (let i = 0; i < 4; i += 1) {
        polyline([[x + 54 + (i * 94), y + 70], [x + 88 + (i * 94), y + 90], [x + 122 + (i * 94), y + 70]], false, "0.20 0.20 0.20", 2);
        polyline([[x + 54 + (i * 94), y + 50], [x + 88 + (i * 94), y + 70], [x + 122 + (i * 94), y + 50]], false, "0.20 0.20 0.20", 1.6);
      }
      polyline([[x + 74, y + 200], [x + 130, y + 258], [x + 186, y + 200]], false, "0.20 0.20 0.20", 2);
      line(x + 130, y + 200, x + 130, y + 105, 1.8, "0.20 0.20 0.20");
      line(x + 100, y + 200, x + 160, y + 200, 1.5, "0.20 0.20 0.20");
      line(x + 112, y + 213, x + 148, y + 213, 1.2, "0.20 0.20 0.20");
      circle(x + 150, y + 160, 38, "0.20 0.20 0.20", 2);
      line(x + 123, y + 187, x + 177, y + 133, 1.5, "0.20 0.20 0.20");
      line(x + 123, y + 133, x + 177, y + 187, 1.5, "0.20 0.20 0.20");
      cartoonFace(x + 150, y + 156, 0.9, "0.20 0.20 0.20");
      polyline([[x + 256, y + 92], [x + 286, y + 176], [x + 316, y + 92]], true, "0.20 0.20 0.20", 2);
      ellipse(x + 286, y + 185, 33, 13, "0.20 0.20 0.20", 2);
      circle(x + 274, y + 202, 12, "0.20 0.20 0.20", 2);
      circle(x + 298, y + 204, 12, "0.20 0.20 0.20", 2);
      cartoonFace(x + 286, y + 184, 0.75, "0.20 0.20 0.20");
      polyline([[x + 372, y + 92], [x + 422, y + 92], [x + 412, y + 42], [x + 382, y + 42]], true, "0.20 0.20 0.20", 2);
      ellipse(x + 397, y + 92, 26, 12, "0.20 0.20 0.20", 1.5);
      line(x + 397, y + 104, x + 397, y + 128, 1.5, "0.20 0.20 0.20");
      polyline([[x + 383, y + 128], [x + 411, y + 128], [x + 397, y + 148]], true, "0.20 0.20 0.20", 1.5);
      [[72, 116], [238, 56], [460, 138]].forEach(([px, py]) => {
        circle(x + px, y + py, 7, "0.20 0.20 0.20", 1.3);
        line(x + px - 10, y + py - 4, x + px + 10, y + py - 4, 1, "0.20 0.20 0.20");
      });
    } else if (lowerTheme.includes("spring")) {
      ellipse(x + 104, y + 236, 70, 26);
      ellipse(x + 165, y + 236, 58, 22);
      [[106, 174], [195, 142], [302, 174], [390, 136]].forEach(([px, py]) => {
        circle(x + px, y + py, 9);
        [0, 1, 2, 3, 4, 5].forEach((index) => {
          const angle = index * Math.PI / 3;
          circle(x + px + (Math.cos(angle) * 18), y + py + (Math.sin(angle) * 18), 9);
        });
        line(x + px, y + py - 12, x + px, y + 60, 1.2, "0.25 0.25 0.25");
      });
      [[248, 212], [292, 206], [336, 210]].forEach(([px, py]) => line(x + px, y + py, x + px - 10, y + py - 34, 1.3, "0.25 0.25 0.25"));
    } else if (lowerTheme.includes("fall")) {
      rect(x + 70, y + 54, 360, 12);
      [[115, 210], [205, 155], [300, 216], [390, 148]].forEach(([px, py]) => drawMiniThemeMark(x + px, y + py, ""));
      ellipse(x + 250, y + 86, 46, 34);
      ellipse(x + 250, y + 86, 18, 34);
      line(x + 250, y + 120, x + 258, y + 146, 1.5, "0.25 0.25 0.25");
      text("fall leaves", x + 206, y + 34, 10);
    } else if (lowerTheme.includes("winter")) {
      circle(x + 250, y + 88, 44);
      circle(x + 250, y + 155, 34);
      circle(x + 250, y + 210, 24);
      line(x + 208, y + 156, x + 160, y + 190, 1.4, "0.25 0.25 0.25");
      line(x + 292, y + 156, x + 340, y + 190, 1.4, "0.25 0.25 0.25");
      [[102, 232], [390, 232], [118, 112], [410, 116]].forEach(([px, py]) => {
        line(x + px - 12, y + py, x + px + 12, y + py, 1.2, "0.25 0.25 0.25");
        line(x + px, y + py - 12, x + px, y + py + 12, 1.2, "0.25 0.25 0.25");
        line(x + px - 8, y + py - 8, x + px + 8, y + py + 8, 1.2, "0.25 0.25 0.25");
        line(x + px - 8, y + py + 8, x + px + 8, y + py - 8, 1.2, "0.25 0.25 0.25");
      });
    } else if (lowerTheme.includes("season")) {
      [["spring", 82, 162], ["summer", 202, 162], ["fall", 322, 162], ["winter", 82, 58]].forEach(([label, px, py]) => {
        rect(x + px, y + py, 82, 72);
        text(label, x + px + 12, y + py + 12, 10, "F2");
        drawMiniThemeMark(x + px + 24, y + py + 32, "");
      });
    } else if (lowerTheme.includes("apple")) {
      rect(x + 92, y + 58, 300, 22);
      [[150, 145], [230, 198], [312, 142], [370, 210], [280, 96]].forEach(([px, py]) => drawMiniThemeMark(x + px, y + py, ""));
      polyline([[x + 110, y + 80], [x + 250, y + 265], [x + 390, y + 80]], false);
    } else if (lowerTheme.includes("pumpkin")) {
      [[130, 118], [235, 156], [352, 112]].forEach(([px, py]) => drawMiniThemeMark(x + px, y + py, ""));
      rect(x + 86, y + 54, 330, 18);
      text("pumpkin patch", x + 198, y + 32, 11, "F2");
    } else if (lowerTheme.includes("christmas")) {
      polyline([[x + 250, y + 236], [x + 172, y + 142], [x + 210, y + 142], [x + 152, y + 72], [x + 206, y + 72], [x + 134, y + 28], [x + 366, y + 28], [x + 294, y + 72], [x + 348, y + 72], [x + 290, y + 142], [x + 328, y + 142]], true, "0.20 0.20 0.20", 2.2);
      rect(x + 228, y + 0, 44, 28, "0.20 0.20 0.20");
      star(x + 250, y + 248, 17);
      cartoonFace(x + 250, y + 248, 0.55, "0.20 0.20 0.20");
      cartoonFace(x + 250, y + 116, 1, "0.20 0.20 0.20");
      [[196, 110], [250, 154], [310, 92], [236, 70], [284, 128], [215, 42], [328, 48]].forEach(([px, py]) => circle(x + px, y + py, 9, "0.20 0.20 0.20", 1.8));
      rect(x + 95, y + 32, 44, 34, "0.20 0.20 0.20");
      rect(x + 380, y + 34, 44, 34, "0.20 0.20 0.20");
      line(x + 117, y + 32, x + 117, y + 66, 1.2, "0.20 0.20 0.20");
      line(x + 95, y + 50, x + 139, y + 50, 1.2, "0.20 0.20 0.20");
      line(x + 402, y + 34, x + 402, y + 68, 1.2, "0.20 0.20 0.20");
      line(x + 380, y + 52, x + 424, y + 52, 1.2, "0.20 0.20 0.20");
    } else if (lowerTheme.includes("easter")) {
      [[150, 106], [230, 142], [324, 112]].forEach(([px, py]) => {
        ellipse(x + px, y + py, 32, 45);
        polyline([[x + px - 22, y + py], [x + px - 8, y + py + 12], [x + px + 8, y + py - 8], [x + px + 22, y + py + 8]]);
      });
      circle(x + 402, y + 188, 28);
      ellipse(x + 388, y + 226, 10, 30);
      ellipse(x + 416, y + 226, 10, 30);
    } else if (lowerTheme.includes("valentine")) {
      [[142, 132], [254, 188], [366, 122]].forEach(([px, py]) => {
        content.push(`0.25 0.25 0.25 RG 1.6 w ${x + px} ${y + py - 28} m ${x + px - 42} ${y + py + 8} ${x + px - 18} ${y + py + 58} ${x + px} ${y + py + 28} c ${x + px + 18} ${y + py + 58} ${x + px + 42} ${y + py + 8} ${x + px} ${y + py - 28} c S`);
      });
    } else if (lowerTheme.includes("st. patrick")) {
      [[170, 150], [285, 196], [380, 120]].forEach(([px, py]) => drawMiniThemeMark(x + px, y + py, ""));
      polyline([[x + 90, y + 68], [x + 420, y + 92]], false);
      text("rainbow path", x + 198, y + 40, 10);
    } else if (lowerTheme.includes("4th") || lowerTheme.includes("july")) {
      rect(x + 110, y + 118, 260, 130);
      Array.from({ length: 5 }).forEach((_, index) => line(x + 110, y + 140 + (index * 20), x + 370, y + 140 + (index * 20), 1.2, "0.25 0.25 0.25"));
      rect(x + 110, y + 188, 88, 60);
      [[132, 225], [170, 225], [132, 202], [170, 202]].forEach(([px, py]) => star(x + px, y + py, 7));
      [[90, 80], [420, 84], [330, 260]].forEach(([px, py]) => star(x + px, y + py, 16));
    } else if (lowerTheme.includes("shape") || lowerTheme.includes("color") || lowerTheme.includes("number") || lowerTheme.includes("letter")) {
      circle(x + 132, y + 184, 50);
      rect(x + 250, y + 138, 94, 94);
      polyline([[x + 420, y + 132], [x + 365, y + 224], [x + 475, y + 224]], true);
      star(x + 205, y + 86, 34);
      text(letter, x + 284, y + 70, 42, "F2", "0.25 0.25 0.25");
    } else {
      drawMiniThemeMark(x + 210, y + 160, "");
      drawMiniThemeMark(x + 310, y + 110, "");
      star(x + 118, y + 238, 18);
      rect(x + 78, y + 66, 120, 72);
      circle(x + 430, y + 214, 34);
      words.slice(0, 3).forEach((word, index) => text(word, x + 235 + (index * 58), y + 66, 13, "F2", "0.25 0.25 0.25"));
    }
  };
  const drawHeader = (directions) => {
    fillRect(36, 724, 540, 32, "0.20 0.38 0.38");
    text("Little Learner Hub", 50, 736, 12, "F2", "1 1 1");
    text(resource.title, 50, 704, 22, "F2");
    text(`${resource.age} ${type} | ${theme}`, 50, 686, 11);
    text("Name: ______________________________", 50, 660, 11);
    text("Date: __________________", 372, 660, 11);
    fillRect(48, 613, 516, 34, "0.93 0.97 0.96");
    rect(48, 613, 516, 34, "0.55 0.70 0.68");
    wrapped(directions, 60, 632, 84, 9);
  };
  const drawingPrompt = `Portfolio work sample connected to ${theme.toLowerCase()}.`;

  drawHeader(printablePdfDirections(resource, type, theme));

  if (type === "Tracing Worksheets") {
    text("Warm-Up Tracing Paths", 50, 590, 14, "F2");
    [["Straight path", 565], ["Bumpy path", 538], ["Zigzag path", 511], ["Circle path", 484]].forEach(([label, y]) => {
      text(label, 58, y + 2, 10, "F2");
      dashedLine(165, y, 544, y);
    });
    text("mmmmmmmmmmmmmmmmmmmmmm", 178, 533, 16, "F1", "0.58 0.58 0.58");
    text("/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\", 178, 506, 16, "F1", "0.58 0.58 0.58");
    text("O   O   O   O   O   O   O   O", 178, 479, 16, "F1", "0.58 0.58 0.58");
    text("Letter And Word Tracing", 50, 446, 14, "F2");
    text(`${letter}    ${letter}    ${letter}    ${letter}    ${letter}`, 58, 418, toddler ? 28 : 24, "F2", "0.68 0.68 0.68");
    line(58, 407, 544, 407, 1, "0.68 0.68 0.68");
    let wordY = 372;
    (toddler ? words.slice(0, 2) : [theme, ...words.slice(0, 3)]).forEach((word) => {
      text(word, 58, wordY, toddler ? 22 : 18, "F2", "0.68 0.68 0.68");
      line(58, wordY - 10, 544, wordY - 10, 1, "0.68 0.68 0.68");
      wordY -= toddler ? 42 : 34;
    });
    const promptY = toddler ? 270 : 240;
    text(toddler ? "Point, trace, and say one theme word." : "Write one theme word on your own:", 50, promptY, 12, "F2");
    line(260, promptY - 4, 544, promptY - 4, 1, "0.35 0.35 0.35");
    drawWorkBox(drawingPrompt, 80, promptY - 138);
  } else if (type === "Coloring Pages") {
    text("Color Key", 50, 590, 14, "F2");
    ["red", "blue", "green", "yellow", "brown"].forEach((color, index) => {
      rect(58 + (index * 96), 562, 18, 18, "0.25 0.25 0.25");
      text(color, 82 + (index * 96), 567, 10);
    });
    drawThemeColoringScene(50, 190, 494, 330);
    checkbox(58, 158, "I used careful coloring.");
    checkbox(288, 158, "I talked about my picture.");
  } else if (type === "Alphabet Practice") {
    text("Find The Letter", 50, 590, 14, "F2");
    text(`${letter}   ${letter.toLowerCase()}   ${letter}   ${letter.toLowerCase()}   ${letter}`, 78, 550, 34, "F2", "0.65 0.65 0.65");
    text("Circle the letters that match the theme beginning sound.", 58, 525, 10);
    text("Trace The Letter", 50, 490, 14, "F2");
    text(`${letter}    ${letter}    ${letter}    ${letter}    ${letter}`, 58, 455, 32, "F2", "0.68 0.68 0.68");
    line(58, 438, 544, 438, 1, "0.68 0.68 0.68");
    text("Beginning Sound Words", 50, 404, 14, "F2");
    words.forEach((word, index) => writeLine(`${word}:`, 370 - (index * 34)));
    drawWorkBox("Write or draw one beginning sound picture.", 80, 145);
  } else if (type === "Number Practice") {
    text("Trace The Number", 50, 590, 14, "F2");
    text(`${number}    ${number}    ${number}    ${number}    ${number}`, 70, 548, 36, "F2", "0.68 0.68 0.68");
    line(70, 532, 544, 532, 1, "0.68 0.68 0.68");
    text(`Count ${number} ${theme.toLowerCase()} items.`, 50, 495, 14, "F2");
    Array.from({ length: number }).forEach((_, index) => {
      const x = 68 + ((index % 9) * 52);
      const y = 450 - (Math.floor(index / 9) * 48);
      drawMiniThemeMark(x, y, "");
    });
    drawWorkBox(`Draw ${number} more or color the boxes.`, 80, 230);
  } else if (type === "Shape Practice") {
    text("Trace The Shapes", 50, 590, 14, "F2");
    text("O     []     /\\     <>     *", 82, 545, 34, "F2", "0.65 0.65 0.65");
    line(58, 525, 544, 525, 1, "0.68 0.68 0.68");
    text("Shape Hunt", 50, 490, 14, "F2");
    ["circle", "square", "triangle", "diamond", "star"].forEach((shape, index) => checkbox(62 + ((index % 2) * 240), 455 - (Math.floor(index / 2) * 34), shape));
    drawWorkBox(`Make a ${theme.toLowerCase()} picture with shapes.`, 80, 250);
  } else if (type === "Name Writing") {
    text("My Name", 50, 590, 14, "F2");
    writeLine("My name is:", 562);
    text("Trace My Name", 50, 520, 14, "F2");
    line(58, 485, 544, 485, 1, "0.55 0.55 0.55");
    line(58, 445, 544, 445, 1, "0.55 0.55 0.55");
    line(58, 405, 544, 405, 1, "0.55 0.55 0.55");
    text("Name Hunt", 50, 365, 14, "F2");
    checkbox(58, 335, "I found the first letter in my name.");
    checkbox(58, 305, `I found a ${theme.toLowerCase()} word.`);
    checkbox(58, 275, "I tried writing my name.");
    drawWorkBox(drawingPrompt, 80, 155);
  } else if (type === "Cutting Practice") {
    text("Provider Safety Check", 50, 590, 14, "F2");
    checkbox(58, 562, "Child-safe scissors");
    checkbox(258, 562, "Close adult supervision");
    text("Cutting Lines", 50, 524, 14, "F2");
    [["Straight", 492], ["Short snips", 452], ["Zigzag", 412], ["Curve", 372]].forEach(([label, y]) => {
      text(label, 58, y + 4, 10, "F2");
      dashedLine(160, y, 544, y);
    });
    text("/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\", 178, 407, 16, "F1", "0.58 0.58 0.58");
    text("Cut And Sort", 50, 335, 14, "F2");
    words.slice(0, 4).forEach((word, index) => {
      rect(60 + (index * 120), 270, 92, 44, "0.35 0.35 0.35");
      text(word, 75 + (index * 120), 287, 13, "F2");
    });
    drawWorkBox("Paste or place cut pieces here.", 80, 145);
  } else if (type === "Matching Activities") {
    text("Draw Lines To Match", 50, 590, 14, "F2");
    const matchWords = words.slice(0, 4);
    const answerWords = [...matchWords].reverse();
    matchWords.forEach((word, index) => {
      const y = 542 - (index * 72);
      rect(58, y - 16, 150, 44, "0.35 0.35 0.35");
      text(word, 76, y, 14, "F2");
      rect(390, y - 16, 150, 44, "0.35 0.35 0.35");
      text(answerWords[index], 410, y, 12, "F2");
      drawMiniThemeMark(335, y - 14, "");
    });
    text("Make Your Own Match", 50, 250, 14, "F2");
    writeLine("Word:", 220);
    writeLine("Picture:", 180);
    drawWorkBox("Draw the matching picture.", 80, 75);
  } else if (type === "Seasonal Worksheets") {
    text(`${theme} Picture`, 50, 590, 14, "F2");
    drawThemeColoringScene(50, 170, 494, 390);
    text("Color the picture. Add one detail of your own.", 58, 142, 12, "F2");
    text("My favorite part:", 58, 108, 11, "F2");
    line(178, 108, 544, 108, 1, "0.55 0.55 0.55");
    text("I can tell about my picture.", 58, 78, 10);
    checkbox(430, 78, "done");
  } else if (type === "Holiday Worksheets") {
    text(`${theme} Picture`, 50, 590, 14, "F2");
    drawThemeColoringScene(50, 170, 494, 390);
    text("Color the picture. Talk about what you see.", 58, 142, 12, "F2");
    text("I see:", 58, 108, 11, "F2");
    line(106, 108, 544, 108, 1, "0.55 0.55 0.55");
    text("I can share or help.", 58, 78, 10);
    checkbox(430, 78, "done");
  } else {
    text("Try It", 50, 590, 14, "F2");
    words.forEach((word, index) => writeLine(`${word}:`, 555 - (index * 38)));
    drawWorkBox(drawingPrompt, 80, 285);
  }

  drawFooter();

  return createPdfBlob(content);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resourcePdfFileName(resource) {
  return resource.pdfFileName || `${slug(resource.title)}-${slug(resource.category || "resource")}.pdf`;
}

function buildResourcePdfBlob(resource) {
  if (resource.category === "Printables" && resource.pdfReady) return buildPrintablePdfBlob(resource);
  return buildTextResourcePdfBlob(resource);
}

function downloadResourcePdf(id) {
  const resource = resources.find((item) => item.id === id);
  if (!hasResourcePdf(resource) || !canAccess(resource)) return;
  downloadBlob(buildResourcePdfBlob(resource), resourcePdfFileName(resource));
  if (!savedDownloads.includes(resource.id)) {
    savedDownloads = [...savedDownloads, resource.id];
    saveDownloads();
    updatePlanLabel();
  }
  trackEvent("resource_pdf_download", {
    resourceId: resource.id,
    title: resource.title,
    category: resource.category,
    age: resource.age,
    access: resource.plan,
  });
}

function downloadActiveResourcePdf() {
  if (activeGeneratedPdfResource) {
    downloadBlob(buildResourcePdfBlob(activeGeneratedPdfResource), resourcePdfFileName(activeGeneratedPdfResource));
    trackEvent("resource_pdf_download", {
      resourceId: activeGeneratedPdfResource.id,
      title: activeGeneratedPdfResource.title,
      category: activeGeneratedPdfResource.category,
      age: activeGeneratedPdfResource.age,
      access: activeGeneratedPdfResource.plan,
    });
    return;
  }
  downloadResourcePdf(document.querySelector("#downloadPdfButton")?.dataset.pdfResource);
}

function openGeneratedPrintableResource(resource) {
  ensureResourceViewer();
  activeGeneratedPdfResource = resource;
  document.querySelector("#resourceViewerCategory").textContent = resource.category;
  document.querySelector("#resourceViewerTitle").textContent = resource.title;
  const pdfButton = document.querySelector("#downloadPdfButton");
  if (pdfButton) {
    pdfButton.hidden = !hasResourcePdf(resource);
    pdfButton.dataset.pdfResource = "";
  }
  document.querySelector("#resourceViewerTags").innerHTML = [
    resource.age,
    resource.plan,
    resource.format || "Print-ready PDF",
    ...resource.tags.slice(0, 4),
  ].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const body = document.querySelector("#resourceViewerBody");
  if (body) body.innerHTML = resourcePrintableHtml(resource);
  const viewer = document.querySelector("#resourceViewerModal");
  viewer.classList.add("open");
  viewer.setAttribute("aria-hidden", "false");
  trackEvent("generated_goal_printable_view", {
    resourceId: resource.id,
    title: resource.title,
    category: resource.category,
    age: resource.age,
    plan: currentPlan,
  });
}

function openResourceViewer(resourceId) {
  const resource = resources.find((item) => item.id === resourceId);
  if (!resource) return;
  if (!isResourceVisibleToCurrentUser(resource)) {
    setView("printables");
    return;
  }
  if (!canAccess(resource)) {
    showProFeatureModal(freeResourceLimitMessage, "limit");
    return;
  }
  ensureResourceViewer();
  activeGeneratedPdfResource = null;
  document.querySelector("#resourceViewerCategory").textContent = resource.category;
  document.querySelector("#resourceViewerTitle").textContent = resource.title;
  const pdfButton = document.querySelector("#downloadPdfButton");
  if (pdfButton) {
    pdfButton.hidden = !hasResourcePdf(resource);
    pdfButton.dataset.pdfResource = hasResourcePdf(resource) ? resource.id : "";
  }
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
  trackEvent("resource_view", { resourceId, title: resource.title, category: resource.category, age: resource.age, access: resource.plan, plan: currentPlan });
}

function renderCategoryPage(view) {
  const category = viewMap[view];
  const section = document.querySelector(`#view-${view}`);

  if (category === "Printables" && isPrintablesUpgradeModeActive()) {
    section.innerHTML = renderPrintablesComingSoon();
    return;
  }

  const searchedChild = category === "Lesson Plans" ? childFromSearchQuery(searchInput.value.trim(), childRecords()) : null;
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
    ${searchedChild ? renderChildLessonSearchContext(searchedChild) : ""}
    ${category === "Printables" ? renderPrintablesRefreshNotice() : ""}
    <div class="filter-row">
      ${filters.map((filter) => `<button class="${activeFilter === filter ? "active-filter" : ""}" data-filter="${filter}">${filter}</button>`).join("")}
    </div>
    ${category === "Observation Hub" ? renderObservationEditor() : ""}
    <div class="resource-grid">
      ${items.length ? items.map(resourceCard).join("") : `<div class="empty-state">No resources found. Try another search or filter.</div>`}
    </div>
  `;
}

function renderChildLessonSearchContext(child) {
  const context = childRecommendationContext(child);
  const primaryArea = context.areas[0] || "Approaches to Learning";
  const primarySupport = context.supportAreas[0] || "None selected";
  return `
    <section class="child-lesson-context">
      <div>
        <strong>Suggested for ${escapeHtml(child.name)}</strong>
        <span>Age Group: ${escapeHtml(normalizeAgeGroup(child.ageGroup) || child.ageGroup || "Not entered")}</span>
        <span>Goal Match: ${escapeHtml(displayDevelopmentArea(primaryArea))}</span>
        <span>Support Area: ${escapeHtml(primarySupport)}</span>
      </div>
      <p><b>Why suggested:</b> Supports ${escapeHtml(child.name)}'s current goals, support needs, observations, and progress history.</p>
    </section>
  `;
}

function renderPrintablesRefreshNotice() {
  return `
    <div class="access-notice printable-refresh-notice">
      <strong>Professional print-ready resources.</strong>
      Worksheets use structured classroom layouts, PDF-ready pages, dotted tracing or cutting practice when appropriate, and quality checks for placeholder or unfinished content before printing.
    </div>
  `;
}

function renderPrintablesComingSoon() {
  return `
    <div class="page-title">
      <p class="eyebrow">Printables</p>
      <h2>Printables are being upgraded</h2>
      <p>We're currently refreshing our printable library with higher-quality, teacher-friendly resources. New worksheets, activity pages, and classroom printables will be added soon.</p>
    </div>
    <div class="access-notice">
      <strong>Check back soon.</strong>
      Our updated printable library will include ready-to-print worksheets, tracing pages, coloring sheets, and more — all designed for home daycare and preschool providers.
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
  if (!document.querySelector("#homeFoundingOffer")) {
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
  const categoryGrid = document.querySelector("#categoryGrid");
  if (categoryGrid) {
    categoryGrid.innerHTML = categories.filter((category) => isCategoryVisibleToCurrentUser(category.title)).map((category) => `
      <button class="category-button" data-view="${category.view}">
        <span class="icon">${category.icon}</span>
        <strong>${category.title}</strong>
        <span>${category.detail}</span>
      </button>
    `).join("");
  }

  const newItems = resources.filter((resource) => resource.month === "June" && isResourceVisibleToCurrentUser(resource)).slice(0, 4);
  const newThisMonth = document.querySelector("#newThisMonth");
  if (newThisMonth) newThisMonth.innerHTML = newItems.map(compactItem).join("");
  renderHomeFoundingOffer();
  renderPreviewLibrary();
  renderFavorites();
  updatePlanLabel();
}

function weekStartDate(date = new Date()) {
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - day + 1);
  return monday;
}

function isoDateFromLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function plannerWeekIndex(weekOf) {
  const [year, month, day] = String(weekOf || "").split("-").map(Number);
  if (!year || !month || !day) return 0;
  const baseWeek = Date.UTC(2026, 0, 5);
  const selectedWeek = Date.UTC(year, month - 1, day);
  return Math.floor((selectedWeek - baseWeek) / (7 * 24 * 60 * 60 * 1000));
}

function plannerThemeForWeek(weekOf) {
  const index = plannerWeekIndex(weekOf);
  return lessonThemes[((index % lessonThemes.length) + lessonThemes.length) % lessonThemes.length];
}

function plannerFocusForTheme(theme) {
  const lowerTheme = String(theme || "").toLowerCase();
  if (lowerTheme.includes("feel") || lowerTheme.includes("friend")) return "Social emotional skills, language, and cooperative play";
  if (lowerTheme.includes("letters")) return "Early literacy, letter sounds, and fine motor practice";
  if (lowerTheme.includes("numbers") || lowerTheme.includes("shapes") || lowerTheme.includes("colors")) return "Early math, vocabulary, and hands-on exploration";
  if (lowerTheme.includes("healthy")) return "Self help skills, routines, and body awareness";
  if (lowerTheme.includes("music")) return "Language, movement, and listening skills";
  return "Language, fine motor, and social emotional skills";
}

function defaultPlanner(date = new Date()) {
  const monday = weekStartDate(date);
  const weekOf = isoDateFromLocalDate(monday);
  const theme = plannerThemeForWeek(weekOf);
  return {
    weekOf,
    ageGroup: "Toddler",
    theme,
    focus: plannerFocusForTheme(theme),
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

function currentWeekPlanner(existing = weeklyPlanner()) {
  const planner = defaultPlanner();
  return {
    ...planner,
    ageGroup: existing?.ageGroup || planner.ageGroup,
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
  updateSidebarDashboard();
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
  const thisWeek = defaultPlanner();
  const isCurrentWeek = planner.weekOf === thisWeek.weekOf;
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
          ${isCurrentWeek ? `<p class="muted-copy">This week's suggested theme is ${escapeHtml(thisWeek.theme)}.</p>` : `<p class="muted-copy">New week available: ${escapeHtml(thisWeek.theme)} beginning ${escapeHtml(thisWeek.weekOf)}.</p>`}
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
          <label>Theme<input name="theme" value="${planner.theme || ""}" placeholder="${escapeHtml(thisWeek.theme)}" /></label>
          <label>Learning Focus<input name="focus" value="${planner.focus || ""}" placeholder="language, fine motor, social emotional" /></label>
          <label>Library Resource<select name="resourceId">${plannerResourceOptions(planner)}</select></label>
          <label>Provider Notes<textarea name="notes" rows="3" placeholder="Reminders, materials, family notes, prep list">${planner.notes || ""}</textarea></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">Save Week</button>
            <button class="ghost-button" type="button" id="useCurrentWeekButton">${isCurrentWeek ? "Use Suggested Theme" : "Start This Week"}</button>
            <button class="ghost-button" type="button" id="copyPlannerButton">Copy Plan</button>
            <button class="ghost-button" type="button" id="downloadPlannerButton">Print / Save PDF</button>
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
                <span>${resource.category} · ${resource.age} · ${resource.plan}</span>
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
        <span>${remaining} remaining · Resets ${escapeHtml(aiResetLabel())}</span>
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
  const locked = accessRank[effectiveAccessPlan()] < accessRank.Pro;
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
            <button class="ghost-button" id="downloadOutputButton" type="button">Print / Save PDF</button>
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
            <button class="ghost-button" id="downloadFutureOutputButton" type="button">Print / Save PDF</button>
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

function childStoreKey(key) {
  return currentUser ? `llhChild:${currentUser}:${key}` : `llhChild${key}`;
}

function childCloudUpdatedKey() {
  return currentUser ? `llhChild:${currentUser}:cloudUpdatedAt` : "llhChildCloudUpdatedAt";
}

function childStore(key, fallback = []) {
  const scopedKey = childStoreKey(key);
  const scopedValue = localStorage.getItem(scopedKey);
  if (scopedValue !== null) return readSavedJson(scopedKey, fallback);
  if (currentUser) {
    const legacyValue = localStorage.getItem(`llhChild${key}`);
    if (legacyValue !== null) return readSavedJson(`llhChild${key}`, fallback);
  }
  return fallback;
}

function saveChildStoreLocalOnly(key, value) {
  localStorage.setItem(childStoreKey(key), JSON.stringify(value));
  localStorage.setItem(childCloudUpdatedKey(), new Date().toISOString());
}

function childDataSnapshot() {
  return childDataKeys.reduce((snapshot, key) => {
    snapshot[key] = childStore(key);
    return snapshot;
  }, {});
}

function childDataHasRecords(snapshot = childDataSnapshot()) {
  return childDataKeys.some((key) => Array.isArray(snapshot[key]) && snapshot[key].length);
}

function applyChildDataSnapshot(snapshot = {}, updatedAt = "") {
  childDataKeys.forEach((key) => {
    saveChildStoreLocalOnly(key, Array.isArray(snapshot[key]) ? snapshot[key] : []);
  });
  if (updatedAt) localStorage.setItem(childCloudUpdatedKey(), updatedAt);
  const records = childRecords();
  if (!selectedChildId || !records.children.some((child) => child.id === selectedChildId)) {
    selectedChildId = records.children[0]?.id || "";
    localStorage.setItem("llhSelectedChild", selectedChildId);
  }
}

async function firebaseAuthHeaders() {
  if (!firebaseAuthEnabled || !currentUser) return null;
  const client = await getFirebaseAuthClient();
  const token = await client.auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : null;
}

async function saveChildDataToBackend() {
  if (!currentUser || childCloudSyncing) return;
  const headers = await firebaseAuthHeaders();
  if (!headers) return;
  await fetch("/api/child-data", {
    method: "POST",
    headers,
    body: JSON.stringify({ data: childDataSnapshot() }),
  });
}

function queueChildDataCloudSave() {
  if (!currentUser || !firebaseAuthEnabled) return;
  clearTimeout(childCloudSaveTimer);
  childCloudSaveTimer = setTimeout(() => {
    saveChildDataToBackend().catch((error) => console.warn("Child data cloud save did not complete", error));
  }, 700);
}

async function syncChildDataFromBackend(options = {}) {
  if (!currentUser || !firebaseAuthEnabled || childCloudSyncing) return;
  const headers = await firebaseAuthHeaders();
  if (!headers) return;
  childCloudSyncing = true;
  try {
    const response = await fetch("/api/child-data", { headers });
    if (!response.ok) return;
    const remote = await response.json();
    const localUpdatedAt = localStorage.getItem(childCloudUpdatedKey()) || "";
    if (remote?.data && (!localUpdatedAt || String(remote.updatedAt || "") > localUpdatedAt || !childDataHasRecords())) {
      applyChildDataSnapshot(remote.data, remote.updatedAt);
    } else if (!remote?.data && childDataHasRecords()) {
      await saveChildDataToBackend();
    }
    if (options.render && document.querySelector("#view-children")?.classList.contains("active-view")) {
      renderChildManagement();
    }
  } catch (error) {
    console.warn("Child data cloud sync did not complete", error);
  } finally {
    childCloudSyncing = false;
  }
}

function saveChildStore(key, value) {
  saveChildStoreLocalOnly(key, value);
  updateSidebarDashboard();
  queueChildDataCloudSave();
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

function calculateAgeFromDob(dob) {
  if (!dob) return "";
  const birthDate = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const monthCount = Math.max(months, 0);
  const yearPart = years > 0 ? `${years} ${years === 1 ? "year" : "years"}` : "";
  const monthPart = monthCount > 0 ? `${monthCount} ${monthCount === 1 ? "month" : "months"}` : "";
  return [yearPart, monthPart].filter(Boolean).join(" ") || "0 months";
}

function ageGroupFromDob(dob) {
  if (!dob) return "";
  const birthDate = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let months = (today.getFullYear() - birthDate.getFullYear()) * 12 + (today.getMonth() - birthDate.getMonth());
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 12) return "Infant";
  if (months < 36) return "Toddler";
  if (months < 60) return "Preschool";
  return "School Age";
}

function childAgeMonths(child = {}) {
  if (child.dob) {
    const birthDate = new Date(`${child.dob}T12:00:00`);
    if (!Number.isNaN(birthDate.getTime())) {
      const today = new Date();
      let months = (today.getFullYear() - birthDate.getFullYear()) * 12 + (today.getMonth() - birthDate.getMonth());
      if (today.getDate() < birthDate.getDate()) months -= 1;
      return Math.max(months, 0);
    }
  }
  const ageText = cleanAgeText(child.age || child.ageLabel || "");
  const monthMatch = ageText.match(/(\d+)\s*months?/i);
  if (monthMatch) return Number(monthMatch[1]);
  const yearMatch = ageText.match(/(\d+)\s*years?/i);
  if (yearMatch) return Number(yearMatch[1]) * 12;
  return null;
}

function isInfantChild(child = {}) {
  return normalizeAgeGroup(child.ageGroup) === "Infant" || (childAgeMonths(child) !== null && childAgeMonths(child) < 12);
}

function cleanAgeText(value) {
  return String(value || "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\byrs?\b/gi, "years")
    .replace(/\bmos?\b/gi, "months")
    .replace(/\s+/g, " ")
    .trim();
}

function childAgeLabel(child) {
  return calculateAgeFromDob(child.dob) || cleanAgeText(child.age) || "Age not entered";
}

function childAgeGroupLabel(child = {}) {
  return normalizeAgeGroup(child.ageGroup) || cleanAgeText(child.ageGroup);
}

function childRoomAgeLabel(child = {}) {
  const parts = [childAgeGroupLabel(child), cleanAgeText(child.classroom)].filter(Boolean);
  return parts.length ? parts.join(" | ") : "Age group not entered";
}

function developmentalGoalOptions() {
  return [
    ["Fine Motor", "Fine Motor"],
    ["Gross Motor", "Gross Motor"],
    ["Speech & Language", "Speech & Language"],
    ["Cognitive", "Cognitive"],
    ["Social Emotional", "Social Emotional"],
    ["Self Help Skills", "Self Help Skills"],
    ["Literacy", "Literacy"],
    ["Early Math", "Early Math"],
  ];
}

function supportAreaOptions() {
  return [
    "Tantrums",
    "Biting",
    "Hitting",
    "Pushing",
    "Following Directions",
    "Sharing",
    "Emotional Regulation",
    "Potty Training",
    "Separation Anxiety",
    "Transition Difficulties",
    "Rest Time Challenges",
    "Social Skills",
    "Listening Skills",
  ];
}

function displayDevelopmentArea(area = "") {
  const text = String(area || "").toLowerCase();
  if (text === "language & literacy") return "Speech & Language";
  if (text.includes("speech") || text.includes("language")) return "Speech & Language";
  if (text.includes("literacy")) return "Literacy";
  if (text.includes("early math")) return "Early Math";
  if (text.includes("self")) return "Self Help Skills";
  if (text === "cognitive") return "Cognitive";
  const normalized = normalizeObservationArea(area) || area;
  const labels = {
    "Language & Literacy": "Speech & Language",
    "Cognitive Development": "Cognitive",
    "Physical Development": "Self Help Skills",
  };
  return labels[normalized] || normalized || "Developmental Goal";
}

function supportAreaToDevelopmentArea(area = "") {
  const text = String(area || "").toLowerCase();
  if (/(tantrum|emotional|separation|transition|sharing|social|biting|hitting|pushing)/.test(text)) return "Social Emotional";
  if (/(following|listening|direction)/.test(text)) return "Language & Literacy";
  if (/(potty|rest|self)/.test(text)) return "Physical Development";
  return "Approaches to Learning";
}

function childSelectedGoalAreas(child = {}) {
  const saved = Array.isArray(child.goalAreas) ? child.goalAreas : [];
  const typed = inferAreasFromGoalText(child.activeGoals || "");
  return Array.from(new Set([...saved.map((area) => normalizeObservationArea(area) || area), ...typed].filter(Boolean)));
}

function childSelectedSupportAreas(child = {}) {
  const saved = Array.isArray(child.supportAreas) ? child.supportAreas : [];
  return Array.from(new Set(saved.map((area) => String(area || "").trim()).filter(Boolean)));
}

function childGoalDisplayLabels(child = {}) {
  const raw = Array.isArray(child.goalAreas) ? child.goalAreas : [];
  if (raw.length) return Array.from(new Set(raw.map(displayDevelopmentArea)));
  return childSelectedGoalAreas(child).map(displayDevelopmentArea);
}

function childRecommendationContext(child = {}, records = childRecords()) {
  const portfolio = childPortfolioRecords(child.id, records);
  const supportAreas = childSelectedSupportAreas(child);
  const supportMappedAreas = supportAreas.map(supportAreaToDevelopmentArea);
  const goalAreas = childSelectedGoalAreas(child);
  const recordAreas = childRecommendationAreas(child, portfolio.goals, portfolio.observations);
  const areas = Array.from(new Set([...goalAreas, ...supportMappedAreas, ...recordAreas].filter(Boolean))).slice(0, 5);
  return {
    child,
    portfolio,
    goalAreas,
    supportAreas,
    areas: areas.length ? areas : ["Approaches to Learning"],
  };
}

function supportNextStep(area = "", childName = "The child") {
  const steps = {
    Tantrums: "Practice naming feelings and offer a calm-down choice before hard transitions.",
    Biting: "Watch for triggers, offer a teether or words to ask for space, and stay close during peer play.",
    Hitting: "Model gentle hands, give a short replacement phrase, and praise calm peer interactions.",
    Pushing: "Practice waiting for a turn and use a visual cue for personal space.",
    "Following Directions": "Give one-step directions with a picture cue, then celebrate follow-through right away.",
    Sharing: "Use a timer or turn-taking basket during a short partner activity.",
    "Emotional Regulation": "Use feelings faces, breathing practice, and a calm-down basket during group time.",
    "Potty Training": "Use a predictable bathroom routine, visual steps, and simple encouragement.",
    "Separation Anxiety": "Offer a goodbye routine, comfort object, and a first-then plan for arrival.",
    "Transition Difficulties": "Give a two-minute warning, visual schedule, and a helper job for the next activity.",
    "Rest Time Challenges": "Create a quiet rest routine with books, soft music, and a calm body choice.",
    "Social Skills": "Practice greeting, asking to play, and taking turns in a small group.",
    "Listening Skills": "Use short directions, movement songs, and call-and-response games.",
  };
  return steps[area] || `${childName} may benefit from short, predictable practice with gentle adult coaching.`;
}

function childSuggestionIdeas(child = {}, records = childRecords()) {
  const context = childRecommendationContext(child, records);
  const primaryArea = context.areas[0] || "Approaches to Learning";
  const primarySupport = context.supportAreas[0] || "";
  const activities = primarySupport
    ? [
      supportNextStep(primarySupport, child.name),
      ...suggestedActivitiesForArea(supportAreaToDevelopmentArea(primarySupport), child).slice(0, 2),
    ]
    : suggestedActivitiesForArea(primaryArea, child).slice(0, 3);
  return {
    context,
    primaryArea,
    primarySupport,
    activities,
    lesson: childLessonRecommendations(child, records, 1)[0]?.title || suggestedLessonPlansForArea(primaryArea)[0],
    observation: `${child.name || "The child"} practiced ${displayDevelopmentArea(primaryArea).toLowerCase()} during play. Notice what support was needed, what the child tried independently, and what helped them stay engaged.`,
    parentNote: `${child.name || "Your child"} is working on ${primarySupport || displayDevelopmentArea(primaryArea).toLowerCase()}. We are using short, supportive activities and will keep sharing what helps.`,
    nextStep: primarySupport ? supportNextStep(primarySupport, child.name) : nextStepForArea(primaryArea, child),
  };
}

function formatDateLabel(dateText) {
  if (!dateText) return "Not entered";
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return cleanAgeText(dateText) || "Not entered";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function presentPortfolioValue(value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value || "");
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (/^(not entered|none selected|none listed|no notes added yet\.?|no active goals entered yet\.?|age not entered)$/i.test(cleaned)) return "";
  return cleaned;
}

function portfolioDateValue(dateText) {
  if (!String(dateText || "").trim()) return "";
  return presentPortfolioValue(formatDateLabel(dateText));
}

function portfolioAgeValue(child = {}) {
  if (!child.dob && !cleanAgeText(child.age)) return "";
  return presentPortfolioValue(childAgeLabel(child));
}

function portfolioAgeGroupValue(child = {}) {
  return presentPortfolioValue(normalizeAgeGroup(child.ageGroup) || child.ageGroup);
}

function portfolioDetailRow(label, value, wide = false) {
  const displayValue = presentPortfolioValue(value);
  if (!displayValue) return "";
  return `<p class="${wide ? "wide" : ""}"><b>${escapeHtml(label)}:</b> ${escapeHtml(displayValue)}</p>`;
}

function childPortfolioProfileRows(child = {}, activeGoals = []) {
  const activeGoalText = presentPortfolioValue(child.activeGoals) || presentPortfolioValue(activeGoals.map((goal) => goal.goal));
  return [
    portfolioDetailRow("Birthday", portfolioDateValue(child.dob)),
    portfolioDetailRow("Current age", portfolioAgeValue(child)),
    portfolioDetailRow("Age group", portfolioAgeGroupValue(child)),
    portfolioDetailRow("Enrollment date", portfolioDateValue(child.enrollmentDate)),
    portfolioDetailRow("Classroom/room", child.classroom),
    portfolioDetailRow("Parent/guardian", child.parentInfo),
    portfolioDetailRow("Emergency contacts", child.emergency),
    portfolioDetailRow("Allergies", child.allergies),
    portfolioDetailRow("Medical notes", child.medical),
    portfolioDetailRow("Developmental goals", childGoalDisplayLabels(child)),
    portfolioDetailRow("Support areas", childSelectedSupportAreas(child)),
    portfolioDetailRow("Notes", child.notes, true),
    portfolioDetailRow("Active goals", activeGoalText, true),
  ].filter(Boolean);
}

function renderChildPortfolioProfileSection(child = {}, activeGoals = []) {
  const rows = childPortfolioProfileRows(child, activeGoals);
  if (!rows.length) return "";
  return `
      <section class="section-block portfolio-overview">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Child Overview</p>
            <h3>Profile details</h3>
          </div>
        </div>
        <div class="portfolio-detail-grid">
          ${rows.join("")}
        </div>
      </section>
  `;
}

function childPortfolioHeroRows(child = {}) {
  return [
    portfolioDetailRow("Birthday", portfolioDateValue(child.dob)),
    portfolioDetailRow("Current age", portfolioAgeValue(child)),
    portfolioDetailRow("Age group", portfolioAgeGroupValue(child)),
    portfolioDetailRow("Enrollment date", portfolioDateValue(child.enrollmentDate)),
    portfolioDetailRow("Classroom/room", child.classroom),
  ].filter(Boolean).join("");
}

function portfolioTextLine(label, value) {
  const displayValue = presentPortfolioValue(value);
  return displayValue ? `${label}: ${displayValue}` : "";
}

function portfolioBullet(parts = [], separator = " | ") {
  const filledParts = parts.map(presentPortfolioValue).filter(Boolean);
  return filledParts.length ? `- ${filledParts.join(separator)}` : "";
}

function childPortfolioTextDetails(child = {}, activeGoals = []) {
  const activeGoalText = presentPortfolioValue(child.activeGoals) || presentPortfolioValue(activeGoals.map((goal) => goal.goal));
  return [
    portfolioTextLine("Age Group", portfolioAgeGroupValue(child)),
    portfolioTextLine("Age", portfolioAgeValue(child)),
    portfolioTextLine("Date of Birth", portfolioDateValue(child.dob)),
    portfolioTextLine("Enrollment Date", portfolioDateValue(child.enrollmentDate)),
    portfolioTextLine("Classroom/Group", child.classroom),
    portfolioTextLine("Parent/Guardian", child.parentInfo),
    portfolioTextLine("Emergency Contacts", child.emergency),
    portfolioTextLine("Allergies", child.allergies),
    portfolioTextLine("Medical Notes", child.medical),
    portfolioTextLine("Developmental Goals", childGoalDisplayLabels(child)),
    portfolioTextLine("Support Areas", childSelectedSupportAreas(child)),
    portfolioTextLine("Active Goals", activeGoalText),
    portfolioTextLine("Additional Notes", child.notes),
  ].filter(Boolean);
}

function categoryKeywords() {
  return {
    "Social Emotional": ["friend", "share", "turn", "feeling", "emotion", "calm", "comfort", "self-regulation", "cooperate", "help", "peer", "independent", "tantrum", "bite", "biting", "hit", "hitting", "push", "pushing", "aggressive", "separation", "transition"],
    "Language & Literacy": ["word", "talk", "said", "sentence", "book", "story", "letter", "sound", "name", "sing", "rhyme", "vocabulary", "listen"],
    "Cognitive Development": ["count", "number", "sort", "match", "pattern", "problem", "solve", "shape", "color", "compare", "classify", "remember"],
    "Fine Motor": ["scissor", "cut", "trace", "draw", "write", "grasp", "pinch", "bead", "stack", "puzzle", "tool", "crayon", "tweezer"],
    "Gross Motor": ["run", "jump", "hop", "climb", "balance", "throw", "catch", "crawl", "dance", "march", "kick"],
    "Physical Development": ["body", "health", "wash", "toilet", "potty", "feed", "dress", "sleep", "safety", "nutrition", "self-help"],
    "Creative Arts": ["paint", "color", "music", "song", "dance", "pretend", "dramatic", "art", "create", "instrument", "collage"],
    "Approaches to Learning": ["try", "persist", "focus", "curious", "explore", "choice", "attention", "plan", "ask", "experiment", "engage"],
  };
}

function normalizeObservationArea(area) {
  const text = String(area || "").toLowerCase();
  if (text.includes("language") || text.includes("literacy") || text.includes("speech") || text.includes("listening")) return "Language & Literacy";
  if (text.includes("cognitive") || text.includes("math") || text.includes("science")) return "Cognitive Development";
  if (text.includes("social")) return "Social Emotional";
  if (text.includes("fine")) return "Fine Motor";
  if (text.includes("gross")) return "Gross Motor";
  if (text.includes("physical") || text.includes("self")) return "Physical Development";
  if (text.includes("creative") || text.includes("art")) return "Creative Arts";
  if (text.includes("approach")) return "Approaches to Learning";
  return "";
}

function categorizeObservation(text = "", selectedArea = "") {
  const lower = `${text} ${selectedArea}`.toLowerCase();
  const selected = normalizeObservationArea(selectedArea);
  const matches = observationCategories.filter((category) => {
    if (category === selected) return true;
    return (categoryKeywords()[category] || []).some((keyword) => lower.includes(keyword));
  });
  return matches.length ? Array.from(new Set(matches)) : [selected || "Approaches to Learning"];
}

function supportAreaKeywords(area = "") {
  const map = {
    Tantrums: ["tantrum", "meltdown", "big feelings"],
    Biting: ["bite", "biting", "bit"],
    Hitting: ["hit", "hitting", "hands are not for hitting"],
    Pushing: ["push", "pushing", "personal space"],
    "Following Directions": ["following directions", "directions", "one step", "one-step"],
    Sharing: ["share", "sharing", "turn taking", "turn-taking"],
    "Emotional Regulation": ["emotion", "emotional regulation", "feeling", "feelings", "calm body", "calm-down"],
    "Potty Training": ["potty", "toilet", "bathroom"],
    "Separation Anxiety": ["separation", "goodbye", "drop off", "drop-off"],
    "Transition Difficulties": ["transition", "cleanup", "clean up", "first then", "first-then"],
    "Rest Time Challenges": ["rest time", "nap", "quiet body"],
    "Social Skills": ["social skills", "friend", "peer play", "asking to play"],
    "Listening Skills": ["listening", "listen", "heard the direction"],
  };
  return map[area] || [String(area || "").toLowerCase()];
}

function supportKeywordMatches(text = "", keyword = "") {
  const escaped = String(keyword || "").toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  if (escaped.includes("\\ ")) return text.includes(escaped.replace(/\\/g, ""));
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function observationSupportAreaMatches(record = {}, child = {}) {
  const haystack = [
    record.text,
    record.area,
    record.nextSteps,
    ...(record.categories || []),
  ].join(" ").toLowerCase();
  const childSupports = childSelectedSupportAreas(child);
  const options = Array.from(new Set([...childSupports, ...supportAreaOptions()]));
  const matchesArea = (area) => {
    const areaText = String(area || "").toLowerCase();
    if (!areaText) return false;
    if (haystack.includes(areaText)) return true;
    return supportAreaKeywords(area).some((keyword) => supportKeywordMatches(haystack, keyword));
  };
  const childMatches = childSupports.filter(matchesArea);
  if (childMatches.length) return childMatches.slice(0, 4);
  return options.filter(matchesArea).slice(0, 4);
}

function elgConnection(area) {
  const map = {
    "Social Emotional": ["Social & Emotional Development", "Relationships, feelings, self-regulation, and cooperative play"],
    "Language & Literacy": ["Communication, Language & Literacy", "Listening, speaking, vocabulary, books, early writing, and print awareness"],
    "Cognitive Development": ["Cognitive Development", "Problem solving, memory, math thinking, science inquiry, and early reasoning"],
    "Fine Motor": ["Physical Development", "Hand strength, grasp, coordination, tool use, and early writing control"],
    "Gross Motor": ["Physical Development", "Balance, coordination, movement, strength, and spatial awareness"],
    "Physical Development": ["Physical Development & Health", "Healthy routines, safety, self-help skills, and body awareness"],
    "Creative Arts": ["Creative Arts", "Music, movement, pretend play, visual art, and creative expression"],
    "Approaches to Learning": ["Approaches to Learning", "Curiosity, persistence, attention, flexibility, and problem solving"],
  };
  const [domain, skill] = map[area] || map["Approaches to Learning"];
  return { domain, skill };
}

function strengthForArea(area, childName = "The child") {
  const map = {
    "Social Emotional": `${childName} is building confidence, connection, and self-regulation through daily interactions.`,
    "Language & Literacy": `${childName} is strengthening communication, vocabulary, listening, and early literacy skills.`,
    "Cognitive Development": `${childName} is showing growing thinking skills, problem solving, matching, sorting, or number understanding.`,
    "Fine Motor": `${childName} is developing hand strength, coordination, grasp, and control with materials.`,
    "Gross Motor": `${childName} is practicing balance, coordination, strength, and whole-body movement.`,
    "Physical Development": `${childName} is building independence, healthy routines, safety awareness, and body control.`,
    "Creative Arts": `${childName} is exploring ideas through art, music, movement, pretend play, and creative choices.`,
    "Approaches to Learning": `${childName} is showing curiosity, persistence, focus, and willingness to try new things.`,
  };
  return map[area] || map["Approaches to Learning"];
}

function infantActivitiesForArea(area, child = {}) {
  const months = childAgeMonths(child);
  const veryYoung = months !== null && months < 6;
  const map = {
    "Social Emotional": veryYoung
      ? ["Face-to-face smiles", "Comfort routine practice", "Gentle mirror play", "Responsive peekaboo"]
      : ["Peekaboo turn-taking", "Mirror feelings faces", "Name the feeling", "Comfort object routine"],
    "Language & Literacy": veryYoung
      ? ["Serve-and-return cooing", "Soft song gestures", "Board book looking", "Name familiar people"]
      : ["Picture book naming", "Babble back-and-forth", "Peekaboo words", "Song with simple gestures"],
    "Cognitive Development": veryYoung
      ? ["Track a soft toy", "Cause-and-effect rattle", "Peekaboo cloth play", "Explore safe textures"]
      : ["Object permanence peekaboo", "Container fill-and-dump", "Cause-and-effect toy", "Large cup nesting"],
    "Fine Motor": veryYoung
      ? ["Tummy-time reaching", "Soft rattle grasping", "Hand-to-hand toy transfer", "Texture mat exploration"]
      : ["Soft block grasp and release", "Peekaboo scarf pull", "Large ring stack with help", "Container fill-and-dump"],
    "Gross Motor": veryYoung
      ? ["Tummy-time reaching", "Supported side-lying play", "Gentle kick-and-reach", "Head-turn tracking"]
      : ["Crawling tunnel peekaboo", "Supported cruising practice", "Reach-and-roll play", "Pull-to-stand support"],
    "Physical Development": veryYoung
      ? ["Responsive feeding cues", "Tummy-time routine", "Diaper-change song", "Gentle body awareness"]
      : ["Self-feeding finger foods", "Cup practice with help", "Wash hands with song", "Routine picture cue"],
    "Creative Arts": veryYoung
      ? ["High-contrast art looking", "Soft music sway", "Texture cloth exploration", "Gentle shaker sounds"]
      : ["Edible-safe sensory bag", "Music and movement", "Large paper texture touch", "Shaker sound play"],
    "Approaches to Learning": veryYoung
      ? ["Follow baby's gaze", "Repeat favorite sound", "Safe texture choice", "Reach-for-toy invitation"]
      : ["Two-toy choice play", "Hidden toy peekaboo", "Repeat-and-try game", "Safe exploration basket"],
  };
  return map[area] || map["Approaches to Learning"];
}

function nextStepForArea(area, child = null) {
  if (child && isInfantChild(child)) {
    const activity = infantActivitiesForArea(area, child)[0];
    return `Try ${activity.toLowerCase()} with close supervision and follow the baby's cues.`;
  }
  const map = {
    "Social Emotional": "Offer small-group turn-taking games, feeling words, and gentle coaching during peer play.",
    "Language & Literacy": "Add repeated books, picture cards, songs, and open-ended questions to extend language.",
    "Cognitive Development": "Introduce a slightly harder counting, sorting, matching, or problem-solving activity.",
    "Fine Motor": "Provide playdough, tongs, tracing, stickers, beading, or safe cutting practice.",
    "Gross Motor": "Plan movement games with balance, jumping, climbing, crawling, or obstacle-course practice.",
    "Physical Development": "Practice daily routines with visual steps, modeling, and simple independence goals.",
    "Creative Arts": "Offer open-ended art, music, movement, pretend play, and child-led creative choices.",
    "Approaches to Learning": "Repeat the activity with one new challenge and praise persistence, focus, and problem solving.",
  };
  return map[area] || map["Approaches to Learning"];
}

function suggestedActivitiesForArea(area, child = null) {
  if (child && isInfantChild(child)) return infantActivitiesForArea(area, child);
  const map = {
    "Social Emotional": ["Feelings faces", "Partner turn-taking game", "Friendship helper chart", "Calm-down basket"],
    "Language & Literacy": ["Picture card naming", "Story retell basket", "Rhyming songs", "Name and letter hunt"],
    "Cognitive Development": ["Number matching", "Counting bears", "Sorting games", "Pattern blocks"],
    "Fine Motor": ["Playdough", "Bead stringing", "Scissor practice", "Tracing sheets"],
    "Gross Motor": ["Obstacle course", "Animal walks", "Beanbag toss", "Balance line"],
    "Physical Development": ["Handwashing sequence", "Dressing practice", "Healthy food sort", "Safety picture cards"],
    "Creative Arts": ["Process art tray", "Music and movement", "Pretend play props", "Collage station"],
    "Approaches to Learning": ["Mystery box exploration", "Build-and-try challenge", "Choice board", "Problem-solving puzzle"],
  };
  return map[area] || map["Approaches to Learning"];
}

function suggestedLessonPlansForArea(area) {
  const map = {
    "Social Emotional": ["Friendship and Feelings Week", "Turn-Taking Practice Activities", "Calm Bodies and Kind Words"],
    "Language & Literacy": ["Storytelling and Vocabulary Week", "Letter and Sound Awareness", "Book Basket Conversation Plans"],
    "Cognitive Development": ["Math Skills Week 1", "Number Recognition Activities", "Sorting and Matching Week"],
    "Fine Motor": ["Fine Motor Development", "Cutting Practice Activities", "Hand Strength Activities"],
    "Gross Motor": ["Movement and Balance Week", "Outdoor Gross Motor Games", "Body Control Activities"],
    "Physical Development": ["Healthy Routines Week", "Self-Help Skills Practice", "Safety and Body Awareness"],
    "Creative Arts": ["Creative Expression Week", "Music and Movement Activities", "Process Art Exploration"],
    "Approaches to Learning": ["Curiosity and Problem Solving", "Persistence Practice Activities", "Explore, Try, Reflect Week"],
  };
  return map[area] || map["Approaches to Learning"];
}

function supportCenterCategories() {
  return [
    {
      id: "behavior-emotions",
      title: "Behavior & Emotions",
      detail: "Quick support for big feelings and safe bodies.",
      topics: ["Tantrums", "Biting", "Hitting", "Pushing", "Throwing", "Emotional Regulation", "Aggressive Behaviors"],
    },
    {
      id: "daily-routines",
      title: "Daily Routines",
      detail: "Simple help for care routines and transitions.",
      topics: ["Potty Training", "Rest Time", "Cleanup Time", "Following Directions", "Transitions"],
    },
    {
      id: "social-development",
      title: "Social Development",
      detail: "Support peer play, friendship, and group skills.",
      topics: ["Sharing", "Taking Turns", "Friendships", "Cooperative Play", "Peer Interactions"],
    },
    {
      id: "developmental-support",
      title: "Developmental Support",
      detail: "Find age-aware developmental activity ideas.",
      topics: ["Speech & Language", "Fine Motor", "Gross Motor", "Sensory Activities", "Social Emotional Development"],
    },
  ];
}

function supportTopicSlug(topic = "") {
  return slug(String(topic || "support-topic"));
}

function supportTopicIdForArea(area = "") {
  const text = String(area || "").toLowerCase();
  const directId = supportTopicSlug(area);
  if (supportTopicById(directId)) return directId;
  if (text.includes("rest")) return "rest-time";
  if (text.includes("transition") || text.includes("separation")) return "transitions";
  if (text.includes("listening")) return "following-directions";
  if (text.includes("social")) return "peer-interactions";
  if (text.includes("taking")) return "taking-turns";
  if (text.includes("friend")) return "friendships";
  return directId;
}

function childSupportMatchesTopic(child = {}, topic = "") {
  return childSelectedSupportAreas(child).some((area) => supportTopicIdForArea(area) === supportTopicSlug(topic));
}

function supportTopicById(topicId = "") {
  return supportCenterCategories()
    .flatMap((category) => category.topics.map((topic) => ({ ...category, topic, topicId: supportTopicSlug(topic) })))
    .find((item) => item.topicId === topicId) || null;
}

function supportCategoryById(categoryId = "") {
  return supportCenterCategories().find((category) => category.id === categoryId) || null;
}

function supportTopicDevelopmentArea(topic = "") {
  const text = String(topic || "").toLowerCase();
  if (text.includes("speech") || text.includes("language") || text.includes("direction")) return "Language & Literacy";
  if (text.includes("fine")) return "Fine Motor";
  if (text.includes("gross")) return "Gross Motor";
  if (text.includes("potty") || text.includes("rest") || text.includes("cleanup")) return "Physical Development";
  if (text.includes("sensory")) return "Approaches to Learning";
  if (text.includes("social") || text.includes("emotion") || text.includes("friend") || text.includes("sharing") || text.includes("turn") || text.includes("peer") || text.includes("throw") || text.includes("aggressive")) return "Social Emotional";
  return normalizeObservationArea(topic) || supportAreaToDevelopmentArea(topic);
}

function supportTopicContent(topic = "", child = null) {
  const area = supportTopicDevelopmentArea(topic);
  const base = {
    why: `${topic} often shows up when a child is still building communication, regulation, independence, or routine skills.`,
    tips: [
      "Keep language short and calm.",
      "Name the skill you want to see next.",
      "Practice during calm moments before expecting it during hard moments.",
    ],
    activities: suggestedActivitiesForArea(area, child).slice(0, 3),
    observations: [
      `Watch what happens before ${topic.toLowerCase()} starts.`,
      "Notice which adult support helps the child recover.",
      "Document what the child tried independently.",
    ],
    parentNotes: [
      `Share one strategy you are using for ${topic.toLowerCase()}.`,
      "Use strength-based wording and avoid blame.",
      "Ask if the family is seeing the same pattern at home.",
    ],
  };
  const overrides = {
    Tantrums: {
      why: "Tantrums often happen when a child has big feelings, limited language, hunger, tiredness, or a hard transition.",
      tips: ["Stay close and calm.", "Offer two simple choices.", "Use a first-then cue before transitions."],
      activities: ["Feelings face match", "Calm-down basket practice", "First-then transition game"],
      observations: ["What happened right before the tantrum?", "How long did it take to recover?", "Which support helped the child calm?"],
      parentNotes: ["We are helping name feelings and practice calm choices.", "Today we noticed transitions were hard, so we used a first-then cue.", "A short goodbye or transition routine may help us stay consistent."],
    },
    Biting: {
      why: "Biting is often communication, teething, sensory seeking, frustration, or needing space.",
      tips: ["Stay close during busy peer play.", "Offer words or a teether before biting happens.", "Comfort the hurt child and calmly redirect the child who bit."],
      activities: ["Teether or chewy choice routine", "My space picture cards", "Gentle mouth sensory bin"],
      observations: ["Was the child tired, crowded, excited, or frustrated?", "Who was nearby?", "What replacement helped?"],
      parentNotes: ["We are watching for patterns and teaching safe replacement choices.", "We are using simple words like stop, space, and help.", "We will keep sharing triggers and what helps."],
    },
    Hitting: {
      why: "Hitting can happen when a child is frustrated, excited, overstimulated, or still learning safe ways to interact.",
      tips: ["Block gently and say, hands are for helping.", "Give a replacement phrase.", "Practice gentle hands during calm play."],
      activities: ["Gentle hands puppet play", "Push wall then breathe", "Partner high-five turn game"],
      observations: ["What was the child trying to get or avoid?", "Did adult proximity help?", "What replacement words were used?"],
      parentNotes: ["We are practicing safe hands and replacement words.", "We will keep coaching before peer play gets too busy.", "We noticed calm reminders helped today."],
    },
    Pushing: {
      why: "Pushing may mean a child wants space, a turn, or help joining play.",
      tips: ["Teach stop and space.", "Use visual turn-taking cues.", "Stay nearby during high-energy play."],
      activities: ["Personal space bubble game", "Timer turn-taking", "Ask to play picture cards"],
      observations: ["Was pushing connected to turn taking?", "Was the child seeking space?", "What cue helped?"],
      parentNotes: ["We are teaching space, stop, and turn-taking words.", "Short practice games are helping build safe peer play.", "We will keep watching when play gets crowded."],
    },
    "Potty Training": {
      why: "Potty training grows from body awareness, routine, readiness, clothing independence, and confidence.",
      tips: ["Use a predictable bathroom routine.", "Keep language neutral.", "Celebrate sitting, trying, and handwashing."],
      activities: ["Bathroom visual steps", "Doll potty routine", "Handwashing song"],
      observations: ["Did the child notice body cues?", "Did they follow bathroom steps?", "What support was needed?"],
      parentNotes: ["We are keeping potty practice calm and predictable.", "Please share the words and routine used at home.", "Today we practiced bathroom steps and handwashing."],
    },
    "Following Directions": {
      why: "Following directions depends on attention, language understanding, routine memory, and adult connection.",
      tips: ["Give one direction at a time.", "Pair words with a visual or gesture.", "Praise the exact follow-through."],
      activities: ["One-step direction game", "Picture direction cards", "Simon Says with movement"],
      observations: ["Could the child follow one step?", "Did a gesture or picture help?", "Was the task too long?"],
      parentNotes: ["We are practicing one-step directions with pictures and gestures.", "Short directions worked best today.", "We will keep building listening in playful routines."],
    },
    "Speech & Language": {
      why: "Speech and language grow through repeated words, songs, books, play routines, and responsive conversations.",
      tips: ["Model short phrases.", "Pause so the child can respond.", "Repeat important words during play."],
      activities: ["Picture card naming", "Book basket conversation", "Choice-making with two objects"],
      observations: ["What words, gestures, or sounds did the child use?", "Did they imitate?", "What helped them communicate?"],
      parentNotes: ["We are modeling short phrases and giving wait time.", "Books, songs, and choices are helping us invite more language.", "We will keep noting new words and communication attempts."],
    },
    "Fine Motor": {
      why: "Fine motor skills build through hand strength, grasp, coordination, and repeated practice with small tools.",
      tips: ["Offer short practice times.", "Use chunky tools first if needed.", "Support hand strength before expecting precision."],
      activities: ["Playdough pinch and roll", "Bead threading", "Scissor snip strips"],
      observations: ["How did the child grasp materials?", "Did they use one hand or both?", "What level of help was needed?"],
      parentNotes: ["We are building hand strength through play.", "Short tool practice is helping confidence.", "Playdough, stickers, and safe cutting are good next steps."],
    },
  };
  const content = { ...base, ...(overrides[topic] || {}) };
  if (!child || !isInfantChild(child)) return content;
  return {
    ...content,
    tips: [
      "Use short one-to-one play moments and follow the baby's cues.",
      "Use only large baby-safe materials and stay within arm's reach.",
      "Stop when the baby shows fatigue, distress, or disinterest.",
    ],
    activities: suggestedActivitiesForArea(area || "Approaches to Learning", child).slice(0, 3),
    observations: [
      "What did the baby reach for, grasp, look at, babble toward, or try again?",
      "Which support helped the baby stay calm and engaged?",
      "How long did the baby participate before needing a break?",
    ],
    parentNotes: [
      "We are using short, safe play moments that match your baby's age and cues.",
      "Today we watched what your baby reached for, noticed, or tried again.",
      "Simple floor play, songs, board books, and large safe toys are best right now.",
    ],
  };
}

function supportCenterSelectedChild(records = childRecords()) {
  return records.children.find((child) => child.id === activeSupportChildId)
    || records.children.find((child) => child.id === selectedChildId)
    || records.children[0]
    || null;
}

function supportSearchResults(query = "") {
  const lower = String(query || "").toLowerCase().trim();
  if (!lower) return [];
  return supportCenterCategories()
    .flatMap((category) => category.topics.map((topic) => ({ ...category, topic, topicId: supportTopicSlug(topic), content: supportTopicContent(topic) })))
    .filter((item) => [
      item.title,
      item.topic,
      item.detail,
      item.content.why,
      ...item.content.tips,
      ...item.content.activities,
    ].join(" ").toLowerCase().includes(lower));
}

function supportTopicResources(topic = "", child = null, records = childRecords()) {
  const area = supportTopicDevelopmentArea(topic);
  const childAgeGroup = child?.ageGroup || "";
  const lessonsResult = portfolioResourcesFor("Lesson Plans", [area], childAgeGroup, 3);
  const printablesResult = portfolioResourcesFor("Printables", [area], childAgeGroup, 3);
  const activitiesResult = portfolioResourcesFor("Activity Center", [area], childAgeGroup, 3);
  return {
    area,
    lessons: lessonsResult.items,
    printables: printablesResult.items,
    activities: activitiesResult.items,
  };
}

function renderSupportCenterPage() {
  const section = document.querySelector("#view-support-center");
  if (!section) return;
  const records = childRecords();
  const topic = supportTopicById(activeSupportTopicId);
  if (topic) {
    section.innerHTML = renderSupportTopicPage(topic, records);
    return;
  }
  const category = supportCategoryById(activeSupportCategoryId);
  section.innerHTML = category ? renderSupportCategoryPage(category) : renderSupportHomePage(records);
}

function renderSupportHomePage(records = childRecords()) {
  const currentChild = selectedChild(records);
  const childSupportAreas = currentChild ? childSelectedSupportAreas(currentChild).slice(0, 3) : [];
  const searchResults = supportSearchResults(supportCenterSearch);
  return `
    <section class="support-center-page">
      <div class="page-title support-center-title">
        <p class="eyebrow">Support Center</p>
        <h2>Quick help for common childcare challenges.</h2>
        <p>Pick one area, then open only the details you need.</p>
      </div>
      <label class="support-search">
        <span>Search support topics</span>
        <input id="supportCenterSearch" type="search" value="${escapeHtml(supportCenterSearch)}" placeholder="Tantrums, biting, potty training, transitions" />
      </label>
      ${supportCenterSearch ? `
        <div class="support-topic-grid">
          ${searchResults.length ? searchResults.map((item) => `
            <button class="support-topic-card" data-support-topic="${item.topicId}" type="button">
              <strong>${escapeHtml(item.topic)}</strong>
              <span>${escapeHtml(item.content.why)}</span>
            </button>
          `).join("") : `<div class="empty-state">No support topics match yet.</div>`}
        </div>
      ` : `
        <div class="support-category-grid">
          ${supportCenterCategories().map((category) => `
            <button class="support-category-card" data-support-category="${category.id}" type="button">
              <span>${escapeHtml(category.title.slice(0, 2).toUpperCase())}</span>
              <strong>${escapeHtml(category.title)}</strong>
              <p>${escapeHtml(category.detail)}</p>
            </button>
          `).join("")}
        </div>
      `}
      ${childSupportAreas.length ? `
        <section class="section-block support-child-shortcuts">
          <div>
            <p class="eyebrow">From Child Profiles</p>
            <h3>${escapeHtml(currentChild.name)} support areas</h3>
          </div>
          <div class="support-shortcut-list">
            ${childSupportAreas.map((area) => `<button class="ghost-button" data-support-topic="${supportTopicIdForArea(area)}" data-support-child-id="${currentChild.id}" type="button">View ${escapeHtml(area)} Support</button>`).join("")}
          </div>
        </section>
      ` : ""}
    </section>
  `;
}

function renderSupportCategoryPage(category) {
  return `
    <section class="support-center-page">
      <button class="ghost-button back-button" data-support-home type="button">Back to Support Center</button>
      <div class="page-title support-center-title">
        <p class="eyebrow">Support Center</p>
        <h2>${escapeHtml(category.title)}</h2>
        <p>${escapeHtml(category.detail)}</p>
      </div>
      <div class="support-topic-grid">
        ${category.topics.map((topic) => `
          <button class="support-topic-card" data-support-topic="${supportTopicSlug(topic)}" type="button">
            <strong>${escapeHtml(topic)}</strong>
            <span>${escapeHtml(supportTopicContent(topic).why)}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSupportTopicPage(topicRecord, records = childRecords()) {
  const topic = topicRecord.topic;
  const child = supportCenterSelectedChild(records);
  const content = supportTopicContent(topic, child);
  const tabs = [
    ["why", "Why"],
    ["tips", "Tips"],
    ["activities", "Activities"],
    ["observations", "Observations"],
    ["parent", "Parent Notes"],
    ["resources", "Resources"],
  ];
  return `
    <section class="support-center-page">
      <button class="ghost-button back-button" data-support-category="${topicRecord.id}" type="button">Back to ${escapeHtml(topicRecord.title)}</button>
      <section class="section-block support-topic-hero">
        <div>
          <p class="eyebrow">${escapeHtml(topicRecord.title)}</p>
          <h2>${escapeHtml(topic)}</h2>
          <p>${escapeHtml(content.why)}</p>
        </div>
        ${renderSupportChildPicker(topic, child, records)}
      </section>
      <div class="support-tab-row" aria-label="Support topic sections">
        ${tabs.map(([id, label]) => `<button class="${activeSupportTab === id ? "active" : ""}" data-support-tab="${id}" type="button">${label}</button>`).join("")}
      </div>
      ${renderSupportTopicTabContent(topic, content, child, records)}
      <section class="section-block support-ai-card">
        <div>
          <p class="eyebrow">AI Suggestions</p>
          <h3>${child ? `Ideas for ${escapeHtml(child.name)}` : "Personalized ideas"}</h3>
          <p>Uses child age, age group, goals, support areas, observations, and progress history when available.</p>
        </div>
        <button class="primary-button" data-support-ai="${supportTopicSlug(topic)}" type="button">Give Me Ideas</button>
        <div class="support-ai-output" id="supportAiOutput" aria-live="polite"></div>
      </section>
    </section>
  `;
}

function renderSupportChildPicker(topic, child, records = childRecords()) {
  if (!records.children.length) {
    return `<div class="support-child-context"><strong>No child selected</strong><span>Add a child profile for personalized ideas.</span></div>`;
  }
  const selectedSupport = child ? childSupportMatchesTopic(child, topic) : false;
  return `
    <label class="support-child-picker">
      <span>Personalize for child</span>
      <select id="supportCenterChildSelect">
        ${records.children.map((item) => `<option value="${item.id}" ${child?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
      </select>
      ${child ? `<small>${escapeHtml(childAgeLabel(child))}${child.ageGroup ? ` | ${escapeHtml(child.ageGroup)}` : ""}${selectedSupport ? " | Connected from profile" : ""}</small>` : ""}
    </label>
  `;
}

function renderSupportTopicTabContent(topic, content, child, records = childRecords()) {
  const resourcesForTopic = supportTopicResources(topic, child, records);
  const cardList = (items) => `<div class="support-simple-card-grid">${items.map((item) => `<article><span>${escapeHtml(item)}</span></article>`).join("")}</div>`;
  if (activeSupportTab === "tips") {
    return `<section class="section-block support-detail-panel"><h3>Provider Tips</h3>${renderSupportBulletList(content.tips)}</section>`;
  }
  if (activeSupportTab === "activities") {
    const resourceCards = resourcesForTopic.activities.length ? resourcesForTopic.activities.map(renderSupportMiniResourceCard).join("") : "";
    return `<section class="section-block support-detail-panel"><h3>Activities To Try</h3>${cardList(content.activities)}${resourceCards ? `<div class="support-resource-mini-grid">${resourceCards}</div>` : ""}</section>`;
  }
  if (activeSupportTab === "observations") {
    return `<section class="section-block support-detail-panel"><h3>Observation Ideas</h3>${cardList(content.observations)}</section>`;
  }
  if (activeSupportTab === "parent") {
    return `<section class="section-block support-detail-panel"><h3>Parent Communication Ideas</h3>${cardList(content.parentNotes)}</section>`;
  }
  if (activeSupportTab === "resources") {
    return `
      <section class="section-block support-detail-panel">
        <h3>Related Resources</h3>
        <div class="support-resource-section">
          <strong>Related Lesson Plans</strong>
          <div class="support-resource-mini-grid">${resourcesForTopic.lessons.length ? resourcesForTopic.lessons.map(renderSupportMiniResourceCard).join("") : `<p>No matching lesson plans yet - use AI to create ideas for this support area.</p>`}</div>
        </div>
        <div class="support-resource-section">
          <strong>Related Printables</strong>
          <div class="support-resource-mini-grid">${resourcesForTopic.printables.length ? resourcesForTopic.printables.map(renderSupportMiniResourceCard).join("") : `<p>No matching printables yet - use AI to create activities for this support area.</p>`}</div>
        </div>
      </section>
    `;
  }
  return `<section class="section-block support-detail-panel"><h3>Why It Happens</h3><p>${escapeHtml(content.why)}</p></section>`;
}

function renderSupportBulletList(items = []) {
  return `<ul class="support-bullet-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderSupportMiniResourceCard(resource = {}) {
  return `
    <article class="support-mini-resource">
      <strong>${escapeHtml(resource.title || "Resource")}</strong>
      <span>${escapeHtml([resource.age || resource.ageGroup, resource.developmentalArea || resource.activityFocus || resource.theme].filter(Boolean).join(" | "))}</span>
    </article>
  `;
}

function renderSupportAiIdeas(topic = "", child = null, records = childRecords()) {
  const content = supportTopicContent(topic, child);
  const resourcesForTopic = supportTopicResources(topic, child, records);
  const observations = child ? records.observations.filter((item) => item.childId === child.id).slice(-2) : [];
  const context = child ? childRecommendationContext(child, records) : null;
  const progress = child ? childProgressSummary(child.id, records) : null;
  const childLabel = child ? `${child.name} | ${childAgeLabel(child)}${child.ageGroup ? ` | ${child.ageGroup}` : ""}` : "General support ideas";
  const activeGoalLabels = context
    ? context.portfolio.goals
      .filter((goal) => goalProgressPercent(goal.progress) < 100)
      .map((goal) => displayDevelopmentArea(normalizeObservationArea(goal.area) || inferAreasFromGoalText(goal.goal)[0] || goal.area))
      .filter(Boolean)
    : [];
  const goalLabel = childGoalDisplayLabels(child || {}).join(", ") || Array.from(new Set(activeGoalLabels)).join(", ") || "None selected";
  const transitionIdeas = topic.toLowerCase().includes("transition") || topic === "Tantrums"
    ? ["Use a two-minute warning.", "Give a helper job.", "Use first-then wording."]
    : ["Practice the skill before the hard routine.", "Use a picture cue.", "Keep the routine predictable."];
  return `
    <div class="support-ai-panel">
      <div class="child-ai-context">
        <strong>${escapeHtml(childLabel)}</strong>
        ${context ? `<span>Goals: ${escapeHtml(goalLabel)}</span><span>Support: ${escapeHtml(childSelectedSupportAreas(child).join(", ") || topic)}</span><span>Progress: ${progress.progressPercent}%</span>` : ""}
      </div>
      <div class="support-ai-grid">
        <div><strong>Activities</strong>${renderSupportBulletList(content.activities.slice(0, 3))}</div>
        <div><strong>Guidance Strategies</strong>${renderSupportBulletList(content.tips.slice(0, 3))}</div>
        <div><strong>Transition Ideas</strong>${renderSupportBulletList(transitionIdeas)}</div>
        <div><strong>Observation Prompts</strong>${renderSupportBulletList(observations.length ? observations.map((item) => `Build from: ${item.text}`) : content.observations.slice(0, 3))}</div>
        <div><strong>Parent Communication</strong>${renderSupportBulletList(content.parentNotes.slice(0, 3))}</div>
        <div><strong>Related Resources</strong>${renderSupportBulletList([
          resourcesForTopic.lessons[0]?.title || "Create a matching lesson plan idea.",
          resourcesForTopic.printables[0]?.title || "Create a printable support activity.",
        ])}</div>
      </div>
    </div>
  `;
}

function observationAnalysis(record, child = {}) {
  const selectedCategories = Array.isArray(record.categories)
    ? record.categories.map((area) => normalizeObservationArea(area) || area).filter(Boolean)
    : [];
  const categories = selectedCategories.length ? Array.from(new Set(selectedCategories)) : categorizeObservation(record.text, record.area);
  const primaryArea = categories[0] || "Approaches to Learning";
  const childName = child.name || "The child";
  const elg = elgConnection(primaryArea);
  const inferredSupportMatches = observationSupportAreaMatches(record, child);
  const supportMatches = inferredSupportMatches.length
    ? inferredSupportMatches
    : Array.isArray(record.supportAreaMatches) ? record.supportAreaMatches : [];
  const generatedActivities = record.suggestedActivities || suggestedActivitiesForArea(primaryArea, child);
  const safeActivities = isInfantChild(child)
    ? generatedActivities.filter((item) => !infantUnsafeRecommendationText(item))
    : generatedActivities;
  return {
    categories,
    primaryArea,
    developmentArea: primaryArea,
    supportAreaMatches: supportMatches,
    strengths: record.strengths || strengthForArea(primaryArea, childName),
    nextSteps: record.nextSteps || nextStepForArea(primaryArea, child),
    suggestedActivities: safeActivities.length ? safeActivities : suggestedActivitiesForArea(primaryArea, child),
    suggestedLessonPlans: record.suggestedLessonPlans || suggestedLessonPlansForArea(primaryArea),
    elgDomain: record.elgDomain || elg.domain,
    elgSkill: record.elgSkill || elg.skill,
  };
}

function enrichObservationRecord(record, child = {}) {
  const analysis = observationAnalysis(record, child);
  return {
    ...record,
    area: analysis.primaryArea,
    categories: analysis.categories,
    developmentArea: analysis.developmentArea,
    supportAreaMatches: analysis.supportAreaMatches,
    strengths: analysis.strengths,
    nextSteps: analysis.nextSteps,
    suggestedActivities: analysis.suggestedActivities,
    suggestedLessonPlans: analysis.suggestedLessonPlans,
    elgDomain: analysis.elgDomain,
    elgSkill: analysis.elgSkill,
  };
}

function weeklyObservationStats(records = childRecords()) {
  const thisWeekObservations = records.observations.filter((item) => isThisWeek(item.date));
  const byChild = new Map(records.children.map((child) => [child.id, 0]));
  thisWeekObservations.forEach((item) => byChild.set(item.childId, (byChild.get(item.childId) || 0) + 1));
  const totalNeeded = records.children.length * weeklyObservationsPerChild;
  const completed = Math.min(thisWeekObservations.length, totalNeeded);
  const percent = totalNeeded ? Math.min(100, Math.round((completed / totalNeeded) * 100)) : 0;
  const missingChildren = records.children.filter((child) => (byChild.get(child.id) || 0) < weeklyObservationsPerChild);
  const completedChildren = records.children.filter((child) => (byChild.get(child.id) || 0) >= weeklyObservationsPerChild);
  return { thisWeekObservations, byChild, totalNeeded, completed, percent, missingChildren, completedChildren };
}

function goalProgressPercent(progress) {
  const text = String(progress || "").toLowerCase();
  const number = Number(text.match(/\d+/)?.[0] || "");
  if (!Number.isNaN(number) && number >= 0) return Math.min(100, number);
  if (text.includes("complete")) return 100;
  if (text.includes("improving")) return 75;
  if (text.includes("progress")) return 50;
  if (text.includes("started")) return 25;
  return 0;
}

function childSupportAreas(childId, records = childRecords()) {
  const child = records.children.find((item) => item.id === childId) || {};
  const observations = records.observations.filter((item) => item.childId === childId).slice(-6);
  const goals = records.goals.filter((item) => item.childId === childId && goalProgressPercent(item.progress) < 100);
  const selectedAreas = childSelectedGoalAreas(child);
  const supportAreas = childSelectedSupportAreas(child).map(supportAreaToDevelopmentArea);
  const areas = [...selectedAreas, ...supportAreas, ...goals.map((goal) => normalizeObservationArea(goal.area) || goal.area), ...observations.map((item) => item.developmentArea || item.area)];
  return Array.from(new Set(areas.filter(Boolean))).slice(0, 4);
}

function connectedObservationsForGoal(goal, records = childRecords()) {
  const goalArea = normalizeObservationArea(goal.area) || goal.area;
  return records.observations.filter((item) => item.childId === goal.childId && (item.categories || [item.area]).includes(goalArea));
}

function renderChipList(items = []) {
  return `<div class="chip-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderWeeklyPlanningDashboard(records, stats) {
  const activeGoals = records.goals.filter((goal) => goalProgressPercent(goal.progress) < 100);
  const supportChildren = records.children.filter((child) => stats.missingChildren.some((item) => item.id === child.id) || activeGoals.some((goal) => goal.childId === child.id));
  const activeAreas = Array.from(new Set([
    ...activeGoals.map((goal) => normalizeObservationArea(goal.area) || goal.area),
    ...stats.thisWeekObservations.map((item) => item.developmentArea || item.area),
  ].filter(Boolean))).slice(0, 3);
  const lessonPlans = (activeAreas.length ? activeAreas : ["Fine Motor"]).flatMap(suggestedLessonPlansForArea).slice(0, 5);
  const activities = (activeAreas.length ? activeAreas : ["Fine Motor"]).flatMap(suggestedActivitiesForArea).slice(0, 6);
  return `
    <section class="section-block weekly-planning-dashboard">
      <div class="section-heading">
        <div>
          <p class="eyebrow">This Week</p>
          <h3>Weekly Planning Dashboard</h3>
        </div>
        <span class="tag">${stats.percent}% complete</span>
      </div>
      <div class="planning-dashboard-grid">
        <article><strong>${Math.max(stats.totalNeeded - stats.completed, 0)}</strong><span>observations due</span></article>
        <article><strong>${supportChildren.length}</strong><span>children needing support</span></article>
        <article><strong>${activeGoals.length}</strong><span>active goals</span></article>
        <article><strong>${stats.completed}/${stats.totalNeeded}</strong><span>observation completion rate</span></article>
      </div>
      <div class="recommendation-grid">
        <div><strong>Recommended Lesson Plans</strong>${renderChipList(lessonPlans)}</div>
        <div><strong>Recommended Activities</strong>${renderChipList(activities)}</div>
      </div>
    </section>
  `;
}

function lastObservationDate(childId, observations = childRecords().observations) {
  const dates = observations.filter((item) => item.childId === childId).map((item) => item.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : "None yet";
}

function childPortfolioRecords(childId, records = childRecords()) {
  const child = records.children.find((item) => item.id === childId);
  return {
    child,
    observations: records.observations.filter((item) => item.childId === childId),
    supportPlans: records.supportPlans.filter((item) => item.childId === childId),
    goals: records.goals.filter((item) => item.childId === childId),
    differentiations: records.differentiations.filter((item) => item.childId === childId),
    attendance: records.attendance.filter((item) => item.childId === childId),
    meals: records.meals.filter((item) => item.childId === childId),
    reports: records.reports.filter((item) => item.childId === childId),
    communications: records.communications.filter((item) => item.childId === childId),
  };
}

function childProgressSummary(childId, records = childRecords()) {
  const portfolio = childPortfolioRecords(childId, records);
  const weeklyStats = weeklyObservationStats(records);
  const weeklyCompleted = weeklyStats.byChild.get(childId) || 0;
  const activeGoals = portfolio.goals.filter((goal) => goalProgressPercent(goal.progress) < 100);
  const goalProgress = portfolio.goals.length
    ? Math.round(portfolio.goals.reduce((sum, goal) => sum + goalProgressPercent(goal.progress), 0) / portfolio.goals.length)
    : Math.min(100, portfolio.observations.length * 10);
  return {
    observationsCompleted: portfolio.observations.length,
    observationsNeeded: Math.max(weeklyObservationsPerChild - weeklyCompleted, 0),
    activeGoals: activeGoals.length,
    activitiesCompleted: portfolio.differentiations.length,
    lastObservation: formatDateLabel(lastObservationDate(childId, records.observations)),
    progressPercent: goalProgress,
    weeklyCompleted,
  };
}

function recommendationKeywordsForArea(area) {
  const map = {
    "Social Emotional": ["social", "emotional", "feelings", "friend", "share", "turn", "calm", "cooperation", "self regulation"],
    "Language & Literacy": ["language", "literacy", "speech", "talk", "vocabulary", "communication", "book", "story", "letter", "sound"],
    "Cognitive Development": ["cognitive", "math", "science", "count", "number", "sort", "match", "pattern", "problem", "shape"],
    "Fine Motor": ["fine motor", "cutting", "tracing", "pinch", "writing", "grasp", "scissor", "bead", "playdough"],
    "Gross Motor": ["gross motor", "balance", "jump", "climb", "hop", "coordination", "movement", "run", "crawl"],
    "Physical Development": ["physical", "self help", "health", "body", "potty", "toilet", "dress", "wash", "nutrition"],
    "Creative Arts": ["creative", "art", "music", "dance", "pretend", "paint", "color", "collage"],
    "Approaches to Learning": ["approaches", "curious", "focus", "persist", "try", "problem solving", "choice", "explore"],
  };
  return map[area] || map["Approaches to Learning"];
}

function inferAreasFromGoalText(text = "") {
  const lower = String(text || "").toLowerCase();
  if (!lower.trim()) return [];
  const matches = observationCategories
    .map((area) => {
      const candidates = [area.toLowerCase(), ...recommendationKeywordsForArea(area)];
      const positions = candidates.map((keyword) => lower.indexOf(keyword)).filter((position) => position >= 0);
      return positions.length ? { area, position: Math.min(...positions) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)
    .map((item) => item.area);
  const normalized = normalizeObservationArea(text);
  return Array.from(new Set([...matches, normalized].filter(Boolean)));
}

function childRecommendationAreas(child, goals = [], observations = []) {
  const selectedAreas = [
    ...childSelectedGoalAreas(child),
    ...childSelectedSupportAreas(child).map(supportAreaToDevelopmentArea),
  ];
  if (selectedAreas.length) return Array.from(new Set(selectedAreas)).slice(0, 4);
  const activeGoals = goals.filter((goal) => goalProgressPercent(goal.progress) < 100);
  const goalText = [
    child?.activeGoals,
    ...activeGoals.map((goal) => `${goal.area || ""} ${goal.goal || ""} ${goal.notes || ""}`),
  ].join(" ");
  const goalAreas = inferAreasFromGoalText(goalText);
  if (goalAreas.length) return goalAreas.slice(0, 4);
  const observationAreas = observations.slice(-5).flatMap((item) => item.categories || [item.area]).filter(Boolean);
  return Array.from(new Set(observationAreas)).slice(0, 4).length
    ? Array.from(new Set(observationAreas)).slice(0, 4)
    : ["Approaches to Learning"];
}

function resourceRecommendationScore(resource, areas) {
  const haystack = [
    resource.title,
    resource.category,
    resource.age,
    resource.ageGroup,
    resource.description,
    resource.theme,
    resource.activityFocus,
    resource.developmentalArea,
    ...(resource.tags || []),
  ].join(" ").toLowerCase();
  return areas.reduce((score, area) => {
    const areaText = String(area || "").toLowerCase();
    const areaScore = haystack.includes(areaText) ? 5 : 0;
    const keywordScore = recommendationKeywordsForArea(area).filter((keyword) => haystack.includes(keyword)).length;
    return score + areaScore + keywordScore;
  }, 0);
}

function normalizeAgeGroup(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("infant")) return "Infant";
  if (text.includes("toddler")) return "Toddler";
  if (text.includes("preschool")) return "Preschool";
  if (text.includes("school")) return "School Age";
  if (text.includes("mixed")) return "Mixed Ages";
  if (text.includes("all")) return "All Ages";
  return "";
}

function resourceAgeGroup(resource) {
  return normalizeAgeGroup(resource.age || resource.ageGroup || resource.group || resource.ages || "");
}

function resourceAgeTier(resource, childAgeGroup) {
  const childAge = normalizeAgeGroup(childAgeGroup);
  const resourceAge = resourceAgeGroup(resource);
  if (!childAge) return resourceAge === "All Ages" ? 2 : 1;
  if (resourceAge === childAge) return 1;
  if (resourceAge === "All Ages" || resourceAge === "Mixed Ages") return 2;
  return 3;
}

function infantUnsafeRecommendationText(value = "") {
  return /\b(scissors?|cutting|cut along|tracing|trace|beads?|beading|stringing|play\s*dough|playdough|tongs?|tweezers?|pencils?|writing|worksheet)\b/i.test(String(value || ""));
}

function resourceUnsafeForInfant(resource = {}) {
  const haystack = [
    resource.title,
    resource.category,
    resource.description,
    resource.theme,
    resource.activityFocus,
    resource.developmentalArea,
    ...(resource.tags || []),
  ].join(" ");
  return infantUnsafeRecommendationText(haystack);
}

function resourceAreaMatchLevel(resource, areas) {
  for (const area of areas) {
    const areaText = String(area || "").toLowerCase();
    if (!areaText) continue;
    const primaryFields = [
      resource.developmentalArea,
      resource.title,
    ].join(" ").toLowerCase();
    const primaryCandidates = [areaText, displayDevelopmentArea(area), ...recommendationKeywordsForArea(area)]
      .map((keyword) => String(keyword || "").toLowerCase())
      .filter((keyword) => keyword.length > 2);
    if (primaryCandidates.some((keyword) => primaryFields.includes(keyword))) return 4;
  }
  const haystack = [
    resource.title,
    resource.category,
    resource.age,
    resource.ageGroup,
    resource.description,
    resource.theme,
    resource.activityFocus,
    resource.developmentalArea,
    ...(resource.tags || []),
  ].join(" ").toLowerCase();
  for (const area of areas) {
    const areaText = String(area || "").toLowerCase();
    if (areaText && haystack.includes(areaText)) return 3;
  }
  for (const area of areas) {
    if (recommendationKeywordsForArea(area).some((keyword) => haystack.includes(keyword))) return 2;
  }
  return 0;
}

function ageAwareResourceMatches(category, areas, childAgeGroup) {
  const infant = normalizeAgeGroup(childAgeGroup) === "Infant";
  return resources
    .filter((resource) => resource.category === category && resourceRecommendationScore(resource, areas) > 0)
    .filter((resource) => isResourceVisibleToCurrentUser(resource))
    .filter((resource) => !infant || !resourceUnsafeForInfant(resource))
    .map((resource) => ({
      resource,
      ageTier: resourceAgeTier(resource, childAgeGroup),
      matchLevel: resourceAreaMatchLevel(resource, areas),
      score: resourceRecommendationScore(resource, areas),
    }))
    .sort((a, b) => (
      a.ageTier - b.ageTier
      || b.matchLevel - a.matchLevel
      || b.score - a.score
      || a.resource.title.localeCompare(b.resource.title)
  ));
}

function recommendationResourceLabel(category) {
  const labels = {
    "Activity Center": "activities",
    "Lesson Plans": "lesson plans",
    "Observation Hub": "observations",
    Printables: "printables",
    "Forms Library": "forms",
    "Menu Center": "menus",
  };
  return labels[category] || "resources";
}

function portfolioResourcesFor(category, areas, childAgeGroup, limit = 4) {
  const matches = ageAwareResourceMatches(category, areas, childAgeGroup);
  const exactAgeExactArea = matches.filter((item) => item.ageTier === 1 && item.matchLevel >= 3);
  const exactAgeRelatedArea = matches.filter((item) => item.ageTier === 1 && item.matchLevel > 0 && item.matchLevel < 3);
  const ageNeutralFallback = matches.filter((item) => item.ageTier === 2);
  const selected = [
    ...exactAgeExactArea,
    ...exactAgeRelatedArea,
    ...ageNeutralFallback,
  ];
  const seen = new Set();
  const items = selected.filter((item) => {
    if (seen.has(item.resource.id)) return false;
    seen.add(item.resource.id);
    return true;
  });
  const childAge = normalizeAgeGroup(childAgeGroup);
  const primaryArea = areas[0] || "developmental";
  const itemLabel = recommendationResourceLabel(category);
  const exactAgeCount = exactAgeExactArea.length + exactAgeRelatedArea.length;
  let note = "";
  if (!exactAgeExactArea.length && exactAgeRelatedArea.length) {
    note = `No ${childAge || "matching age"} ${primaryArea} ${itemLabel} found. Showing related ${childAge || "same-age"} ${itemLabel}.`;
  } else if (!exactAgeCount && ageNeutralFallback.length) {
    note = `No ${childAge || "matching age"} ${primaryArea} ${itemLabel} found. Showing age-neutral ${itemLabel}.`;
  } else if (!items.length) {
    note = `No matching ${childAge || "age-aware"} ${primaryArea} ${itemLabel} found yet.`;
  }
  return { items: items.slice(0, limit).map((item) => item.resource), note };
}

function childLessonRecommendations(child = {}, records = childRecords(), limit = 6) {
  const context = childRecommendationContext(child, records);
  const primaryArea = context.areas[0] || "Approaches to Learning";
  const primaryGoalArea = context.goalAreas[0] || primaryArea;
  const primarySupport = context.supportAreas[0] || "";
  const scored = resources
    .filter((resource) => resource.category === "Lesson Plans")
    .filter((resource) => !isInfantChild(child) || !resourceUnsafeForInfant(resource))
    .map((resource) => {
      const ageTier = resourceAgeTier(resource, child.ageGroup);
      const primaryDisplayArea = displayDevelopmentArea(primaryGoalArea);
      const resourcePrimaryText = [resource.developmentalArea, resource.tags?.[0]].join(" ").toLowerCase();
      const exactDevelopmentArea = primaryDisplayArea === "Speech & Language"
        ? /(speech|language)/.test(resourcePrimaryText)
        : resourcePrimaryText.includes(primaryDisplayArea.toLowerCase());
      const goalMatchLevel = resourceAreaMatchLevel(resource, [primaryGoalArea]);
      const goalScore = resourceRecommendationScore(resource, [primaryGoalArea]);
      const relatedAreaScore = resourceRecommendationScore(resource, context.areas);
      const supportScore = context.supportAreas.reduce((score, support) => {
        const mapped = supportAreaToDevelopmentArea(support);
        const text = [support, mapped, ...recommendationKeywordsForArea(mapped)].join(" ").toLowerCase();
        const haystack = [resource.title, resource.description, resource.theme, resource.developmentalArea, ...(resource.tags || [])].join(" ").toLowerCase();
        return score + (text.split(/\s+/).some((word) => word.length > 3 && haystack.includes(word)) ? 3 : 0);
      }, 0);
      return {
        resource,
        score: (ageTier === 1 ? 30 : ageTier === 2 ? 12 : 0) + (exactDevelopmentArea ? 120 : 0) + (goalMatchLevel * 40) + (goalScore * 4) + (relatedAreaScore * 2) + (supportScore * 2),
        ageTier,
        exactDevelopmentArea,
        goalMatchLevel,
        supportScore,
      };
    })
    .sort((a, b) => b.score - a.score || Number(b.exactDevelopmentArea) - Number(a.exactDevelopmentArea) || b.goalMatchLevel - a.goalMatchLevel || a.ageTier - b.ageTier || a.resource.title.localeCompare(b.resource.title));
  const exactOrNeutral = scored.filter((item) => item.ageTier <= 2);
  const selected = exactOrNeutral.slice(0, limit);
  return selected
    .map(({ resource }) => ({
      ...resource,
      _childRecommendation: {
        childId: child.id,
        childName: child.name || "Child",
        ageGroup: normalizeAgeGroup(child.ageGroup) || child.ageGroup || "Age Group",
        goalMatch: displayDevelopmentArea(primaryGoalArea),
        supportArea: resourceAreaMatchLevel(resource, [supportAreaToDevelopmentArea(primarySupport)]) > 0 ? primarySupport : "",
        why: `Supports ${child.name || "this child"}'s current developmental goals${primarySupport ? ` and considers ${primarySupport.toLowerCase()} support needs` : ""}.`,
      },
    }));
}

function professionalResourceQualityScore(resource, areas = [], childAgeGroup = "", goalText = "") {
  const type = printableType(resource);
  const haystack = [
    resource.title,
    resource.description,
    resource.customContent,
    resource.theme,
    resource.activityFocus,
    resource.developmentalArea,
    goalText,
    ...(resource.tags || []),
  ].join(" ").toLowerCase();
  let score = 0;
  if (resource.category === "Printables") score += 25;
  if (resource.pdfReady || resource.pdfFileName) score += 35;
  if (professionalPrintableTypes.includes(type)) score += 15;
  if ((resource.tags || []).includes("PDF Ready")) score += 12;
  if ((resource.format || "").toLowerCase().includes("pdf")) score += 10;
  const ageTier = resourceAgeTier(resource, childAgeGroup);
  if (ageTier === 1) score += 18;
  if (ageTier === 2) score += 7;
  score += resourceAreaMatchLevel(resource, areas) * 9;
  score += Math.min(resourceRecommendationScore(resource, areas), 10);
  if (/(trace|dotted|cut|scissor|match|count|assessment|checklist|worksheet|portfolio|observation)/i.test(haystack)) score += 8;
  if (printableQualityBlockedTerms.some((term) => haystack.includes(term))) score -= 60;
  return score;
}

function prioritizeProfessionalResources(items = [], areas = [], childAgeGroup = "", goalText = "") {
  return items.slice().sort((a, b) => (
    professionalResourceQualityScore(b, areas, childAgeGroup, goalText)
    - professionalResourceQualityScore(a, areas, childAgeGroup, goalText)
    || a.title.localeCompare(b.title)
  ));
}

function professionalGoalPrintableResource(child = {}, goal = {}, area = "Developmental Goal") {
  const childAge = normalizeAgeGroup(child.ageGroup) || child.ageGroup || "All Ages";
  const type = isInfantChild(child) ? "Infant Activity Guide" : printableTypeForArea(area, goal.goal || child.activeGoals || "");
  const theme = area.replace("Language & Literacy", "Speech and Language");
  return {
    id: `generated-printable-${child.id || "child"}-${domSafeId(goal.id || goal.goal || area)}`,
    title: `${childAge} ${theme} Goal Support Printable`,
    category: "Printables",
    age: childAge,
    plan: "Generated",
    format: "Print-ready PDF",
    pdfReady: true,
    pdfFileName: `${slug(child.name || "child")}-${slug(theme)}-goal-support-printable.pdf`,
    theme,
    tags: ["Printable", "PDF Ready", type, theme, childAge, area],
    description: `Professional ${type.toLowerCase()} matched to ${child.name || "the child"}'s goal, age group, and developmental area.`,
    customContent: professionalGoalPrintableText(child, goal, area, type),
  };
}

function professionalGoalPrintableText(child = {}, goal = {}, area = "Developmental Goal", type = "Tracing Worksheets") {
  const childAge = normalizeAgeGroup(child.ageGroup) || child.ageGroup || "All Ages";
  const features = printableProfessionalFeatures(type);
  const infant = isInfantChild(child);
  return `Professional Goal Support Printable
Child: ${child.name || "Child"}
Age Group: ${childAge}
Developmental Area: ${area}
Goal: ${goal.goal || child.activeGoals || goalExampleForArea(area, child)}
Printable Type: ${type}

Teacher Directions
${infant ? "Use this as a brief one-to-one play guide. Stay within arm's reach, use only large baby-safe materials, follow the baby's cues, and stop when the baby shows fatigue or distress." : "Use this as a short small-group, one-to-one, portfolio, or take-home page. Model the first step, offer only the support the child needs, and document what the child does independently."}

Included On This Page
${features.map((item) => `- ${item}`).join("\n")}

Name: ____________________________________________  Date: ______________

Practice Section
${infant ? "Infant-safe play idea: Use soft blocks, a scarf, large rings, a board book, or a clean sensory-safe texture. Invite the baby to reach, grasp, release, look, listen, babble, or move during a short supervised play moment." : "Trace, cut, match, count, color, or mark the skill practice connected to this goal."}
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________

Observation Note
What the child did:
________________________________________________________________________
________________________________________________________________________

Next Step
${infant ? "Repeat the same safe play moment later in the day or week, watching for what the baby notices, reaches for, or tries again." : "Offer the same skill again with one small added challenge, less adult support, or a new material."}`;
}

function renderPortfolioResourceCard(resource) {
  const locked = !canAccess(resource);
  return `
    <article class="portfolio-resource-card">
      <span class="tag">${escapeHtml(resource.category)}</span>
      <strong>${escapeHtml(resource.title)}</strong>
      <p>${escapeHtml(resource.description || "Ready-to-use Little Learner Hub resource.")}</p>
      <button class="ghost-button" ${locked ? `data-pro-feature="resource-limit"` : `data-view-resource="${resource.id}"`} type="button">${locked ? "Upgrade" : "Open"}</button>
    </article>
  `;
}

function renderPortfolioRecommendationSection(title, result, fallbackItems = []) {
  const items = Array.isArray(result) ? result : result.items || [];
  const note = Array.isArray(result) ? "" : result.note || "";
  return `
    <div class="portfolio-recommendation-section">
      <h4>${escapeHtml(title)}</h4>
      ${note ? `<p class="muted-copy">${escapeHtml(note)}</p>` : ""}
      ${items.length
        ? `<div class="portfolio-resource-grid">${items.map(renderPortfolioResourceCard).join("")}</div>`
        : `<p class="muted-copy">No exact library match yet. Suggested ideas:</p>${renderChipList(fallbackItems)}`
      }
    </div>
  `;
}

function renderRecommendedForChild(child, records, portfolio) {
  const areas = childRecommendationAreas(child, portfolio.goals, portfolio.observations);
  const primaryArea = areas[0] || "Whole Child Development";
  const displayArea = primaryArea.replace("Language & Literacy", "Speech and Language");
  const childAge = normalizeAgeGroup(child.ageGroup) || child.ageGroup || "Age Group";
  const activities = portfolioResourcesFor("Activity Center", areas, child.ageGroup);
  const lessonPlans = portfolioResourcesFor("Lesson Plans", areas, child.ageGroup);
  const observations = portfolioResourcesFor("Observation Hub", areas, child.ageGroup);
  const printables = portfolioResourcesFor("Printables", areas, child.ageGroup);
  printables.items = prioritizeProfessionalResources(printables.items, areas, child.ageGroup, primaryArea);
  const extraResources = {
    items: resources
    .filter((resource) => !["Activity Center", "Lesson Plans", "Observation Hub", "Printables"].includes(resource.category))
    .filter((resource) => resourceRecommendationScore(resource, areas) > 0)
      .map((resource) => ({ resource, ageTier: resourceAgeTier(resource, child.ageGroup), score: resourceRecommendationScore(resource, areas) }))
      .sort((a, b) => a.ageTier - b.ageTier || b.score - a.score || a.resource.title.localeCompare(b.resource.title))
      .slice(0, 4)
      .map((item) => item.resource),
    note: "",
  };
  return `
    <section class="section-block portfolio-recommendations">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Smart Goal Connections</p>
          <h3>Recommended For ${escapeHtml(child.name)}</h3>
        </div>
        <span class="tag">${escapeHtml(childAge)} | ${escapeHtml(displayArea)}</span>
      </div>
      <p class="muted-copy">These matches update automatically from the child's assigned age group, active goals, recent observations, and developmental areas.</p>
      ${renderPortfolioRecommendationSection(`Recommended ${displayArea} Activities`, activities, areas.flatMap(suggestedActivitiesForArea).slice(0, 6))}
      ${renderPortfolioRecommendationSection(`Recommended ${displayArea} Lesson Plans`, lessonPlans, areas.flatMap(suggestedLessonPlansForArea).slice(0, 6))}
      ${renderPortfolioRecommendationSection(`Recommended ${displayArea} Observations`, observations, areas.map((area) => `${area} observation wording`))}
      ${renderPortfolioRecommendationSection(`Recommended ${displayArea} Printables`, printables, areas.flatMap(suggestedActivitiesForArea).map((item) => `${item} printable`).slice(0, 6))}
      ${renderPortfolioRecommendationSection(`Recommended ${displayArea} Resources`, extraResources, ["Parent conference notes", "Progress report", "Goal planning form"])}
    </section>
  `;
}

function portfolioObservationItem(item, child) {
  const analysis = observationAnalysis(item, child);
  return `
    <article class="portfolio-timeline-item">
      <div>
        <strong>${escapeHtml(formatDateLabel(item.date))}</strong>
        <span>${escapeHtml(analysis.developmentArea)}</span>
      </div>
      <p>${escapeHtml(item.text)}</p>
      ${renderChipList(analysis.categories || [])}
      <p><b>Next step:</b> ${escapeHtml(analysis.nextSteps)}</p>
    </article>
  `;
}

function portfolioMilestones(portfolio, child) {
  const observationEvents = portfolio.observations.slice(-8).map((item) => {
    const analysis = observationAnalysis(item, child);
    return {
      date: item.date || item.createdAt || "",
      title: analysis.developmentArea,
      detail: item.text,
    };
  });
  const goalEvents = portfolio.goals
    .filter((goal) => goalProgressPercent(goal.progress) >= 100)
    .map((goal) => ({ date: goal.targetDate || goal.createdAt || "", title: "Goal completed", detail: goal.goal }));
  return [...observationEvents, ...goalEvents]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8);
}

function renderChildPortfolioPage(childId) {
  const app = document.querySelector("#childManagementApp");
  if (!app) return;
  const records = childRecords();
  const portfolio = childPortfolioRecords(childId, records);
  const child = portfolio.child;
  if (!child) {
    renderChildManagement();
    return;
  }
  activePortfolioChildId = childId;
  const summary = childProgressSummary(childId, records);
  const activeGoals = portfolio.goals.filter((goal) => goalProgressPercent(goal.progress) < 100);
  const completedGoals = portfolio.goals.filter((goal) => goalProgressPercent(goal.progress) >= 100);
  const recommendedActivities = childRecommendationAreas(child, portfolio.goals, portfolio.observations)
    .flatMap((area) => suggestedActivitiesForArea(area, child))
    .slice(0, 8);
  const filteredObservations = portfolio.observations.filter((item) => {
    const analysis = observationAnalysis(item, child);
    const haystack = [item.text, analysis.developmentArea, analysis.nextSteps, analysis.strengths, ...(analysis.categories || [])].join(" ").toLowerCase();
    const matchesSearch = haystack.includes(childPortfolioSearch.toLowerCase());
    const matchesArea = childPortfolioAreaFilter === "All" || analysis.developmentArea === childPortfolioAreaFilter || (analysis.categories || []).includes(childPortfolioAreaFilter);
    const matchesDate = !childPortfolioDateFilter || item.date === childPortfolioDateFilter;
    return matchesSearch && matchesArea && matchesDate;
  });
  const milestones = portfolioMilestones(portfolio, child);
  app.innerHTML = `
    <section class="portfolio-page">
      <div class="portfolio-topbar">
        <button class="ghost-button" data-back-to-children type="button">Back to Child Profiles</button>
        <button class="primary-button" data-export-portfolio="${child.id}" type="button">Export Portfolio PDF</button>
      </div>

      <section class="section-block portfolio-hero">
        ${child.photo ? `<img src="${child.photo}" alt="${escapeHtml(child.name)}" />` : `<div class="child-avatar">${escapeHtml(child.name.slice(0, 1).toUpperCase())}</div>`}
        <div>
          <p class="eyebrow">Child Portfolio</p>
          <h2>${escapeHtml(child.name)}</h2>
          ${childPortfolioHeroRows(child)}
        </div>
      </section>

      ${renderChildPortfolioProfileSection(child, activeGoals)}

      ${portfolio.observations.length ? `<section class="section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Observations</p>
            <h3>Observation history</h3>
          </div>
          <span class="tag">${filteredObservations.length} showing</span>
        </div>
        <div class="child-filter-row portfolio-filter-row">
          <input id="portfolioObservationSearch" value="${escapeHtml(childPortfolioSearch)}" placeholder="Search observations" />
          <input id="portfolioObservationDate" type="date" value="${escapeHtml(childPortfolioDateFilter)}" />
          <select id="portfolioObservationArea"><option>All</option>${areaOptions(childPortfolioAreaFilter)}</select>
        </div>
        <div class="portfolio-timeline">
          ${filteredObservations.length ? filteredObservations.map((item) => portfolioObservationItem(item, child)).join("") : `<div class="empty-state">No observations match yet.</div>`}
        </div>
      </section>` : ""}

      ${activeGoals.length || completedGoals.length ? `<section class="section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Goals & Progress</p>
            <h3>Active and completed goals</h3>
          </div>
          <span class="tag">${summary.progressPercent}% progress</span>
        </div>
        <div class="progress-bar"><span style="width:${summary.progressPercent}%"></span></div>
        <div class="portfolio-two-column">
          ${activeGoals.length ? `<div>
            <h4>Active Goals</h4>
            <div class="resource-list compact">${activeGoals.map((item) => goalItem(item, child)).join("")}</div>
          </div>` : ""}
          ${completedGoals.length ? `<div>
            <h4>Completed Goals</h4>
            <div class="resource-list compact">${completedGoals.map((item) => goalItem(item, child)).join("")}</div>
          </div>` : ""}
        </div>
      </section>` : ""}

      ${portfolio.differentiations.length || recommendedActivities.length ? `<section class="section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Activities & Lessons</p>
            <h3>Connected supports</h3>
          </div>
        </div>
        <div class="portfolio-two-column">
          ${portfolio.differentiations.length ? `<div>
            <h4>Activities Completed</h4>
            <div class="resource-list compact">${portfolio.differentiations.map(simpleRecordItem).join("")}</div>
          </div>` : ""}
          ${recommendedActivities.length ? `<div>
            <h4>Recommended Activities</h4>
            ${renderChipList(recommendedActivities)}
          </div>` : ""}
        </div>
      </section>` : ""}

      ${milestones.length ? `<section class="section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Milestones</p>
            <h3>Achievement timeline</h3>
          </div>
        </div>
        <div class="portfolio-timeline">
          ${milestones.map((item) => `
            <article class="portfolio-timeline-item">
              <div><strong>${escapeHtml(formatDateLabel(item.date))}</strong><span>${escapeHtml(item.title)}</span></div>
              <p>${escapeHtml(item.detail)}</p>
            </article>
          `).join("")}
        </div>
      </section>` : ""}

      ${portfolio.reports.length ? `<section class="section-block">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Reports</p>
            <h3>Progress and parent-ready reports</h3>
          </div>
          <button class="ghost-button" data-build-daily-report="${child.id}" type="button">Generate Progress Report</button>
        </div>
        <div class="resource-list compact">${portfolio.reports.map(simpleRecordItem).join("")}</div>
      </section>` : ""}

    </section>
  `;
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

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isObservationInCurrentMonth(dateText) {
  if (!dateText) return false;
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return currentMonthKey(date) === currentMonthKey();
}

function monthlyObservationGoal(child = {}) {
  const goal = Number(child.monthlyObservationGoal || child.observationsRequiredPerMonth || child.monthlyGoal || "");
  return Number.isFinite(goal) && goal > 0 ? Math.min(Math.round(goal), 31) : 4;
}

function monthlyObservationSummary(child, observations = childRecords().observations) {
  const goal = monthlyObservationGoal(child);
  const completed = observations.filter((item) => item.childId === child.id && isObservationInCurrentMonth(item.date)).length;
  const safeCompleted = Math.min(completed, goal);
  const remaining = Math.max(goal - completed, 0);
  const percent = goal ? Math.min(100, Math.round((safeCompleted / goal) * 100)) : 0;
  return { goal, completed, remaining, percent };
}

function childActiveGoals(child, records = childRecords()) {
  const areaKey = (goal = {}) => {
    const normalized = normalizeObservationArea(goal.area) || normalizeObservationArea(goal.goal) || goal.area || goal.goal || "";
    return displayDevelopmentArea(normalized).toLowerCase();
  };
  const selectedProfileAreas = (Array.isArray(child.goalAreas) ? child.goalAreas : [])
    .map((area) => normalizeObservationArea(area) || area)
    .filter(Boolean);
  const typedGoalArea = (goalText = "") => {
    const lower = String(goalText || "").toLowerCase();
    const selectedMatch = selectedProfileAreas.find((area) => {
      const keywords = [area, displayDevelopmentArea(area), ...recommendationKeywordsForArea(area), ...(categoryKeywords()[area] || [])]
        .map((keyword) => String(keyword || "").toLowerCase())
        .filter(Boolean);
      return keywords.some((keyword) => lower.includes(keyword));
    });
    return selectedMatch || inferAreasFromGoalText(goalText)[0] || "Approaches to Learning";
  };
  const savedGoals = records.goals
    .filter((goal) => goal.childId === child.id && goalProgressPercent(goal.progress) < 100)
    .map((goal) => ({ ...goal, source: goal.source || "saved" }));
  const profileAreaKeys = new Set(savedGoals.map(areaKey).filter(Boolean));
  const typedGoals = child.activeGoals
    ? child.activeGoals.split(/,|\n/).map((goal) => goal.trim()).filter(Boolean).map((goal, index) => ({
      id: `${child.id}-typed-goal-${index}`,
      source: "typed",
      area: typedGoalArea(goal),
      goal,
      progress: "0%",
      notes: "",
    })).filter((goal) => {
      const key = areaKey(goal);
      if (!key || profileAreaKeys.has(key)) return false;
      profileAreaKeys.add(key);
      return true;
    })
    : [];
  const selectedGoals = (Array.isArray(child.goalAreas) ? child.goalAreas : [])
    .map((rawArea, index) => {
      const area = normalizeObservationArea(rawArea) || rawArea;
      const key = areaKey({ area, goal: rawArea });
      if (!key || profileAreaKeys.has(key)) return null;
      profileAreaKeys.add(key);
      return {
        id: `${child.id}-selected-goal-${index}`,
        source: "selected",
        area,
        goal: `${displayDevelopmentArea(rawArea)} support`,
        progress: "0%",
        notes: "Selected in child profile.",
      };
    })
    .filter(Boolean);
  return [...savedGoals, ...typedGoals, ...selectedGoals];
}

function childPrimaryGoalLabel(child, records = childRecords()) {
  const activeGoals = childActiveGoals(child, records);
  if (!activeGoals.length) return "";
  return activeGoals
    .slice(0, 2)
    .map((goal) => displayDevelopmentArea(normalizeObservationArea(goal.area) || inferAreasFromGoalText(goal.goal)[0] || goal.goal))
    .join(", ");
}

function childrenNeedingMonthlyObservations(records = childRecords()) {
  return records.children.map((child) => ({ child, summary: monthlyObservationSummary(child, records.observations) }));
}

function childInitials(name = "Child") {
  return String(name || "Child").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

function renderChildAvatar(child, size = "normal") {
  const className = size === "small" ? "simple-child-avatar small" : "simple-child-avatar";
  return child.photo
    ? `<img class="${className}" src="${child.photo}" alt="${escapeHtml(child.name)}" />`
    : `<div class="${className}" aria-hidden="true">${escapeHtml(childInitials(child.name))}</div>`;
}

function renderMonthlyProgress(summary) {
  const statusText = summary.remaining > 0 ? `${summary.remaining} still needed` : "Complete";
  return `
    <div class="monthly-progress">
      <div><span>${summary.completed}/${summary.goal} completed</span><strong>${escapeHtml(statusText)}</strong></div>
      <div class="progress-bar"><span style="width:${summary.percent}%"></span></div>
    </div>
  `;
}

function renderChildrenNeedList(records) {
  const summaries = childrenNeedingMonthlyObservations(records);
  const needing = summaries.filter((item) => item.summary.remaining > 0);
  if (!records.children.length) return "";
  return `
    <section class="child-need-banner">
      <div class="need-icon" aria-hidden="true">OB</div>
      <div>
        <strong>${needing.length ? `${needing.length} child${needing.length === 1 ? "" : "ren"} need observations this month` : "All children are complete this month"}</strong>
        <p>${needing.length ? "Make sure to complete them before the end of the month." : "Nice work. Every child has met their monthly observation goal."}</p>
      </div>
      <div class="need-list">
        ${summaries.map(({ child, summary }) => `<span>${escapeHtml(child.name)} - ${summary.remaining > 0 ? `needs ${summary.remaining} more` : "complete"}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderChildProfileCard(child, records) {
  const summary = monthlyObservationSummary(child, records.observations);
  const goalLabel = childPrimaryGoalLabel(child, records);
  const activeGoalCount = childActiveGoals(child, records).length;
  const supportAreas = childSelectedSupportAreas(child);
  const attention = summary.remaining > 0
    ? `${summary.remaining} observation${summary.remaining === 1 ? "" : "s"} needed`
    : supportAreas.length ? supportAreas[0] : activeGoalCount ? "Active goal support" : "On track";
  return `
    <article class="simple-child-card">
      <div class="simple-child-card-head">
        ${renderChildAvatar(child, "small")}
        <div>
          <h3>${escapeHtml(child.name)}</h3>
          <p>${escapeHtml(childAgeLabel(child))} - ${escapeHtml(childRoomAgeLabel(child))}</p>
        </div>
        <span class="attention-tag">${escapeHtml(attention)}</span>
      </div>
      <div class="child-card-section">
        <span>Monthly observations</span>
        ${renderMonthlyProgress(summary)}
      </div>
      <div class="child-card-section">
        <span>Active goals</span>
        ${goalLabel ? `<p><mark>${escapeHtml(goalLabel)}</mark></p>` : `<p>-</p>`}
      </div>
      <div class="child-card-section">
        <span>Support areas</span>
        ${supportAreas.length ? renderChipList(supportAreas.slice(0, 3)) : `<p>-</p>`}
      </div>
      <div class="child-card-actions">
        <button class="ghost-button" data-view-child-profile="${child.id}" type="button">View Profile</button>
        <button class="primary-button" data-quick-add-observation="${child.id}" type="button">Quick Add Observation</button>
      </div>
    </article>
  `;
}

function goalStarterAreas(child = null) {
  if (child && isInfantChild(child)) {
    return [
      ["Fine Motor", "Fine Motor", "Reaching, grasping, transferring, safe texture play"],
      ["Gross Motor", "Gross Motor", "Tummy time, rolling, crawling, supported standing"],
      ["Speech & Language", "Speech & Language", "Babbling, songs, names, board books"],
      ["Cognitive", "Cognitive", "Peekaboo, object permanence, cause and effect"],
      ["Social Emotional", "Social Emotional", "Responsive play, comfort routines, connection"],
      ["Self Help Skills", "Self Help Skills", "Feeding cues, care routines, handwashing songs"],
      ["Literacy", "Literacy", "Board books, songs, gestures, familiar words"],
      ["Early Math", "Early Math", "Size, shape, quantity, nesting, object permanence"],
    ];
  }
  return [
    ["Fine Motor", "Fine Motor", "Cutting, tracing, grasp, hand strength"],
    ["Gross Motor", "Gross Motor", "Balance, jumping, climbing, coordination"],
    ["Speech & Language", "Speech & Language", "Words, sentences, books, communication"],
    ["Cognitive", "Cognitive", "Counting, sorting, matching, problem solving"],
    ["Social Emotional", "Social Emotional", "Sharing, feelings, confidence, peer play"],
    ["Self Help Skills", "Self Help Skills", "Handwashing, dressing, toileting, routines"],
    ["Literacy", "Literacy", "Books, letters, early writing, print awareness"],
    ["Early Math", "Early Math", "Counting, number sense, patterns, sorting"],
  ];
}

function goalExampleForArea(area, child = null) {
  if (child && isInfantChild(child)) {
    const map = {
      "Fine Motor": "Reach for, grasp, transfer, and release baby-safe toys",
      "Language & Literacy": "Respond to songs, sounds, names, and simple board books",
      "Speech & Language": "Respond to songs, sounds, names, and simple board books",
      "Social Emotional": "Build trust through responsive play, peekaboo, and comfort routines",
      "Cognitive Development": "Explore object permanence, cause and effect, and safe textures",
      Cognitive: "Explore object permanence, cause and effect, and safe textures",
      "Gross Motor": "Build strength through tummy time, reaching, rolling, crawling, or supported standing",
      "Physical Development": "Practice safe feeding, movement, rest, and care routines",
      "Self Help Skills": "Participate in feeding, diapering, handwashing, and simple care routines",
      Literacy: "Look at board books and respond to songs, sounds, and familiar words",
      "Early Math": "Explore size, shape, quantity, and object permanence through baby-safe play",
      "Creative Arts": "Explore music, movement, and baby-safe textures",
      "Approaches to Learning": "Explore a safe toy or texture with curiosity and repeated attempts",
    };
    return map[area] || map[normalizeObservationArea(area)] || map["Approaches to Learning"];
  }
  const map = {
    "Fine Motor": "Improve scissor skills during cutting practice",
    "Language & Literacy": "Use longer sentences during play and routines",
    "Speech & Language": "Use longer sentences during play and routines",
    "Social Emotional": "Practice turn-taking and sharing with peers",
    "Cognitive Development": "Match, sort, and count objects during small-group play",
    "Cognitive": "Match, sort, and count objects during small-group play",
    "Gross Motor": "Build balance and coordination through movement games",
    "Physical Development": "Complete one self-help routine with less support",
    "Self Help Skills": "Complete one self-help routine with less support",
    "Literacy": "Engage with books, letters, and early writing during play",
    "Early Math": "Count, sort, and match objects during small-group play",
    "Creative Arts": "Try new art materials and describe creative choices",
    "Approaches to Learning": "Stay with a chosen activity and try again when challenged",
  };
  return map[area] || map["Approaches to Learning"];
}

function renderGoalNeedPicker(records) {
  const child = selectedChild(records);
  if (!records.children.length) {
    return `
      <section class="section-block goal-need-picker">
        <p class="eyebrow">Start Here</p>
        <h3>Pick what the child needs help with</h3>
        <p class="muted-copy">Add a child first, then choose the skill area you want to support.</p>
        <button class="primary-button" data-child-view="add" type="button">Add Child</button>
      </section>
    `;
  }
  return `
    <section class="section-block goal-need-picker">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Start Here</p>
          <h3>Pick what the child needs help with</h3>
          <p class="muted-copy">Choose a child, choose the area, then add one simple goal.</p>
        </div>
      </div>
      <div class="goal-child-picker" aria-label="Choose child for goal">
        ${records.children.map((item) => `
          <button class="${item.id === child?.id ? "active" : ""}" data-goal-picker-child="${item.id}" type="button">
            ${escapeHtml(item.name)}
          </button>
        `).join("")}
      </div>
      <div class="goal-area-picker">
        ${goalStarterAreas(child).map(([area, label, detail]) => `
          <button data-start-goal-area="${escapeHtml(area)}" data-child-id="${escapeHtml(child?.id || "")}" type="button">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(detail)}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function goalAreaFor(goal, child = {}) {
  return normalizeObservationArea(goal?.area || inferAreasFromGoalText(`${goal?.goal || ""} ${child.activeGoals || ""}`)[0]) || goal?.area || "Approaches to Learning";
}

function goalContextAreas(child, goal, records) {
  const childObservations = records.observations.filter((item) => item.childId === child.id).slice(-5);
  const childContext = childRecommendationContext(child, records);
  const primaryGoalArea = goalAreaFor(goal, child);
  const contextText = [
    goal?.area,
    goal?.goal,
    goal?.notes,
    child.activeGoals,
    child.ageGroup,
    childAgeLabel(child),
    child.dob,
    child.notes,
    ...childObservations.map((item) => `${item.area || ""} ${item.text || ""} ${item.nextSteps || ""}`),
  ].join(" ");
  return Array.from(new Set([
    primaryGoalArea,
    ...childContext.areas,
    ...inferAreasFromGoalText(contextText),
  ].filter(Boolean))).slice(0, 4);
}

function goalRecommendations(child, goal, records) {
  const areas = goalContextAreas(child, goal, records);
  const area = areas[0] || goalAreaFor(goal, child);
  const primaryAreas = [area];
  const goalLessonChild = {
    ...child,
    goalAreas: [displayDevelopmentArea(area)],
    activeGoals: goal?.goal || child.activeGoals,
  };
  const activityResources = portfolioResourcesFor("Activity Center", primaryAreas, child.ageGroup, 4);
  const lessonResources = portfolioResourcesFor("Lesson Plans", primaryAreas, child.ageGroup, 4);
  lessonResources.items = childLessonRecommendations(goalLessonChild, records, 4);
  const printableResources = portfolioResourcesFor("Printables", primaryAreas, child.ageGroup, 4);
  const observationResources = portfolioResourcesFor("Observation Hub", primaryAreas, child.ageGroup, 3);
  activityResources.items = prioritizeProfessionalResources(activityResources.items, primaryAreas, child.ageGroup, goal?.goal);
  lessonResources.items = prioritizeProfessionalResources(lessonResources.items, primaryAreas, child.ageGroup, goal?.goal);
  printableResources.items = prioritizeProfessionalResources(printableResources.items, primaryAreas, child.ageGroup, goal?.goal);
  observationResources.items = prioritizeProfessionalResources(observationResources.items, primaryAreas, child.ageGroup, goal?.goal);
  const extraResources = resources
    .filter((resource) => !["Activity Center", "Lesson Plans", "Printables", "Observation Hub"].includes(resource.category))
    .filter((resource) => resourceRecommendationScore(resource, primaryAreas) > 0)
    .filter((resource) => !isInfantChild(child) || !resourceUnsafeForInfant(resource))
    .map((resource) => ({
      resource,
      ageTier: resourceAgeTier(resource, child.ageGroup),
      score: resourceRecommendationScore(resource, primaryAreas),
    }))
    .sort((a, b) => a.ageTier - b.ageTier || b.score - a.score || a.resource.title.localeCompare(b.resource.title))
    .slice(0, 2)
    .map((item) => item.resource);
  const professionalPrintableFallback = printableResources.items.length
    ? null
    : professionalGoalPrintableResource(child, goal, area);
  return {
    areas,
    area,
    activityResources,
    lessonResources,
    printableResources,
    observationResources,
    extraResources: prioritizeProfessionalResources(extraResources, primaryAreas, child.ageGroup, goal?.goal),
    professionalPrintableFallback,
  };
}

function renderGoalDashboardStats(records, goalRows) {
  const activeGoals = goalRows.filter(({ goal }) => goalProgressPercent(goal.progress) < 100);
  const goalsNeedingUpdates = activeGoals.filter(({ child, goal }) => goalNeedsUpdate(child, goal, records));
  const showingProgress = activeGoals.filter(({ goal }) => {
    const progress = goalProgressPercent(goal.progress);
    return progress > 0 && progress < 100;
  });
  const milestones = goalRows.filter(({ goal }) => goalProgressPercent(goal.progress) >= 100);
  const observationsThisWeek = weeklyObservationStats(records).thisWeekObservations.length;
  const stats = [
    ["target", activeGoals.length, "Active Goals"],
    ["edit", goalsNeedingUpdates.length, "Goals Needing Updates"],
    ["trend", showingProgress.length, "Showing Progress"],
    ["chat", observationsThisWeek, "Observations This Week"],
    ["star", milestones.length, "Milestones Celebrated"],
  ];
  return `<div class="goal-dashboard-stats">${stats.map(([icon, value, label]) => `
    <article class="goal-stat-card ${escapeHtml(icon)}">
      <span aria-hidden="true">${goalStatIcon(icon)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <p>${escapeHtml(label)}</p>
    </article>
  `).join("")}</div>`;
}

function todayFocusItems(records = childRecords()) {
  return records.children.map((child) => {
    const summary = monthlyObservationSummary(child, records.observations);
    const activeGoals = childActiveGoals(child, records);
    const supportAreas = childSelectedSupportAreas(child);
    if (summary.remaining > 0) {
      return {
        child,
        label: "Observation Due",
        nextStep: "Add a quick observation during free play.",
        action: "Add Observation",
        actionHtml: `data-quick-add-observation="${child.id}"`,
        priority: 1,
      };
    }
    if (supportAreas.length) {
      const support = supportAreas[0];
      return {
        child,
        label: support,
        nextStep: supportNextStep(support, child.name),
        action: "View Suggestions",
        actionHtml: `data-view-child-profile="${child.id}"`,
        priority: 2,
      };
    }
    if (activeGoals.length) {
      const area = displayDevelopmentArea(activeGoals[0].area);
      return {
        child,
        label: `${area} Goal`,
        nextStep: nextStepForArea(normalizeObservationArea(activeGoals[0].area) || activeGoals[0].area, child),
        action: "View Suggestions",
        actionHtml: `data-view-child-profile="${child.id}" data-open-child-tab="goals"`,
        priority: 3,
      };
    }
    return null;
  }).filter(Boolean).sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function renderTodaysFocus(records) {
  const items = todayFocusItems(records);
  return `
    <section class="todays-focus-section">
      <div class="todays-focus-head">
        <div>
          <h3>Today's Focus</h3>
          <p>Quickly see which children may need attention today.</p>
        </div>
        <button class="ghost-button" data-view="children" type="button">View All</button>
      </div>
      ${items.length ? `<div class="todays-focus-list">${items.map((item) => `
        <article>
          <strong>${escapeHtml(item.child.name)}</strong>
          <span>${escapeHtml(item.label)}</span>
          <p><b>Suggested Next Step:</b> ${escapeHtml(item.nextStep)}</p>
          <button class="link-button" ${item.actionHtml} type="button">${escapeHtml(item.action)}</button>
        </article>
      `).join("")}</div>` : `<p class="muted-copy">You're all caught up today.</p>`}
    </section>
  `;
}

function goalStatIcon(icon) {
  const map = {
    target: "◎",
    edit: "✎",
    trend: "↗",
    chat: "●",
    star: "★",
  };
  return map[icon] || "◎";
}

function goalNeedsUpdate(child, goal, records) {
  const progress = goalProgressPercent(goal.progress);
  if (progress >= 100) return false;
  const connected = connectedObservationsForGoal({ ...goal, childId: child.id }, records);
  if (!connected.length || progress === 0) return true;
  const lastDate = connected.map((item) => item.date).filter(Boolean).sort().slice(-1)[0];
  if (!lastDate) return true;
  const last = new Date(`${lastDate}T12:00:00`);
  if (Number.isNaN(last.getTime())) return true;
  const daysSince = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 7;
}

function domSafeId(value = "") {
  return String(value || "goal").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function renderGoalResourceList(title, resourcesList, fallbackItems = [], options = {}) {
  const items = resourcesList || [];
  const fallback = fallbackItems.filter(Boolean).slice(0, 3);
  const emptyMessage = options.emptyMessage || "No matching resources yet.";
  return `
    <section class="goal-match-panel">
      <h4>${escapeHtml(title)}</h4>
      ${items.length ? `
        <ul>
          ${items.slice(0, 3).map((resource) => `<li>${escapeHtml(resource.title)}</li>`).join("")}
        </ul>
        ${items.length > 3 ? `<button class="link-button" data-view-resource="${items[0].id}" type="button">View Matches</button>` : ""}
      ` : `
        <p class="goal-empty-match">${escapeHtml(emptyMessage)}</p>
        ${fallback.length ? `<ul>${fallback.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        ${options.generatePrintable ? `<button class="link-button" data-generate-goal-printable="${escapeHtml(options.goalId || "")}" data-child-id="${escapeHtml(options.childId || "")}" type="button">Generate Professional Printable</button>` : ""}
      `}
      ${options.note ? `<p class="goal-match-note">${escapeHtml(options.note)}</p>` : ""}
    </section>
  `;
}

function goalLastObservation(child, goal, records) {
  const connected = connectedObservationsForGoal({ ...goal, childId: child.id }, records);
  const observations = connected.length ? connected : records.observations.filter((item) => item.childId === child.id);
  return observations.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0] || null;
}

function goalSupportIdeaContent(child, goal, records) {
  const recommendations = goalRecommendations(child, goal, records);
  const area = recommendations.area;
  const areaLabel = displayDevelopmentArea(area);
  const activities = suggestedActivitiesForArea(area, child).slice(0, 3);
  const lesson = recommendations.lessonResources.items[0]?.title || suggestedLessonPlansForArea(area)[0];
  const observation = `${child.name} practiced ${areaLabel.toLowerCase()} skills during play. Notice the words, gestures, independence, and support that helped the child stay engaged.`;
  const nextStep = nextStepForArea(area, child);
  const parentNote = `${child.name} is working on ${areaLabel.toLowerCase()} through simple play-based practice. We will keep using short, supportive activities and share progress as we observe new growth.`;
  return { area, activities, lesson, observation, nextStep, parentNote };
}

function renderGoalSupportIdeasOutput(child, goal, records) {
  const ideas = goalSupportIdeaContent(child, goal, records);
  return `
    <div class="goal-ai-output-inner">
      <div><strong>3 simple activities</strong><ul>${ideas.activities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div><strong>Lesson plan idea</strong><p>${escapeHtml(ideas.lesson)}</p></div>
      <div><strong>Observation example</strong><p>${escapeHtml(ideas.observation)}</p></div>
      <div><strong>Parent communication note</strong><p>${escapeHtml(ideas.parentNote)}</p></div>
      <div><strong>Next step</strong><p>${escapeHtml(ideas.nextStep)}</p></div>
    </div>
  `;
}

function renderSimpleGoalsProgressPage(records) {
  const goalRows = records.children.flatMap((child) => {
    const goals = childActiveGoals(child, records);
    return goals.map((goal) => ({ child, goal }));
  });
  return `
    <section class="simple-child-page goals-simple-page">
      <div class="goal-dashboard-hero">
        <div>
          <h2>Goals & Progress</h2>
          <p>Track goals, match activities and resources, document observations, and celebrate growth.</p>
        </div>
        <button class="primary-button" data-open-selected-goal-form type="button">+ Add New Goal</button>
      </div>
      ${renderGoalDashboardStats(records, goalRows)}
      ${renderTodaysFocus(records)}
      <section class="goal-what-box">
        <strong>What it does:</strong>
        <span>This helps you set meaningful goals, find matching activities and lesson plans, track progress, and document observations all in one place.</span>
      </section>
      ${renderGoalNeedPicker(records)}
      <div class="simple-goals-list one-column">
        ${goalRows.length ? goalRows.map(({ child, goal }) => renderSimpleGoalCard(child, goal, records)).join("") : `
          <section class="section-block empty-state">
            <h3>No goals yet.</h3>
            <p>Pick what the child needs help with above, then add one goal.</p>
            <button class="primary-button" data-child-view="list" type="button">Children</button>
          </section>
        `}
      </div>
    </section>
  `;
}

function renderSimpleGoalCard(child, goal, records) {
  const normalizedGoal = { ...goal, childId: goal.childId || child.id };
  const recommendations = goalRecommendations(child, normalizedGoal, records);
  const area = recommendations.area;
  const areaLabel = displayDevelopmentArea(area);
  const progress = goal ? goalProgressPercent(goal.progress) : 0;
  const activities = suggestedActivitiesForArea(area, child).slice(0, 3);
  const lessonFallbacks = suggestedLessonPlansForArea(area).slice(0, 3);
  const printResourceMatches = recommendations.printableResources.items.length
    ? [...recommendations.printableResources.items, ...recommendations.extraResources]
    : [];
  const printFallbacks = recommendations.professionalPrintableFallback
    ? [recommendations.professionalPrintableFallback.title, ...printableProfessionalFeatures(printableType(recommendations.professionalPrintableFallback)).slice(0, 2)]
    : suggestedActivitiesForArea(area, child).slice(0, 3).map((item) => `${item} printable`);
  const lastObservation = goalLastObservation(child, normalizedGoal, records);
  const connectedObservations = connectedObservationsForGoal(normalizedGoal, records);
  const childSummary = childProgressSummary(child.id, records);
  const isSavedGoal = Boolean(goal?.id && goal.source !== "typed" && records.goals.some((savedGoal) => savedGoal.id === goal.id));
  const safeId = domSafeId(goal?.id || `${child.id}-${area}`);
  const updatedLabel = goal.updatedAt ? formatDateLabel(goal.updatedAt.slice(0, 10)) : formatDateLabel(lastObservation?.date || "");
  return `
    <article class="goal-dashboard-card">
      <div class="goal-card-top">
        <div class="goal-child-summary">
          ${renderChildAvatar(child, "small")}
          <div>
            <h3>${escapeHtml(child.name)}</h3>
            <p>${escapeHtml(childAgeLabel(child))} | ${escapeHtml(normalizeAgeGroup(child.ageGroup) || child.ageGroup || "Age group not entered")}</p>
            <span class="goal-area-dot">${escapeHtml(areaLabel)}</span>
          </div>
        </div>
        <div class="goal-progress-summary">
          <span>Progress</span>
          <div><div class="mini-progress"><span style="width:${progress}%"></span></div><strong>${progress}%</strong></div>
        </div>
        <div class="goal-updated">
          <span>Last Updated</span>
          <strong>${escapeHtml(updatedLabel || "Not updated yet")}</strong>
        </div>
      </div>

      <div class="goal-card-grid">
        <section class="goal-match-panel goal-main-panel">
          <h4>Goal</h4>
          <p>${escapeHtml(goal?.goal || child.activeGoals || goalExampleForArea(area, child))}</p>
          <button class="link-button" data-view-child-profile="${child.id}" data-open-child-tab="goals" type="button">Edit Goal</button>
        </section>
        ${renderGoalResourceList("Suggested Activities", activities.map((title) => ({ title })), suggestedActivitiesForArea(area, child))}
        ${renderGoalResourceList("Matching Lesson Plans", recommendations.lessonResources.items, lessonFallbacks, { note: recommendations.lessonResources.note })}
        ${renderGoalResourceList("Printables & Resources", printResourceMatches, printFallbacks, {
          note: recommendations.printableResources.note,
          emptyMessage: "No matching professional printable yet - generate a print-ready resource for this goal.",
          generatePrintable: Boolean(recommendations.professionalPrintableFallback),
          childId: child.id,
          goalId: goal?.id || "",
        })}
      </div>

      <div class="goal-observation-strip">
        <div>
          <strong>Last Observation</strong>
          <p>${lastObservation ? escapeHtml(lastObservation.text || "Observation note saved.") : "No observation connected yet."}</p>
        </div>
        <span>${lastObservation ? escapeHtml(formatDateLabel(lastObservation.date)) : "Add one when ready"}</span>
        <button class="primary-button" data-quick-add-observation="${child.id}" data-goal-area="${escapeHtml(area)}" type="button">Add Observation</button>
      </div>

      <div class="goal-portfolio-row">
        <span><b>${connectedObservations.length}</b> connected observations</span>
        <span><b>${childSummary.observationsCompleted}</b> portfolio observations</span>
        <span><b>${childSummary.progressPercent}%</b> portfolio progress</span>
      </div>

      <div class="goal-card-actions">
        <button class="ghost-button" data-generate-goal-support="${escapeHtml(goal?.id || "")}" data-child-id="${escapeHtml(child.id)}" type="button">Generate Support Ideas</button>
        ${isSavedGoal ? `<button class="ghost-button" data-update-goal-progress="${goal.id}" type="button">Update Progress</button>` : `<button class="ghost-button" data-view-child-profile="${child.id}" data-open-child-tab="goals" type="button">Update Progress</button>`}
        <button class="ghost-button" ${isProUser() ? `data-open-portfolio="${child.id}"` : `data-pro-feature="child-portfolios"`} type="button">View Portfolio</button>
      </div>
      <div class="goal-ai-output" id="goalSupportIdeas-${safeId}" aria-live="polite"></div>
    </article>
  `;
}

function renderChildManagement() {
  const app = document.querySelector("#childManagementApp");
  if (!app) return;
  activePortfolioChildId = "";
  const records = childRecords();
  if (!selectedChildId && records.children[0]) selectedChildId = records.children[0].id;
  const child = records.children.find((item) => item.id === selectedChildId) || records.children[0] || null;
  if (child && child.id !== selectedChildId) {
    selectedChildId = child.id;
    localStorage.setItem("llhSelectedChild", selectedChildId);
  }

  if (childManagementMode === "add") {
    app.innerHTML = renderChildProfileFormScreen();
    updateChildAgePreview();
    return;
  }

  if (childManagementMode === "edit") {
    const editingChild = records.children.find((item) => item.id === (activeChildProfileEditId || selectedChildId));
    if (!editingChild) {
      childManagementMode = "list";
      renderChildManagement();
      return;
    }
    app.innerHTML = renderChildProfileFormScreen(editingChild);
    updateChildAgePreview();
    return;
  }

  if (childManagementMode === "observe") {
    app.innerHTML = renderObservationScreen(records);
    return;
  }

  if (childManagementMode === "goals") {
    app.innerHTML = renderSimpleGoalsProgressPage(records);
    return;
  }

  if (childManagementMode === "tools") {
    app.innerHTML = renderChildToolsPage(records);
    return;
  }

  if (childManagementMode === "profile" && child) {
    app.innerHTML = renderSimpleChildProfile(child, records);
    return;
  }

  app.innerHTML = `
    <section class="simple-child-page">
      <div class="child-page-header">
        <div>
          <h2>Child Profiles</h2>
          <p>Add children, track observations, goals, support plans, and lesson plan ideas for each child.</p>
        </div>
        <div class="child-header-actions">
          <button class="ghost-button" data-child-view="observe" type="button">Add Observation</button>
          <button class="primary-button" data-child-view="add" type="button">+ Add Child</button>
        </div>
      </div>
      ${renderChildrenNeedList(records)}
      <div class="simple-child-grid">
        ${records.children.length ? records.children.map((item) => renderChildProfileCard(item, records)).join("") : `
          <section class="section-block empty-state">
            <h3>No child profiles yet.</h3>
            <p>Add your first child profile to track monthly observations, goals, and lesson plan ideas.</p>
            <button class="primary-button" data-child-view="add" type="button">Add Child</button>
          </section>
        `}
      </div>
    </section>
  `;
}

function renderChildProfileFormScreen(child = null) {
  const editing = Boolean(child?.id);
  const selectedGoals = Array.isArray(child?.goalAreas) ? child.goalAreas : childSelectedGoalAreas(child || {});
  const selectedSupports = childSelectedSupportAreas(child || {});
  const monthlyGoal = child?.monthlyObservationGoal || child?.observationsRequiredPerMonth || "4";
  return `
    <section class="simple-child-page">
      <button class="ghost-button back-button" ${editing ? `data-view-child-profile="${child.id}"` : `data-child-view="list"`} type="button">${editing ? `Back to ${escapeHtml(child.name)}` : "Back to Children"}</button>
      <div class="child-page-header compact">
        <div>
          <h2>${editing ? "Edit Child Profile" : "Add Child"}</h2>
          <p>Child details, goals, and support areas power recommendations across the platform.</p>
        </div>
      </div>
      <section class="section-block simple-form-card wide-form-card">
        <form id="childProfileForm" class="mini-form simple-child-form">
          <input name="childId" type="hidden" value="${escapeHtml(child?.id || "")}" />
          <label>Child Name<input name="name" required value="${escapeHtml(child?.name || "")}" placeholder="Enter child's name" /></label>
          <label>Birthday<input id="childDobInput" name="dob" type="date" value="${escapeHtml(child?.dob || "")}" /></label>
          <label>Age<input id="childAgePreview" name="age" value="${escapeHtml(child ? childAgeLabel(child) : "")}" placeholder="Age will calculate automatically" /></label>
          <label>Age Group
            <select name="ageGroup" required>
              <option value="">Select classroom</option>
              ${["Infant", "Toddler", "Preschool", "Mixed Ages", "School Age"].map((age) => `<option ${normalizeAgeGroup(child?.ageGroup) === age ? "selected" : ""}>${age}</option>`).join("")}
            </select>
          </label>
          <label>Classroom / Room<input name="classroom" value="${escapeHtml(child?.classroom || "")}" placeholder="Blue Room, Toddlers, Preschool" /></label>
          <label>Enrollment Date<input name="enrollmentDate" type="date" value="${escapeHtml(child?.enrollmentDate || "")}" /></label>
          <label>Observations Required Per Month
            <select id="monthlyObservationGoalSelect" name="monthlyObservationGoal">
              ${["1", "2", "4"].map((value) => `<option value="${value}" ${String(monthlyGoal) === value ? "selected" : ""}>${value} per month</option>`).join("")}
              <option value="custom" ${!["1", "2", "4"].includes(String(monthlyGoal)) ? "selected" : ""}>Custom number</option>
            </select>
          </label>
          <label class="${["1", "2", "4"].includes(String(monthlyGoal)) ? "hidden-field" : ""}" id="customMonthlyObservationGoalWrap">Custom Number<input name="customMonthlyObservationGoal" type="number" min="1" max="31" value="${!["1", "2", "4"].includes(String(monthlyGoal)) ? escapeHtml(String(monthlyGoal)) : ""}" placeholder="Example: 6" /></label>
          <div class="wide profile-check-section">
            <strong>Developmental Goals</strong>
            <div class="profile-check-grid">${renderDevelopmentGoalChecks(selectedGoals)}</div>
          </div>
          <div class="wide profile-check-section">
            <strong>Support Areas</strong>
            <div class="profile-check-grid support-check-grid">${renderSupportAreaChecks(selectedSupports)}</div>
          </div>
          <label class="wide">Goals / Notes About Current Needs<textarea name="activeGoals" rows="3" placeholder="Example: Improve scissor skills, use 3-4 word sentences">${escapeHtml(child?.activeGoals || "")}</textarea></label>
          <label class="wide">Notes<textarea name="notes" rows="3" placeholder="Helpful routines, family notes, strengths, concerns">${escapeHtml(child?.notes || "")}</textarea></label>
          <button class="primary-button" type="submit">${editing ? "Save Profile Changes" : "Save Child"}</button>
          ${!isProUser() ? `<p class="form-note">Free plan includes up to ${freeChildProfileLimit} child profiles.</p>` : ""}
        </form>
      </section>
    </section>
  `;
}

function renderDevelopmentGoalChecks(selectedGoals = []) {
  const selectedRaw = selectedGoals.map((area) => String(area || "").trim()).filter(Boolean);
  return developmentalGoalOptions().map(([value, label], index) => `
    <label class="area-check">
      <input type="checkbox" name="goalAreas" value="${escapeHtml(value)}" data-goal-label="${escapeHtml(label)}" ${selectedRaw.includes(value) || selectedRaw.includes(normalizeObservationArea(value) || value) ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `).join("");
}

function renderSupportAreaChecks(selectedSupports = []) {
  return supportAreaOptions().map((value) => `
    <label class="area-check">
      <input type="checkbox" name="supportAreas" value="${escapeHtml(value)}" ${selectedSupports.includes(value) ? "checked" : ""} />
      <span>${escapeHtml(value)}</span>
    </label>
  `).join("");
}

function updateChildAgePreview() {
  const dobInput = document.querySelector("#childDobInput");
  const ageInput = document.querySelector("#childAgePreview");
  const ageGroupSelect = document.querySelector('#childProfileForm select[name="ageGroup"]');
  if (dobInput && ageInput) ageInput.value = calculateAgeFromDob(dobInput.value);
  const inferredAgeGroup = ageGroupFromDob(dobInput?.value);
  if (ageGroupSelect && inferredAgeGroup && ageGroupSelect.value !== "Mixed Ages") {
    ageGroupSelect.value = inferredAgeGroup;
  }
}

function renderSimpleChildProfile(child, records) {
  const observations = records.observations.filter((item) => item.childId === child.id);
  const supportPlans = records.supportPlans.filter((item) => item.childId === child.id);
  const goals = records.goals.filter((item) => item.childId === child.id);
  const differentiations = records.differentiations.filter((item) => item.childId === child.id);
  const summary = monthlyObservationSummary(child, records.observations);
  return `
    <section class="simple-child-page">
      <button class="ghost-button back-button" data-child-view="list" type="button">Back to Children</button>
      <section class="section-block simple-profile-hero">
        ${renderChildAvatar(child)}
        <div>
          <p class="eyebrow">Child Profile</p>
          <h2>${escapeHtml(child.name)}</h2>
          <p>${escapeHtml(childAgeLabel(child))} - ${escapeHtml(childRoomAgeLabel(child))}</p>
        </div>
        <div class="profile-hero-actions">
          <button class="ghost-button" data-edit-child-profile="${child.id}" type="button">Edit Child Profile</button>
          <button class="primary-button" data-child-ai-suggestions="${child.id}" type="button">Give Me Ideas</button>
        </div>
      </section>
      <div class="child-ai-output" id="childAiSuggestions-${domSafeId(child.id)}" aria-live="polite"></div>

      <section class="section-block monthly-goal-card">
        <div>
          <strong>Monthly Observation Goal</strong>
          <p>${summary.goal} per month</p>
        </div>
        <div>
          <strong>This Month</strong>
          ${renderMonthlyProgress(summary)}
        </div>
      </section>

      ${renderChildProfileTabs()}
      ${renderChildProfileTabContent(child, records)}
    </section>
  `;
}

function renderChildProfileTabs() {
  const tabs = [
    ["overview", "Overview"],
    ["observations", "Observations"],
    ["goals", "Goals"],
    ["lessons", "Lesson Plans"],
    ["portfolio", "Portfolio"],
    ["attendance", "Attendance"],
    ["meals", "Meals"],
    ["reports", "Daily Reports"],
    ["communication", "Parent Communication"],
  ];
  return `
    <div class="simple-profile-tabs" aria-label="Child profile sections">
      ${tabs.map(([id, label]) => `<button class="${childProfileTab === id ? "active" : ""}" data-child-tab="${id}" type="button">${label}</button>`).join("")}
    </div>
  `;
}

function renderChildProfileTabContent(child, records) {
  const observations = records.observations.filter((item) => item.childId === child.id);
  const supportPlans = records.supportPlans.filter((item) => item.childId === child.id);
  const goals = records.goals.filter((item) => item.childId === child.id);
  const activeGoals = childActiveGoals(child, records);
  const differentiations = records.differentiations.filter((item) => item.childId === child.id);
  const summary = monthlyObservationSummary(child, records.observations);
  if (childProfileTab === "observations") return renderChildObservationsTab(child, observations, summary);
  if (childProfileTab === "goals") return renderChildGoalsTab(child, goals, activeGoals, observations, records);
  if (childProfileTab === "lessons") return renderChildLessonsTab(child, records, observations, goals, differentiations);
  if (childProfileTab === "portfolio") return renderChildPortfolioTab(child, observations, goals, supportPlans, differentiations);
  if (childProfileTab === "attendance") {
    const attendance = records.attendance.filter((item) => item.childId === child.id);
    return renderChildSimpleRecordTab("Attendance", "Attendance information for this child only.", isProUser() ? attendanceForm(child.id) : lockedFeatureCard("Attendance Tracking"), attendance);
  }
  if (childProfileTab === "meals") {
    const meals = records.meals.filter((item) => item.childId === child.id);
    return renderChildSimpleRecordTab("Meals", "Meal tracking for this child only.", isProUser() ? mealTrackingForm(child.id) : lockedFeatureCard("Meal Tracking"), meals);
  }
  if (childProfileTab === "reports") {
    const reports = records.reports.filter((item) => item.childId === child.id);
    return renderChildSimpleRecordTab("Daily Reports", "Parent-ready daily reports for this child only.", isProUser() ? `<button class="primary-button" data-build-daily-report="${child.id}" type="button">Generate Daily Report</button>` : lockedFeatureCard("Daily Reports"), reports);
  }
  if (childProfileTab === "communication") {
    const comms = records.communications.filter((item) => item.childId === child.id);
    return renderChildSimpleRecordTab("Parent Communication", "Parent notes and communication records for this child only.", isProUser() ? communicationForm(child.id) : lockedFeatureCard("Parent Communication Tools"), comms);
  }
  return renderChildOverviewTab(child, summary, records);
}

function renderChildSupportLinks(child, supportAreas = childSelectedSupportAreas(child)) {
  const links = supportAreas
    .map((area) => ({ area, topicId: supportTopicIdForArea(area) }))
    .filter((item) => supportTopicById(item.topicId))
    .slice(0, 4);
  if (!links.length) return "";
  return `
    <div class="child-support-links">
      <strong>Support Center</strong>
      <div>
        ${links.map(({ area, topicId }) => `<button class="ghost-button" data-support-topic="${topicId}" data-support-child-id="${child.id}" type="button">View ${escapeHtml(area)} Support</button>`).join("")}
      </div>
    </div>
  `;
}

function renderChildOverviewTab(child, summary, records = childRecords()) {
  const activeGoals = childActiveGoals(child, records);
  const context = childRecommendationContext(child, records);
  const primaryGoal = activeGoals[0];
  const goalArea = context.areas[0] || normalizeObservationArea(primaryGoal?.area || inferAreasFromGoalText(primaryGoal?.goal || child.activeGoals || "")[0]) || "";
  const nextActivity = suggestedActivitiesForArea(goalArea || "Approaches to Learning", child)[0];
  const selectedGoals = childGoalDisplayLabels(child).length ? childGoalDisplayLabels(child) : ["No goals selected"];
  const selectedSupports = context.supportAreas.length ? context.supportAreas : ["No support areas selected"];
  return `
    <section class="section-block profile-overview-card">
      <h3>Needs Attention</h3>
      <div class="attention-list">
        <div>
          <span>Observations</span>
          <strong>${summary.remaining > 0 ? `${summary.remaining} needed this month` : "Monthly goal complete"}</strong>
        </div>
        <div>
          <span>Active Goals</span>
          <strong>${activeGoals.length ? `${activeGoals.length} active` : "No active goals"}</strong>
        </div>
        <div>
          <span>Next Activity</span>
          <strong>${escapeHtml(primaryGoal ? nextActivity : "Add a goal to suggest an activity")}</strong>
        </div>
      </div>
      <div class="profile-info-list">
        <div><span>Age Group / Classroom</span><strong>${escapeHtml(childRoomAgeLabel(child))}</strong></div>
        <div><span>Date of Birth</span><strong>${escapeHtml(formatDateLabel(child.dob))}</strong></div>
        <div><span>Age</span><strong>${escapeHtml(childAgeLabel(child))}</strong></div>
        <div><span>Monthly Observation Goal</span><strong>${summary.goal} per month</strong></div>
      </div>
      <div class="profile-support-summary">
        <div><strong>Developmental Goals</strong>${renderChipList(selectedGoals)}</div>
        <div><strong>Support Areas</strong>${renderChipList(selectedSupports)}</div>
      </div>
      ${renderChildSupportLinks(child, context.supportAreas)}
      <div class="quick-action-list">
        <button class="ghost-button" data-quick-add-observation="${child.id}" type="button">Add Observation</button>
        <button class="ghost-button" data-child-tab="goals" type="button">Add Goal</button>
      </div>
    </section>
  `;
}

function renderChildObservationsTab(child, observations, summary) {
  const filteredObservations = observations.filter((item) => {
    const matchesSearch = [item.text, item.area, item.nextSteps, item.strengths, ...(item.categories || [])].join(" ").toLowerCase().includes(childObservationSearch.toLowerCase());
    const matchesArea = childObservationAreaFilter === "All" || item.area === childObservationAreaFilter || (item.categories || []).includes(childObservationAreaFilter);
    const matchesDate = !childObservationDateFilter || item.date === childObservationDateFilter;
    return matchesSearch && matchesArea && matchesDate;
  }).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return `
    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Observations</p>
          <h3>Observation History</h3>
          <p class="muted-copy">${summary.completed}/${summary.goal} completed this month. ${summary.remaining > 0 ? `${summary.remaining} still needed before the end of the month.` : "Monthly goal complete."}</p>
        </div>
        <button class="primary-button" data-quick-add-observation="${child.id}" type="button">+ Add Observation</button>
      </div>
      <div class="child-filter-row">
        <input id="childObservationSearch" value="${childObservationSearch}" placeholder="Search observations" />
        <input id="childObservationDate" type="date" value="${childObservationDateFilter}" />
        <select id="childObservationArea"><option>All</option>${areaOptions(childObservationAreaFilter)}</select>
      </div>
      <div class="simple-observation-list">${filteredObservations.length ? filteredObservations.map((item) => renderChildObservationCard(item, child)).join("") : `<div class="empty-state">No observations saved for ${escapeHtml(child.name)} yet.</div>`}</div>
    </section>
  `;
}

function renderChildGoalsTab(child, goals, activeGoals, observations, records) {
  const context = childRecommendationContext(child, records);
  return `
    <section class="section-block" id="childGoalsSection">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Goals & Support Areas</p>
          <h3>What ${escapeHtml(child.name)} needs help with</h3>
        </div>
        <button class="ghost-button" data-edit-child-profile="${child.id}" type="button">Edit Selections</button>
      </div>
      <div class="profile-support-summary compact">
        <div><strong>Developmental Goals</strong>${renderChipList(childGoalDisplayLabels(child).length ? childGoalDisplayLabels(child) : ["No goals selected"])}</div>
        <div><strong>Support Areas</strong>${renderChipList(context.supportAreas.length ? context.supportAreas : ["No support areas selected"])}</div>
      </div>
      ${renderChildSupportLinks(child, context.supportAreas)}
      <div class="simple-goals-list one-column">${activeGoals.length ? activeGoals.map((goal) => renderSimpleGoalCard(child, goal, records)).join("") : `<div class="empty-state">No active goals yet.</div>`}</div>
      <div class="simple-add-record">
        <h4>Add Goal</h4>
        ${isProUser() ? goalForm(child.id) : lockedFeatureCard("Development Goal Tracking")}
      </div>
    </section>
  `;
}

function renderChildLessonsTab(child, records, observations, goals, differentiations) {
  const areas = childSupportAreas(child.id, records);
  const primaryAreas = areas.length ? areas : childRecommendationAreas(child, goals, observations);
  const recommendedLessons = childLessonRecommendations(child, records, 3);
  const lessonPlans = primaryAreas.flatMap(suggestedLessonPlansForArea).slice(0, 5);
  const activities = primaryAreas.flatMap(suggestedActivitiesForArea).slice(0, 5);
  return `
    <section class="section-block">
      <p class="eyebrow">Lesson Plans</p>
      <h3>Suggested for ${escapeHtml(child.name)}</h3>
      <p class="muted-copy">Matched from ${escapeHtml(child.name)}'s age group, goals, support areas, observations, and progress history.</p>
      <div class="child-lesson-mini-grid">
        ${recommendedLessons.length ? recommendedLessons.map(renderChildLessonMiniCard).join("") : `<div class="empty-state">No lesson plan matches yet.</div>`}
      </div>
      <div class="focused-suggestion-list">
        <div>
          <strong>Lesson Plan Ideas</strong>
          ${renderChipList(lessonPlans)}
        </div>
        <div>
          <strong>Activities To Try</strong>
          ${renderChipList(activities)}
        </div>
      </div>
      <div class="resource-list compact">${differentiations.length ? differentiations.map(simpleRecordItem).join("") : `<div class="empty-state">No lesson plan supports saved yet.</div>`}</div>
    </section>
  `;
}

function renderChildLessonMiniCard(resource) {
  const context = resource._childRecommendation || {};
  return `
    <article class="child-lesson-mini-card">
      <span class="tag">Suggested for ${escapeHtml(context.childName || "Child")}</span>
      <h4>${escapeHtml(resource.title)}</h4>
      <div>
        <span><b>Age Group:</b> ${escapeHtml(resource.age || context.ageGroup || "Age Group")}</span>
        <span><b>Goal Match:</b> ${escapeHtml(displayDevelopmentArea(context.goalMatch || resource.developmentalArea || ""))}</span>
        ${context.supportArea ? `<span><b>Support Area:</b> ${escapeHtml(context.supportArea)}</span>` : ""}
      </div>
      <p><b>Why this helps:</b> ${escapeHtml(context.why || "Supports current goals and support needs.")}</p>
      <button class="ghost-button" data-view-resource="${resource.id}" type="button">View Details</button>
    </article>
  `;
}

function renderChildPortfolioTab(child, observations, goals, supportPlans, differentiations) {
  return `
    <section class="section-block">
      <p class="eyebrow">Portfolio</p>
      <h3>Progress record</h3>
      <p class="muted-copy">Portfolio includes past observations, goals, progress notes, and activities or lesson plans used.</p>
      <div class="quick-action-list">
        <button class="ghost-button" ${isProUser() ? `data-open-portfolio="${child.id}"` : `data-pro-feature="child-portfolios"`} type="button">Expand Portfolio</button>
        <button class="ghost-button" ${isProUser() ? `data-export-portfolio="${child.id}"` : `data-pro-feature="child-portfolios"`} type="button">Export Portfolio PDF</button>
      </div>
      <div class="portfolio-mini-list">
        <span>${observations.length} observations</span>
        <span>${goals.length} goals</span>
        <span>${supportPlans.length} support plans</span>
        <span>${differentiations.length} lesson supports</span>
      </div>
    </section>
  `;
}

function renderChildSimpleRecordTab(title, detail, formHtml, records) {
  return `
    <section class="section-block">
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h3>${escapeHtml(title)}</h3>
      <p class="muted-copy">${escapeHtml(detail)}</p>
      ${formHtml}
      <div class="resource-list compact">${records.length ? records.slice(-8).reverse().map(simpleRecordItem).join("") : `<div class="empty-state">No ${escapeHtml(title.toLowerCase())} records yet.</div>`}</div>
    </section>
  `;
}

function childToolTabs() {
  return [
    ["attendance", "Attendance", "Daily check-in, absent/present, drop-off, and pick-up."],
    ["meals", "Meals", "Breakfast, lunch, snack, food notes, and allergy notes."],
    ["reports", "Daily Reports", "Generate parent-ready daily summaries for one child."],
    ["communication", "Parent Communication", "Save parent notes, updates, and communication records."],
  ];
}

function renderChildToolsPage(records) {
  const child = selectedChild(records);
  const activeTool = childToolTabs().find(([id]) => id === childToolsTab) || childToolTabs()[0];
  if (!child) {
    return `
      <section class="simple-child-page">
        <div class="child-page-header">
          <div>
            <h2>${escapeHtml(activeTool[1])}</h2>
            <p>Add a child first, then manage ${escapeHtml(activeTool[1].toLowerCase())} from this side tool.</p>
          </div>
          <button class="primary-button" data-child-view="add" type="button">+ Add Child</button>
        </div>
        <section class="section-block empty-state">
          <h3>Add a child first.</h3>
          <p>Child tools need a child profile so records can save to the right child.</p>
        </section>
      </section>
    `;
  }
  return `
    <section class="simple-child-page child-tools-page">
      <div class="child-page-header">
        <div>
          <h2>${escapeHtml(activeTool[1])}</h2>
          <p>Select a child, then manage only ${escapeHtml(activeTool[1].toLowerCase())}.</p>
        </div>
        <button class="ghost-button" data-view-child-profile="${child.id}" type="button">Back to ${escapeHtml(child.name)}</button>
      </div>
      <div class="child-tools-layout">
        <aside class="section-block child-tools-side">
          <div class="child-tools-selected">
            ${renderChildAvatar(child, "small")}
            <div>
              <strong>${escapeHtml(child.name)}</strong>
              <span>${escapeHtml(childAgeLabel(child))} - ${escapeHtml(childRoomAgeLabel(child))}</span>
            </div>
          </div>
          <label class="child-tools-select">Child
            <select id="childToolsChildSelect">
              ${records.children.map((item) => `<option value="${item.id}" ${item.id === child.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
            </select>
          </label>
          <div class="child-tools-nav" aria-label="Child tools">
            ${childToolTabs().map(([id, label, detail]) => `
              <button class="${childToolsTab === id ? "active" : ""}" data-child-tool-tab="${id}" type="button">
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(detail)}</span>
              </button>
            `).join("")}
          </div>
        </aside>
        <div class="child-tools-content">
          ${renderChildToolsContent(child, records)}
        </div>
      </div>
    </section>
  `;
}

function renderChildToolsContent(child, records) {
  const attendance = records.attendance.filter((item) => item.childId === child.id);
  const meals = records.meals.filter((item) => item.childId === child.id);
  const reports = records.reports.filter((item) => item.childId === child.id);
  const comms = records.communications.filter((item) => item.childId === child.id);
  if (childToolsTab === "meals") {
    return renderChildSimpleRecordTab("Meals", "Track only meal notes for this child.", isProUser() ? mealTrackingForm(child.id) : lockedFeatureCard("Meal Tracking"), meals);
  }
  if (childToolsTab === "reports") {
    return renderChildSimpleRecordTab("Daily Reports", "Create simple parent-ready daily reports for this child.", isProUser() ? `<button class="primary-button" data-build-daily-report="${child.id}" type="button">Generate Daily Report</button>` : lockedFeatureCard("Daily Reports"), reports);
  }
  if (childToolsTab === "communication") {
    return renderChildSimpleRecordTab("Parent Communication", "Keep parent notes and communication records for this child.", isProUser() ? communicationForm(child.id) : lockedFeatureCard("Parent Communication Tools"), comms);
  }
  return renderChildSimpleRecordTab("Attendance", "Track only attendance information for this child.", isProUser() ? attendanceForm(child.id) : lockedFeatureCard("Attendance Tracking"), attendance);
}

function renderChildPlanningConnections(child, records, observations, goals) {
  const activeGoals = goals.filter((goal) => goalProgressPercent(goal.progress) < 100);
  const areas = childSupportAreas(child.id, records);
  const primaryAreas = areas.length ? areas : ["Approaches to Learning"];
  const activities = primaryAreas.flatMap(suggestedActivitiesForArea).slice(0, 8);
  const lessonPlans = primaryAreas.flatMap(suggestedLessonPlansForArea).slice(0, 6);
  const latestObservation = observations.slice(-1)[0];
  const latestAnalysis = latestObservation ? observationAnalysis(latestObservation, child) : observationAnalysis({ text: child.activeGoals || "", area: primaryAreas[0] }, child);
  const averageGoalProgress = activeGoals.length
    ? Math.round(activeGoals.reduce((sum, goal) => sum + goalProgressPercent(goal.progress), 0) / activeGoals.length)
    : goals.length ? 100 : 0;
  const elgItems = primaryAreas.map((area) => ({ area, ...elgConnection(area) })).slice(0, 4);
  return `
    <div class="child-idea-grid">
      <article>
        <strong>What to support next</strong>
        <p>${escapeHtml(latestAnalysis.nextSteps)}</p>
      </article>
      <article>
        <strong>Suggested activities</strong>
        ${renderChipList(activities)}
      </article>
      <article>
        <strong>Lesson plan topics</strong>
        ${renderChipList(lessonPlans)}
      </article>
      <article>
        <strong>ELG connections</strong>
        ${elgItems.map((item) => `<span>${escapeHtml(item.area)}: ${escapeHtml(item.skill)}</span>`).join("")}
      </article>
      <article>
        <strong>At a glance</strong>
        <span>${activeGoals.length} active goals</span>
        <span>${averageGoalProgress}% average goal progress</span>
        <span>Last observation: ${escapeHtml(lastObservationDate(child.id, records.observations))}</span>
      </article>
    </div>
  `;
}

function renderGoalSupportIdeas(child, activeGoals, observations) {
  const areas = childRecommendationAreas(child, activeGoals, observations);
  const primaryArea = areas[0] || "Approaches to Learning";
  return `
    <div class="goal-support-box">
      <strong>Suggested activities based on ${escapeHtml(child.name)}'s goals</strong>
      <p>${escapeHtml(primaryArea)} support ideas are matched to ${escapeHtml(child.ageGroup || "this child's age group")}.</p>
      ${renderChipList(areas.flatMap(suggestedActivitiesForArea).slice(0, 8))}
    </div>
  `;
}

function renderChildAiSuggestions(child, records = childRecords()) {
  const ideas = childSuggestionIdeas(child, records);
  const summary = childProgressSummary(child.id, records);
  const supports = ideas.context.supportAreas.length ? ideas.context.supportAreas.join(", ") : "No support areas selected";
  const goals = childGoalDisplayLabels(child).length ? childGoalDisplayLabels(child).join(", ") : displayDevelopmentArea(ideas.primaryArea);
  return `
    <section class="section-block child-ai-suggestions-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">AI Suggestions</p>
          <h3>Ideas for ${escapeHtml(child.name)}</h3>
          <p class="muted-copy">${escapeHtml(childAgeLabel(child))} | ${escapeHtml(normalizeAgeGroup(child.ageGroup) || child.ageGroup || "Age group not entered")}</p>
        </div>
      </div>
      <div class="child-ai-context">
        <span><b>Goals:</b> ${escapeHtml(goals)}</span>
        <span><b>Support areas:</b> ${escapeHtml(supports)}</span>
        <span><b>Progress:</b> ${summary.progressPercent}% portfolio progress</span>
      </div>
      <div class="goal-ai-output-inner child-ai-grid">
        <div><strong>Activities to try</strong><ul>${ideas.activities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
        <div><strong>Lesson plan idea</strong><p>${escapeHtml(ideas.lesson)}</p></div>
        <div><strong>Observation idea</strong><p>${escapeHtml(ideas.observation)}</p></div>
        <div><strong>Parent communication</strong><p>${escapeHtml(ideas.parentNote)}</p></div>
        <div><strong>Next step</strong><p>${escapeHtml(ideas.nextStep)}</p></div>
      </div>
    </section>
  `;
}

function renderDevelopmentAreaChecks(selectedAreas = []) {
  const selectedLabels = selectedAreas.map(displayDevelopmentArea).filter(Boolean);
  const normalized = selectedAreas.map(normalizeObservationArea).filter(Boolean);
  const shortAreas = [
    ["Fine Motor", "Fine motor"],
    ["Gross Motor", "Gross motor"],
    ["Speech & Language", "Speech & language"],
    ["Social Emotional", "Social emotional"],
    ["Cognitive", "Cognitive"],
    ["Self Help Skills", "Self-help"],
    ["Literacy", "Literacy"],
    ["Early Math", "Early math"],
  ];
  return shortAreas.map(([value, label]) => `
    <label class="area-check">
      <input type="checkbox" name="areas" value="${escapeHtml(value)}" ${selectedLabels.includes(value) || (!selectedLabels.length && normalized.includes(normalizeObservationArea(value) || value)) ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `).join("");
}

function renderObservationScreen(records) {
  const editing = activeChildObservationEditId ? records.observations.find((item) => item.id === activeChildObservationEditId) : null;
  const lockedChildId = activeObservationChildLock || editing?.childId || "";
  const lockedChild = lockedChildId ? records.children.find((item) => item.id === lockedChildId) : null;
  const child = lockedChild || records.children.find((item) => item.id === (editing?.childId || selectedChildId)) || records.children[0] || null;
  const selectedAreas = editing?.categories || [editing?.area || pendingObservationArea || childSupportAreas(child?.id, records)[0] || "Fine Motor"];
  return `
    <section class="simple-child-page observation-entry-page">
      <button class="ghost-button back-button" ${lockedChild ? `data-view-child-profile="${lockedChild.id}"` : `data-child-view="list"`} type="button">${lockedChild ? `Back to ${escapeHtml(lockedChild.name)}` : "Back to Children"}</button>
      <section class="section-block add-observation-panel">
        <div class="section-heading">
          <div>
            <h2>${editing ? "Edit Observation" : "Add Observation"}</h2>
            <p class="muted-copy">Every observation is saved under a child profile.</p>
          </div>
        </div>
        ${records.children.length ? `
          <form id="childObservationForm" class="simple-observation-form">
            <input name="observationId" type="hidden" value="${escapeHtml(editing?.id || "")}" />
            ${lockedChild ? `
              <input name="childId" type="hidden" value="${escapeHtml(lockedChild.id)}" />
              <div class="locked-child-field">
                <span>Selected Child</span>
                <strong>${escapeHtml(lockedChild.name)}</strong>
              </div>
            ` : `
              <label>Selected Child
                <select name="childId" required>
                  <option value="">Choose child</option>
                  ${records.children.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}
                </select>
              </label>
            `}
            <label>Date<input name="date" type="date" value="${escapeHtml(editing?.date || new Date().toISOString().slice(0, 10))}" /></label>
            <div class="wide observation-writing-card">
              <div class="observation-writing-head">
                <div>
                  <strong>Observation Notes</strong>
                  <p>Write what you saw in simple provider language.</p>
                </div>
                <span>${lockedChild ? `Saved to ${escapeHtml(lockedChild.name)}` : "Choose child first"}</span>
              </div>
              <textarea class="observation-note-textarea" name="text" rows="8" maxlength="1000" placeholder="Example: ${escapeHtml(child?.name || "The child")} used both hands to stack blocks, smiled when the tower stayed up, and tried again when it fell.">${escapeHtml(editing?.text || "")}</textarea>
            </div>
            <div class="wide">
              <strong>Developmental Area <small>(select all that apply)</small></strong>
              <div class="area-check-grid">${renderDevelopmentAreaChecks(selectedAreas)}</div>
            </div>
            <label class="wide observation-next-step-field">
              <span>Suggested Next Steps</span>
              <textarea name="nextSteps" rows="3" placeholder="Leave blank and Little Learner Hub will suggest next steps.">${escapeHtml(editing?.nextSteps || "")}</textarea>
            </label>
            <div class="wide observation-help-box">
              <strong>Need help?</strong>
              <p>Choose an area and Little Learner Hub can suggest observation ideas.</p>
              <button class="ghost-button" data-generate-observation-ideas type="button">Generate Observation Ideas</button>
              <div id="observationIdeasOutput" class="observation-ideas-output"></div>
            </div>
            <button class="primary-button wide" type="submit">${editing ? "Save Observation Changes" : "Save Observation"}</button>
          </form>
        ` : `
          <div class="empty-state">
            <h3>Add a child first.</h3>
            <p>Observation records need a child profile so progress can update correctly.</p>
            <button class="primary-button" data-child-view="add" type="button">Add Child</button>
          </div>
        `}
      </section>
    </section>
  `;
}

function renderChildObservationCard(item, child) {
  const analysis = observationAnalysis(item, child);
  const supportMatches = analysis.supportAreaMatches || [];
  return `
    <article class="simple-observation-card">
      <div>
        <strong>${escapeHtml(item.childName || child.name)} | ${escapeHtml(formatDateLabel(item.date))}</strong>
        <span class="tag">${escapeHtml(analysis.developmentArea)}</span>
      </div>
      <p>${escapeHtml(item.text || "Observation note")}</p>
      <p><b>Next step:</b> ${escapeHtml(analysis.nextSteps)}</p>
      ${renderChipList(analysis.categories || [])}
      ${supportMatches.length ? `<div class="observation-support-match"><strong>Support area match</strong>${renderChipList(supportMatches)}</div>` : ""}
      <div class="observation-card-actions">
        <button class="ghost-button" data-edit-child-observation="${item.id}" type="button">Edit</button>
        <button class="ghost-button" data-duplicate-child-observation="${item.id}" type="button">Duplicate</button>
        <button class="ghost-button danger-link" data-delete-child-observation="${item.id}" type="button">Delete</button>
      </div>
    </article>
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
  const selectedArea = pendingGoalArea || normalizeObservationArea(pendingGoalArea) || "";
  const child = childRecords().children.find((item) => item.id === childId);
  const placeholder = goalExampleForArea(selectedArea || "Approaches to Learning", child);
  return `
    <form id="childGoalForm" class="mini-form">
      <input name="childId" type="hidden" value="${childId}" />
      <label>What needs help?<select name="area">${goalAreaOptions(selectedArea)}</select></label>
      <label>Goal<input name="goal" placeholder="${escapeHtml(placeholder)}" /></label>
      <label>Target Date<input name="targetDate" type="date" /></label>
      <label>Progress<select name="progress"><option>0%</option><option>25%</option><option>50%</option><option>75%</option><option>100%</option></select></label>
      <label>Notes<textarea name="notes" rows="2" placeholder="Progress notes"></textarea></label>
      <p class="form-note">Related observations, activities, and lesson plan topics will connect automatically by developmental area.</p>
      <button class="primary-button" type="submit">Add Goal</button>
    </form>
  `;
}

function goalAreaOptions(selected = "") {
  const options = developmentalGoalOptions();
  const hasExact = options.some(([optionValue]) => optionValue === selected);
  let matchedNormalized = false;
  return options.map(([value, label]) => {
    const normalizedMatch = !hasExact && !matchedNormalized && normalizeObservationArea(value) && normalizeObservationArea(value) === normalizeObservationArea(selected);
    if (normalizedMatch) matchedNormalized = true;
    const selectedMatch = value === selected || normalizedMatch;
    return `<option value="${escapeHtml(value)}" ${selectedMatch ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
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
  const analysis = observationAnalysis(item, { name: childName(item.childId) });
  const categories = item.categories || analysis.categories;
  const supportMatches = analysis.supportAreaMatches || [];
  return `
    <div class="compact-item">
      <div>
        <strong>${escapeHtml(analysis.developmentArea)} | ${escapeHtml(item.date || "")}</strong>
        ${renderChipList(categories)}
        ${supportMatches.length ? `<span><b>Support Areas:</b> ${escapeHtml(supportMatches.join(", "))}</span>` : ""}
        <span>${escapeHtml(item.text)}</span>
        <span><b>Strength:</b> ${escapeHtml(analysis.strengths)}</span>
        <span><b>Next Step:</b> ${escapeHtml(analysis.nextSteps)}</span>
        <span><b>Suggested Activities:</b> ${escapeHtml((analysis.suggestedActivities || []).join(", "))}</span>
        <span><b>Suggested Lesson Plans:</b> ${escapeHtml((analysis.suggestedLessonPlans || []).join(", "))}</span>
        <span><b>ELG:</b> ${escapeHtml(analysis.elgDomain)} | ${escapeHtml(analysis.elgSkill)}</span>
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

function goalItem(item, child = {}) {
  const progress = goalProgressPercent(item.progress);
  const area = normalizeObservationArea(item.area) || item.area || "Approaches to Learning";
  const connectedObservations = connectedObservationsForGoal(item);
  const activities = suggestedActivitiesForArea(area, child).slice(0, 4);
  const lessonPlans = suggestedLessonPlansForArea(area).slice(0, 3);
  return `
    <div class="compact-item">
      <div>
        <strong>${escapeHtml(area)} | ${progress}% progress</strong>
        <div class="mini-progress"><span style="width:${progress}%"></span></div>
        <span>${escapeHtml(item.goal)}${item.targetDate ? ` | Target: ${escapeHtml(item.targetDate)}` : ""}</span>
        <span><b>Connected Observations:</b> ${connectedObservations.length}</span>
        <span><b>Suggested Activities:</b> ${escapeHtml(activities.join(", "))}</span>
        <span><b>Lesson Plan Topics:</b> ${escapeHtml(lessonPlans.join(", "))}</span>
        ${item.notes ? `<span><b>Progress Notes:</b> ${escapeHtml(item.notes)}</span>` : ""}
      </div>
      ${progress < 100 ? `<button class="ghost-button" data-complete-goal="${item.id}" type="button">Mark 100%</button>` : `<span class="tag">Complete</span>`}
    </div>
  `;
}

function appendChildRecord(key, record) {
  const items = childStore(key);
  saveChildStore(key, [...items, { id: `${key}-${Date.now()}`, createdAt: new Date().toISOString(), ...record }]);
  if (activePortfolioChildId) {
    renderChildPortfolioPage(activePortfolioChildId);
  } else {
    renderChildManagement();
  }
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
  appendChildRecord("Reports", { childId, title: `Daily Report | ${today}`, date: today, summary: report });
}

function exportChildPortfolio(childId) {
  const records = childRecords();
  const child = records.children.find((item) => item.id === childId);
  if (!child) return;
  const childObservations = records.observations.filter((item) => item.childId === childId);
  const childGoals = records.goals.filter((item) => item.childId === childId);
  const activeGoals = childGoals.filter((item) => goalProgressPercent(item.progress) < 100);
  const childSupportPlans = records.supportPlans.filter((item) => item.childId === childId);
  const childDifferentiations = records.differentiations.filter((item) => item.childId === childId);
  const childAttendance = records.attendance.filter((item) => item.childId === childId);
  const childMeals = records.meals.filter((item) => item.childId === childId);
  const childReports = records.reports.filter((item) => item.childId === childId);
  const childCommunications = records.communications.filter((item) => item.childId === childId);
  const addSection = (lines, title, items) => {
    const filledItems = items.filter((item) => presentPortfolioValue(item));
    if (!filledItems.length) return;
    if (lines[lines.length - 1] !== "") lines.push("");
    lines.push(title, ...filledItems);
  };
  const profileLines = childPortfolioTextDetails(child, activeGoals);
  const lines = [
    `Child Portfolio: ${child.name}`,
    ...(profileLines.length ? ["", ...profileLines] : []),
  ];
  const summaryParts = [
    childObservations.length ? `${childObservations.length} saved observation${childObservations.length === 1 ? "" : "s"}` : "",
    activeGoals.length ? `${activeGoals.length} active goal${activeGoals.length === 1 ? "" : "s"}` : "",
    childDifferentiations.length ? `${childDifferentiations.length} connected activity support${childDifferentiations.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  addSection(lines, "Development Summary", summaryParts.length
    ? [`${child.name} has ${summaryParts.join(", ")}. Use this portfolio as a printable progress record for planning, family conferences, and documentation review.`]
    : []);
  addSection(lines, "Observations", childObservations.map((item) => {
      const analysis = observationAnalysis(item, child);
      return `- ${item.date} | ${analysis.developmentArea}: ${item.text}
  Categories: ${(analysis.categories || []).join(", ")}
  Strengths: ${analysis.strengths}
  Next Steps: ${analysis.nextSteps}
  Suggested Activities: ${(analysis.suggestedActivities || []).join(", ")}
  Suggested Lesson Plans: ${(analysis.suggestedLessonPlans || []).join(", ")}
  ELG Domain: ${analysis.elgDomain}
  ELG Skill Area: ${analysis.elgSkill}`;
    }));
  addSection(lines, "Goals", childGoals.map((item) => {
      const area = normalizeObservationArea(item.area) || item.area;
      return `- ${area}: ${item.goal} | Progress: ${goalProgressPercent(item.progress)}% | Target: ${item.targetDate || ""}
  Connected Observations: ${connectedObservationsForGoal(item, records).length}
  Suggested Activities: ${suggestedActivitiesForArea(area, child).join(", ")}
  Suggested Lesson Plans: ${suggestedLessonPlansForArea(area).join(", ")}
  Progress Notes: ${item.notes || ""}`;
    }));
  addSection(lines, "Support Plans", childSupportPlans.map((item) => portfolioBullet([item.area, item.goal, item.activity, item.status])));
  addSection(lines, "Activities Completed / Lesson Plan Connections", childDifferentiations.map((item) => portfolioBullet([
    portfolioTextLine("Whole Group", item.wholeGroup),
    portfolioTextLine("Individual Support", item.support),
  ], ". ")));
  addSection(lines, "Attendance", childAttendance.map((item) => portfolioBullet([
    item.date,
    item.status,
    item.dropoff ? `drop-off ${item.dropoff}` : "",
    item.pickup ? `pick-up ${item.pickup}` : "",
  ], ", ")));
  addSection(lines, "Meals", childMeals.map((item) => portfolioBullet([
    item.date,
    item.breakfast ? `Breakfast ${item.breakfast}` : "",
    item.lunch ? `Lunch ${item.lunch}` : "",
    item.snack ? `Snack ${item.snack}` : "",
    item.notes ? `Notes ${item.notes}` : "",
  ], "; ")));
  addSection(lines, "Daily Reports", childReports.map((item) => portfolioBullet([item.title, item.summary], ": ")));
  addSection(lines, "Parent Communication", childCommunications.map((item) => portfolioBullet([
    item.date,
    item.type,
    item.message,
  ])));
  printTextDocument(`${child.name} Portfolio`, lines.join("\n"));
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
    format: "In-App Preview",
    description: result.text.slice(0, 180),
    customContent: result.text,
  };
  saveUploadedResources([resource, ...uploadedResources()]);
  resources = loadResources();
  renderAdminDashboard();
  return resource;
}

function printTextDocument(title, text) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { margin: 0.55in; }
          body { font-family: Arial, sans-serif; line-height: 1.5; padding: 32px; color: #2f2a25; }
          .brand { color: #386062; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
          h1 { color: #386062; margin: 6px 0 18px; font-size: 28px; }
          pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="brand">Little Learner Hub</div>
        <h1>${escapeHtml(title)}</h1>
        <pre>${escapeHtml(text)}</pre>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function printGeneratedResult(result) {
  printTextDocument(result.title, result.text);
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
          <span>${item.date} · ${item.text.slice(0, 92)}${item.text.length > 92 ? "..." : ""}</span>
        </div>
        <button class="ghost-button" data-load-output="${item.id}" type="button">Open</button>
      </div>
    `).join("")
    : `<div class="empty-state">Generated AI results you save will show up here for quick reuse.</div>`;
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
          <p>${escapeHtml(ticket.name)} · ${escapeHtml(ticket.email || "No email")}</p>
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
  if (currentUser) {
    const account = currentAccount();
    const resolved = accountHasPaidBilling(account) ? normalizeBillingPlan(account?.plan || currentPlan, account) : "Free";
    console.debug(`[access] effectiveAccessPlan email=${currentUser} plan=${account?.plan || "none"} status="${account?.subscriptionStatus || "none"}" resolved=${resolved}`);
    return resolved;
  }
  return "Free";
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
  updateAdminNavVisibility();
  return session;
}

function clearAdminSession() {
  localStorage.removeItem("llhAdminSession");
  localStorage.removeItem("llhAdminUnlocked");
  localStorage.removeItem("llhAdminPreviewMode");
  updateAdminNavVisibility();
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

function displayUserName(user) {
  return user?.name || user?.displayName || user?.email?.split("@")[0] || "Unknown";
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
    ${renderAccessDebugPanel()}
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
            <span><strong>${escapeHtml(displayUserName(account))}</strong> &mdash; ${escapeHtml(account.email)}</span>
            <strong>${escapeHtml(account.plan || "Free")}</strong>
            <small>${escapeHtml(account.subscriptionStatus || "Free Plan")} · ${escapeHtml(account.monthlyPrice || "$0")}</small>
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

// Returns an HTML string showing the current access-control decisions for debugging.
// Only rendered inside the admin-unlocked owner panel.
function debugValueColor(value) {
  if (value === "true") return "var(--success,#2e7d32)";
  if (value === "false") return "var(--danger,#c0392b)";
  return "var(--ink)";
}

function renderAccessDebugPanel() {
  const account = currentAccount();
  const debugRows = [
    ["isLoggedIn()", String(isLoggedIn())],
    ["currentUser", currentUser || "(none)"],
    ["currentPlan (localStorage)", currentPlan],
    ["effectiveAccessPlan()", effectiveAccessPlan()],
    ["isProUser()", String(isProUser())],
    ["hasAdminFullAccess()", String(hasAdminFullAccess())],
    ["isAdminUnlocked()", String(isAdminUnlocked())],
    ["adminPreviewMode()", adminPreviewMode() || "(none)"],
    ["account?.plan", account?.plan || "(none)"],
    ["account?.subscriptionStatus", account?.subscriptionStatus || "(none)"],
    ["accountHasPaidBilling()", String(accountHasPaidBilling())],
    ["aiUsageCount()", String(aiUsageCount())],
    ["aiMonthlyLimit()", String(aiMonthlyLimit())],
  ];
  return `
    <details class="admin-debug-panel" style="margin-bottom:14px;">
      <summary style="cursor:pointer;font-weight:600;padding:8px 0;">🔍 Access Control Debug</summary>
      <div class="admin-note" style="margin-top:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="text-align:left;border-bottom:1px solid var(--line)"><th style="padding:4px 8px">Check</th><th style="padding:4px 8px">Value</th></tr></thead>
          <tbody>
            ${debugRows.map(([label, value]) => `
              <tr style="border-bottom:1px solid var(--line)">
                <td style="padding:4px 8px;font-family:monospace;color:var(--muted)">${escapeHtml(label)}</td>
                <td style="padding:4px 8px;font-weight:600;color:${debugValueColor(value)}">${escapeHtml(value)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
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

function dateKey(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toISOString().slice(0, 10);
}

function monthKey(value) {
  const key = dateKey(value);
  return key === "Unknown" ? key : key.slice(0, 7);
}

function weekKey(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Unknown";
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayNumber = Math.floor((date - first) / 86400000) + 1;
  const week = Math.ceil((dayNumber + first.getUTCDay()) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
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

function topEntries(counts, limit = 8) {
  return Object.entries(counts || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function percentage(part, whole) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

function moneyValue(value) {
  const amount = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function groupMoney(events, keyGetter) {
  return events.reduce((totals, event) => {
    const key = keyGetter(event);
    totals[key] = (totals[key] || 0) + moneyValue(event.detail?.monthlyPrice || event.detail?.amount || event.amount);
    return totals;
  }, {});
}

function lineChartHtml(points = [], emptyText = "No trend data yet.") {
  const entries = Array.isArray(points) ? points : Object.entries(points).map(([label, value]) => ({ label, value }));
  const trimmed = entries.slice(-14);
  if (!trimmed.length) return `<div class="empty-state">${emptyText}</div>`;
  const max = Math.max(...trimmed.map((point) => Number(point.value || 0)), 1);
  return `
    <div class="analytics-chart">
      ${trimmed.map((point) => {
        const height = Math.max(8, Math.round((Number(point.value || 0) / max) * 100));
        return `
          <div class="analytics-bar" title="${escapeHtml(point.label)}: ${escapeHtml(point.value)}">
            <span style="height:${height}%"></span>
            <small>${escapeHtml(String(point.label).replace(/^2026-/, ""))}</small>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function mapCountsToPoints(counts = {}) {
  return Object.entries(counts)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([label, value]) => ({ label, value }));
}

function localAnalyticsSummary() {
  const events = analyticsEvents();
  const accountRows = allAccountsList();
  const leadRows = leads();
  const pageViews = events.filter((event) => event.name === "page_view");
  const visits = events.filter((event) => event.name === "website_visit" || event.name === "page_view");
  const signups = events.filter((event) => event.name === "account_signup_complete");
  const paidEvents = events.filter((event) => event.name === "checkout_success");
  const paidUsers = accountRows.filter((account) => ["Pro", "Founding"].includes(account.plan));
  const visitorIds = new Set(visits.map((event) => event.visitorId || event.user || event.sessionId).filter(Boolean));
  const visitorDays = {};
  visits.forEach((event) => {
    const id = event.visitorId || event.user || event.sessionId || "unknown";
    visitorDays[id] = visitorDays[id] || new Set();
    visitorDays[id].add(dateKey(event.createdAt));
  });
  const returningVisitors = Object.values(visitorDays).filter((days) => days.size > 1).length;
  const revenueEvents = paidEvents;
  const featureEvents = events.filter((event) => ["button_click", "ai_generation_success", "resource_view", "resource_print", "generated_pdf", "generated_print", "provider_tool_pdf", "checkout_start", "checkout_success"].includes(event.name));
  return {
    mode: "Local browser history",
    updatedAt: new Date().toISOString(),
    totals: {
      visitors: visits.length,
      uniqueVisitors: visitorIds.size,
      signups: Math.max(signups.length, accountRows.length),
      totalRegisteredUsers: accountRows.length,
      freeUsers: accountRows.filter((account) => !["Pro", "Founding"].includes(account.plan)).length,
      proUsers: accountRows.filter((account) => account.plan === "Pro").length,
      foundingMembers: accountRows.filter((account) => account.plan === "Founding" || account.foundingMember).length,
      paidUsers: paidUsers.length,
      activeSubscriptions: paidUsers.filter((account) => !String(account.subscriptionStatus || "").toLowerCase().includes("cancel")).length,
      canceledSubscriptions: accountRows.filter((account) => String(account.subscriptionStatus || "").toLowerCase().includes("cancel")).length,
      returningVisitors,
      visitorToSignupRate: percentage(Math.max(signups.length, accountRows.length), Math.max(visitorIds.size, visits.length)),
      signupToPaidRate: percentage(paidUsers.length, Math.max(signups.length, accountRows.length)),
      visitorToPaidRate: percentage(paidUsers.length, Math.max(visitorIds.size, visits.length)),
      totalRevenue: revenueEvents.reduce((total, event) => total + moneyValue(event.detail?.monthlyPrice || event.detail?.amount), 0),
    },
    periods: {
      dailyVisitors: groupCounts(visits, (event) => dateKey(event.createdAt)),
      weeklyVisitors: groupCounts(visits, (event) => weekKey(event.createdAt)),
      monthlyVisitors: groupCounts(visits, (event) => monthKey(event.createdAt)),
      dailyRevenue: groupMoney(revenueEvents, (event) => dateKey(event.createdAt)),
      weeklyRevenue: groupMoney(revenueEvents, (event) => weekKey(event.createdAt)),
      monthlyRevenue: groupMoney(revenueEvents, (event) => monthKey(event.createdAt)),
      yearlyRevenue: groupMoney(revenueEvents, (event) => String(new Date(event.createdAt).getFullYear())),
    },
    counts: {
      pageViews: groupCounts(pageViews, (event) => event.detail?.view || event.path || event.hash || "Home"),
      sources: groupCounts(visits, (event) => event.source || event.attribution?.source || "Direct"),
      buttonClicks: groupCounts(events.filter((event) => event.name === "button_click"), (event) => event.detail?.label || event.detail?.action || "Button"),
      aiUsage: groupCounts(events.filter((event) => event.name === "ai_generation_success"), (event) => event.detail?.tool || "AI Generator"),
      resourceViews: groupCounts(events.filter((event) => event.name === "resource_view"), (event) => event.detail?.category || "Resource"),
      resourcePrints: groupCounts(events.filter((event) => ["resource_print", "generated_pdf", "generated_print", "provider_tool_pdf"].includes(event.name)), (event) => event.detail?.category || event.detail?.tool || "Printable/PDF"),
      featureUsage: groupCounts(featureEvents, (event) => event.name),
    },
    users: accountRows.map((account) => {
      const userEvents = events.filter((event) => event.user === account.email);
      const lastEvent = userEvents.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return {
        email: account.email,
        plan: account.plan || "Free",
        subscriptionStatus: account.subscriptionStatus || "Free Plan",
        signupAt: account.createdAt || "",
        lastLoginAt: account.lastLoginAt || "",
        lastSeenAt: lastEvent?.createdAt || account.updatedAt || "",
        featureUseCount: userEvents.length,
        topFeatures: topEntries(groupCounts(userEvents, (event) => event.name), 3),
      };
    }),
    recentEvents: events.slice(0, 12),
    leads: leadRows,
  };
}

async function loadAdminAnalyticsFromBackend() {
  const token = adminSession()?.token;
  if (!analyticsConfig.adminEndpoint || !canUseLaunchBackend() || !token || adminAnalyticsLoading) return;
  adminAnalyticsLoading = true;
  try {
    const response = await fetch(`${analyticsConfig.adminEndpoint}?adminToken=${encodeURIComponent(token)}&t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Could not load admin analytics.");
    adminAnalyticsCache = data.analytics || data;
    renderAdminAnalytics();
    renderAdminOwnerOverview();
  } catch (error) {
    console.warn("Admin analytics backend load failed", error);
  } finally {
    adminAnalyticsLoading = false;
  }
}

function analyticsRowsHtml(rows = [], emptyText = "No data yet.") {
  if (!rows.length) return `<div class="empty-state">${emptyText}</div>`;
  return rows.map(([label, value]) => `
    <div class="analytics-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function userAnalyticsTable(users = []) {
  if (!users.length) return `<div class="empty-state">Users will appear here after signups or subscription syncs.</div>`;
  return `
    <div class="admin-table-wrap analytics-user-table-wrap">
      <table class="admin-table analytics-user-table">
        <thead>
          <tr>
            <th>Name / Email</th>
            <th>Plan</th>
            <th>Last Login</th>
            <th>Last Seen</th>
            <th>Feature Use</th>
          </tr>
        </thead>
        <tbody>
          ${users.slice(0, 25).map((user) => `
            <tr>
              <td><strong>${escapeHtml(displayUserName(user))}</strong><br><small>${escapeHtml(user.email || "")}</small><br><small>Signup: ${escapeHtml(user.signupAt ? new Date(user.signupAt).toLocaleDateString() : "unknown")}</small></td>
              <td>${escapeHtml(user.plan || "Free")}<br><small>${escapeHtml(user.subscriptionStatus || "")}</small></td>
              <td>${escapeHtml(user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Not tracked yet")}</td>
              <td>${escapeHtml(user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : "Not tracked yet")}</td>
              <td>${escapeHtml(user.featureUseCount || 0)}<br><small>${(user.topFeatures || []).map(([label, count]) => `${escapeHtml(label)} (${count})`).join(", ")}</small></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminAnalytics() {
  const target = document.querySelector("#adminAnalyticsApp");
  if (!target || !isAdminUnlocked()) return;
  const summary = adminAnalyticsCache || localAnalyticsSummary();
  const totals = summary.totals || {};
  const periods = summary.periods || {};
  const counts = summary.counts || {};
  target.innerHTML = `
    <div class="admin-analytics-status">
      <span>${escapeHtml(summary.mode || "Analytics")}</span>
      <small>Historical events are retained. Existing visits from before this update cannot be backfilled.</small>
      <button class="ghost-button" type="button" data-refresh-analytics>Refresh Analytics</button>
    </div>
    <div class="analytics-summary-grid">
      ${adminMetric("total visitors", totals.visitors || 0)}
      ${adminMetric("unique visitors", totals.uniqueVisitors || 0)}
      ${adminMetric("registered users", totals.totalRegisteredUsers || 0)}
      ${adminMetric("free users", totals.freeUsers || 0)}
      ${adminMetric("pro users", totals.proUsers || 0)}
      ${adminMetric("founding members", totals.foundingMembers || 0)}
      ${adminMetric("active subscriptions", totals.activeSubscriptions || 0)}
      ${adminMetric("canceled subscriptions", totals.canceledSubscriptions || 0)}
      ${adminMetric("visitor to signup", totals.visitorToSignupRate || "0%")}
      ${adminMetric("signup to paid", totals.signupToPaidRate || "0%")}
      ${adminMetric("visitor to paid", totals.visitorToPaidRate || "0%")}
      ${adminMetric("tracked revenue", `$${Number(totals.totalRevenue || 0).toFixed(2)}`)}
      ${adminMetric("returning visitors", totals.returningVisitors || 0)}
    </div>
    <div class="analytics-grid">
      <article class="analytics-card">
        <h4>Daily Visitors</h4>
        ${lineChartHtml(mapCountsToPoints(periods.dailyVisitors), "No daily visitor history yet.")}
      </article>
      <article class="analytics-card">
        <h4>Monthly Visitors</h4>
        ${lineChartHtml(mapCountsToPoints(periods.monthlyVisitors), "No monthly visitor history yet.")}
      </article>
      <article class="analytics-card">
        <h4>Revenue by Month</h4>
        ${lineChartHtml(mapCountsToPoints(periods.monthlyRevenue), "Revenue appears after successful checkout events.")}
      </article>
      <article class="analytics-card">
        <h4>Revenue by Year</h4>
        ${analyticsRowsHtml(topEntries(periods.yearlyRevenue, 8), "No yearly revenue tracked yet.")}
      </article>
      <article class="analytics-card">
        <h4>Most Visited Pages</h4>
        ${countListHtml(counts.pageViews, "No page views tracked yet.")}
      </article>
      <article class="analytics-card">
        <h4>Traffic Sources</h4>
        ${countListHtml(counts.sources, "Traffic sources will appear after visits.")}
      </article>
      <article class="analytics-card">
        <h4>Button Clicks</h4>
        ${countListHtml(counts.buttonClicks, "Button clicks will appear here.")}
      </article>
      <article class="analytics-card">
        <h4>AI Generator Usage</h4>
        ${countListHtml(counts.aiUsage, "AI usage will appear after generations.")}
      </article>
      <article class="analytics-card">
        <h4>Resource Views</h4>
        ${countListHtml(counts.resourceViews, "Resource views will appear here.")}
      </article>
      <article class="analytics-card">
        <h4>Print / PDF Actions</h4>
        ${countListHtml(counts.resourcePrints, "Print or PDF actions will appear here.")}
      </article>
      <article class="analytics-card">
        <h4>Feature Usage</h4>
        ${countListHtml(counts.featureUsage, "Feature usage will appear here.")}
      </article>
      <article class="analytics-card">
        <h4>Recent Events</h4>
        ${(summary.recentEvents || []).length ? summary.recentEvents.slice(0, 10).map((event) => `
          <div class="analytics-row stacked">
            <span>${escapeHtml(event.name)}</span>
            <strong>${escapeHtml(event.user || event.detail?.label || event.detail?.view || event.source || "visitor")}</strong>
            <small>${escapeHtml(event.createdAt ? new Date(event.createdAt).toLocaleString() : "")}</small>
          </div>
        `).join("") : `<div class="empty-state">Recent events will appear here.</div>`}
      </article>
    </div>
    <article class="analytics-card analytics-user-card">
      <h4>User-Level Tracking</h4>
      ${userAnalyticsTable(summary.users || [])}
    </article>
    <p class="muted-copy">Server analytics are stored historically in the launch store and are only visible with Admin access. If the backend is unavailable, this dashboard shows local browser history until the server responds.</p>
  `;
  if (!adminAnalyticsCache && !adminAnalyticsLoading) loadAdminAnalyticsFromBackend();
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
    format: "In-App Preview",
    customContent: "Demo Toddler Farm Lesson Plan\n\nThis is a sample in-app resource from the admin dashboard. It opens in Little Learner Hub and can be printed or saved as a PDF from the preview screen.",
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
    incident: generateIncidentReport,
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

function ageGroupLabel(ageGroup) {
  const labels = {
    "Infant": "0-12 months",
    "Young Toddler": "12-24 months",
    "Older Toddler": "24-36 months",
    "Toddler": "12-36 months",
    "Preschool": "3-5 years",
    "School Age": "5+ years",
  };
  return labels[ageGroup] || ageGroup;
}

function aiPromptFromForm(toolId, data) {
  const tool = [...aiTools, ...futureTools].find((item) => item.id === toolId);
  const toolTitle = tool?.title || "Little Learner Hub AI Generator";

  const childName = data.childName || data.child || "";
  const childAge = data.childAge || "";
  const ageGroup = data.age || data.ageGroup || data.group || "";
  const programName = data.programName || data.program || "";
  const providerNotes = data.providerNotes || "";

  const ageContext = ageGroup
    ? `\n\nCHILD AGE GROUP: ${ageGroup} (${ageGroupLabel(ageGroup)}). ALL content — activities, goals, language, milestones, strategies — MUST be appropriate for this age. Do not include anything outside this developmental range.`
    : "";

  const contextLines = [
    programName ? `Program Name: ${programName}` : "",
    childName ? `Child: ${childName}` : "",
    childAge ? `Child Age: ${childAge}` : "",
    ageGroup ? `Age Group: ${ageGroup} (${ageGroupLabel(ageGroup)})` : "",
  ].filter(Boolean).join("\n");

  const fieldLines = Object.entries(data)
    .filter(([key, value]) => value && !["childName", "child", "childAge", "age", "ageGroup", "group", "programName", "program", "providerNotes"].includes(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const providerContext = providerNotes ? `\n\nProvider Notes: ${providerNotes}` : "";

  return [
    `Generate: ${toolTitle}`,
    contextLines,
    ageContext,
    "\nDetails:\n" + (fieldLines || "No extra details were entered."),
    providerContext,
    "\nProduce organized, ready-to-use content a childcare provider can copy right away. Use warm, professional childcare language. Reference the child by name and include the program name in all formal documents.",
  ].filter(Boolean).join("\n");
}

async function generateToolOutputWithBackend(toolId, data) {
  if (!aiGenerationConfig.endpoint || !canUseLaunchBackend()) {
    return { output: generateToolOutput(toolId, data), backendUsed: false };
  }
  const ageValue = data.age || data.ageGroup || data.group || "";
  const response = await fetch(aiGenerationConfig.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: currentUser || "guest",
      plan: currentPlan,
      tool: toolId,
      age: ageValue,
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

function detectAgeFromPrompt(lower) {
  if (lower.includes("infant") || lower.includes("baby") || lower.includes("newborn")) return "Infant";
  if (lower.includes("young toddler") || lower.includes("12 month") || lower.includes("1 year")) return "Young Toddler";
  if (lower.includes("older toddler") || lower.includes("2 year") || lower.includes("24 month")) return "Older Toddler";
  if (lower.includes("preschool") || lower.includes("3 year") || lower.includes("4 year") || lower.includes("pre-k")) return "Preschool";
  if (lower.includes("school age") || lower.includes("school-age") || lower.includes("5 year") || lower.includes("kindergarten") || lower.includes("first grade")) return "School Age";
  if (lower.includes("toddler")) return "Toddler";
  return "Preschool";
}

function generateFromPrompt(prompt) {
  const lower = prompt.toLowerCase();
  const age = detectAgeFromPrompt(lower);
  if (lower.includes("observation") || lower.includes("stacking") || lower.includes("blocks")) {
    return generateObservation({ note: prompt, age });
  }
  if (lower.includes("newsletter")) {
    return generateNewsletter({ month: "This Month", theme: prompt, dates: "Add important dates here." });
  }
  if (lower.includes("daily report")) {
    return generateDailyReport({ childName: "The child", age, meals: "Meals were offered according to the daily menu.", nap: "Rest time was supported.", highlights: prompt });
  }
  if (lower.includes("incident report") || lower.includes("injury")) {
    return generateIncidentReport({ incident: prompt, age });
  }
  if (lower.includes("contract") || lower.includes("agreement")) {
    return generateContract({ program: "Your Daycare Name", tuition: "Tuition is due on the scheduled payment date.", schedule: "Care schedule should be listed here.", policies: "Add late fees, sick policy, vacation, and termination notice." });
  }
  if (lower.includes("menu")) {
    return generateMenu(prompt);
  }
  if (lower.includes("activity") || lower.includes("sensory") || lower.includes("art")) {
    return generateActivity({ age, theme: prompt, skill: lower.includes("sensory") ? "sensory exploration" : "creative learning" });
  }
  if (lower.includes("handbook")) {
    return generateHandbook({ program: "Your Daycare Name", tuition: "Tuition is due on the scheduled payment date.", sick: "Children should stay home when ill.", pickup: "Authorized adults must sign children in and out." });
  }
  return generateLessonPlan({ age, theme: cleanPromptTheme(prompt) || "Farm", days: "5", focus: "language, social-emotional development, fine motor, and play-based learning" });
}

function generateLessonPlan(data) {
  const rawAge = data.age || "Toddler";
  const theme = data.theme || "Farm";
  const planLength = data.planLength || "Weekly";
  const days = Number(data.days || 5);
  const focus = data.focus || "language, fine motor, social-emotional skills";
  const isInfant = rawAge === "Infant";
  const isYoungToddler = rawAge === "Young Toddler";
  const isOlderToddler = rawAge === "Older Toddler";
  const isToddler = isYoungToddler || isOlderToddler || rawAge === "Toddler";
  const isSchoolAge = rawAge === "School Age";
  const materials = data.materials || (isInfant
    ? "Soft textured items, sensory safe objects, board books, soft music, mirrors, rattles, tummy time mat"
    : isSchoolAge
    ? "Books, paper, pencils, scissors (supervised), science materials, building supplies, art supplies, games"
    : "pictures or props, books, crayons, paper, sensory bin items, blocks, music, and simple printable pages");
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Monday 2", "Tuesday 2", "Wednesday 2", "Thursday 2", "Friday 2"];
  const daily = dayNames.slice(0, days).map((day, index) => {
    if (isInfant) {
      const infantActivities = ["Sensory Exploration", "Tummy Time and Music", "Tracking and Touch", "Responsive Play", "Sensory and Books"];
      return `${day}: ${theme} ${infantActivities[index % infantActivities.length]}
- Sensory: Introduce a safe ${theme.toLowerCase()} sensory item — soft, colorful, or textured.
- Tummy Time: Offer supervised tummy time with themed visual interest (picture card or toy).
- Music/Language: Sing a simple song or hum softly while narrating: "I see the ${theme.toLowerCase()}!"
- Tracking: Hold a colorful ${theme.toLowerCase()} item and move it slowly for the infant to follow.
- Routine: Diaper, feeding, and sleep are integrated as natural learning and bonding moments.`;
    }
    if (isSchoolAge) {
      const schoolActivities = ["Introduce and Explore", "Create and Build", "Research and Write", "STEM and Problem-Solve", "Review and Share"];
      return `${day}: ${theme} ${schoolActivities[index % schoolActivities.length]}
- Opening Discussion: Ask a higher-order question connected to ${theme.toLowerCase()}. Encourage predictions and connections.
- Reading/Writing: Use a nonfiction or fiction book about ${theme.toLowerCase()}. Add journaling, diagrams, or vocabulary work.
- STEM/Project: Offer a hands-on challenge connected to ${theme.toLowerCase()}.
- Collaboration: Pair or small-group work connecting to the theme.
- Learning Goal: Build ${focus} through project-based, discussion-rich learning.`;
    }
    const activities = ["Explore and Talk", "Create and Connect", "Move and Match", "Build and Sort", "Review and Share"];
    return `${day}: ${theme} ${activities[index % activities.length]}
- Circle Time: Introduce ${theme} vocabulary with pictures, props, and simple questions.
- Art: Offer a low-prep ${theme.toLowerCase()} art invitation using crayons, paper, glue, or safe collage pieces.
- Sensory: Provide a supervised sensory bin or texture tray connected to ${theme.toLowerCase()}.
- Fine Motor: Practice ${isToddler ? "grasping, sorting, stacking, or placing safe materials" : "tracing, cutting with guidance, sorting, or writing simple shapes"}.
- Gross Motor: Add movement such as ${isToddler ? "crawling, marching, tossing, or animal walks" : "jumping, balancing, dancing, or obstacle courses"}.
- Learning Goal: Children will build ${focus} through hands-on play and guided conversation.`;
  }).join("\n\n");
  return `${planLength} Lesson Plan Overview
Age Group: ${rawAge}
Theme: ${theme}
Learning Focus: ${focus}

Materials List
${materials}

Learning Objectives
- Build vocabulary connected to ${theme.toLowerCase()}.
- Practice ${focus}.
- Encourage ${isInfant ? "sensory development, secure attachment, and early communication" : "social-emotional growth through choice-making, turn-taking, and participation"}.
- Support early learning guidelines through ${isInfant ? "responsive care and safe sensory experiences" : "play-based, hands-on experiences"}.

Daily Plans
${daily}

Books and Songs
${isInfant
    ? "Choose simple board books with high-contrast images, soft textures, or flap features. Sing soft lullabies, fingerplays, and name songs throughout the day."
    : isSchoolAge
    ? "Choose nonfiction and fiction books connected to the theme. Include poetry, read-alouds, and independent reading opportunities."
    : "Choose simple board books or picture books connected to " + theme.toLowerCase() + ". Use repeat-after-me songs, fingerplays, movement songs, and name songs."}

Provider Note
Adjust timing, materials, and supervision to fit your group size, ages, individual children's needs, and state childcare requirements.`;
}
function generateObservation(data) {
  const note = data.note || "Child counted to 10 and identified colors.";
  const rawAge = data.age || "Toddler";
  const age = rawAge === "Young Toddler" || rawAge === "Older Toddler" ? rawAge.toLowerCase() : rawAge.toLowerCase();
  const area = data.area || "Cognitive";
  const nextStep = data.nextStep || "Offer a similar activity with a small new challenge.";
  const childName = data.childName || data.child || "";
  const childRef = childName || ("the " + age);
  const isInfant = rawAge === "Infant";
  const isSchoolAge = rawAge === "School Age";
  const skillsForAge = isInfant
    ? ["Sensory exploration and responsiveness", "Visual tracking and attention", "Reaching, grasping, or mouthing safely", "Vocalizing and early communication", "Bonding and secure attachment"]
    : isSchoolAge
    ? ["Critical thinking and problem-solving", "Reading, writing, or math connections", "Peer collaboration and social reasoning", "Independence and self-direction", "Attention and persistence on challenging tasks"]
    : ["Early problem-solving and curiosity", "Vocabulary and concept development", "Attention and persistence", "Hand-eye coordination and fine motor", "Confidence participating in learning experiences"];
  return `Professional Observation
Child: ${childName || "Not specified"}
Age Group: ${rawAge}
Developmental Area: ${area}

Observation
During ${isInfant ? "a care routine and exploration time" : "play"}, ${childRef} demonstrated growing ${area.toLowerCase()} skills while ${note.charAt(0).toLowerCase() + note.slice(1)} This shows ${childName ? childName : "the child"} is making meaningful connections through ${isInfant ? "sensory exploration, secure bonding, and responsive care" : "hands-on exploration, communication, and problem-solving"}.

Skills Demonstrated
${skillsForAge.map((s) => "- " + s).join("\n")}

What to Look For Next
Watch for ${childName ? childName : "the child"} repeating this skill independently, using it in a new setting, showing increased confidence, or demonstrating it with less support.

Next Steps for Learning
${nextStep} ${isInfant ? "Continue responsive care, narrate your actions, and offer safe sensory experiences." : "Model new words, ask simple open-ended questions, and allow time to practice at their own pace."}

Learning Standard Connection
${area} development — connected to age-appropriate early learning guidelines for ${rawAge.toLowerCase()} learners.`;
}

function generateActivity(data) {
  const rawAge = data.age || "Preschool";
  const theme = data.theme || data.skill ? (data.theme || "Discovery") : "Ocean";
  const skill = data.skill || "fine motor";
  const area = data.developmentalArea || skill;
  const childName = data.childName || "";
  const materials = data.materials || (rawAge === "Infant"
    ? "Soft textured mat, safe sensory items (fabric squares, crinkle toys), caregiver hands, simple board books."
    : rawAge === "Young Toddler" || rawAge === "Older Toddler"
    ? "Tray or bin, themed pictures or props, child-safe manipulatives, paper, crayons, and a small basket."
    : rawAge === "School Age"
    ? "Project materials, pencils, scissors (adult-supervised), measuring tools, building materials."
    : "Tray or bin, themed pictures or props, tongs or scoops, paper, crayons, and a small basket for sorting.");
  const isInfant = rawAge === "Infant";
  const isSchoolAge = rawAge === "School Age";
  const duration = isInfant ? "5-10 minutes" : isSchoolAge ? "20-30+ minutes" : rawAge.includes("Toddler") ? "10-15 minutes" : "15-20 minutes";
  const instructions = isInfant
    ? ["Set up a safe sensory space on a clean mat or blanket.", "Introduce each item by name while the infant explores through touch, sight, and sound.", "Narrate what the infant is doing: 'You found the soft square! It feels bumpy!'", "Follow the infant's lead and respond to their cues warmly.", "End the activity before overstimulation — watch for turning away or fussiness."]
    : isSchoolAge
    ? ["Introduce the activity and explain the learning goal in simple terms.", "Model one example, then invite children to explore and problem-solve.", "Encourage questions, predictions, and creative thinking.", "Allow children to work independently or in small groups.", "Wrap up with a discussion: 'What did you notice? What would you try differently?'"]
    : ["Introduce the " + theme.toLowerCase() + " materials and name each item clearly.", "Invite children to touch, sort, match, move, or describe the materials.", "Model the skill: " + skill + ". Keep directions to 1-2 simple steps.", "Keep the activity short, playful, and flexible.", "Observe what children notice, say, choose, and try independently."];
  return `Activity: ${theme} ${skill.charAt(0).toUpperCase() + skill.slice(1)} ${isInfant ? "Exploration" : isSchoolAge ? "Project" : "Discovery"}
${childName ? "Child: " + childName + "\n" : ""}Age Group: ${rawAge}
Duration: ${duration}
Developmental Area: ${area}

Materials
${materials}

Instructions
${instructions.map((step, i) => (i + 1) + ". " + step).join("\n")}

Learning Goals
- Build ${area} skills through ${isInfant ? "safe sensory exploration and responsive interaction" : isSchoolAge ? "hands-on challenge and creative thinking" : "hands-on practice and play"}.
- Encourage ${isInfant ? "bonding, curiosity, and early communication" : "language, attention, choice-making, and confidence"}.
- Support ${isInfant ? "sensory development and secure attachment" : "curiosity, problem-solving, and independence"}.

Safety Notes
${isInfant ? "Always supervise closely. Ensure all items are too large to be a choking hazard. No small parts." : isSchoolAge ? "Supervise use of scissors, tools, and any project materials. Adjust for individual needs." : "Supervise closely. Ensure all materials are age-safe. Avoid small parts for young toddlers."}

Extensions
${isInfant ? "Try the activity in different positions (tummy time, supported sitting). Add soft music or gentle narration." : "Add books, songs, counting, color matching, movement, or a take-home note connected to " + theme.toLowerCase() + "."}`;
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
${data.child || "Child"} · ${data.age || "Age not listed"}

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
  const childName = data.childName || data.child || "Child";
  const rawAge = data.age || "";
  const programName = data.programName || data.program || "Your Daycare Name";
  const tone = data.tone || "Warm and professional";
  const ageContext = rawAge ? ` (${rawAge})` : "";
  return `Behavior Support Documentation
Program: ${programName}
Child: ${childName}${ageContext}
Concern: ${data.concern || "Behavior that needed support"}

What Happened
${data.incident || "Describe the behavior factually and objectively."}

Possible Trigger or Antecedent
${data.trigger || "Describe what occurred just before the behavior."}

Support Given
${data.support || "Comfort was offered, safety was maintained, and the child was redirected using calm guidance."}

What This Behavior May Communicate
${childName} may be communicating a need for ${rawAge === "Infant" ? "comfort, sensory regulation, or basic needs" : rawAge === "Young Toddler" || rawAge === "Older Toddler" ? "language support, attention, predictability, or physical comfort" : "connection, control, help with transitions, or emotional regulation"}.

${rawAge === "Infant" ? "Infant Support Strategies\n- Respond promptly and consistently to cues.\n- Check for hunger, discomfort, or overstimulation.\n- Offer calm rocking, gentle touch, and a quiet environment.\n- Review safe sleep and routine schedule with the family." : rawAge === "Young Toddler" ? "Young Toddler Support Strategies\n- Offer simple 1-step directions and clear, predictable routines.\n- Use visual cues and transition warnings.\n- Name feelings and model simple words: 'You feel frustrated.'\n- Redirect to a safe alternative activity." : "Proactive Strategies\n- Offer a visual schedule and transition warnings.\n- Practice replacement language during calm moments.\n- Provide close supervision during known trigger times.\n- Use positive language, choices, and predictable routines."}

Developmental Goal
${data.goal || "Build age-appropriate self-regulation, communication, and coping skills."}

Follow-Up Plan
${data.plan || "Teach replacement language, offer visual reminders, provide close supervision, and practice the skill during calm moments."}

Parent Communication
Tone: ${tone}
Today at ${programName}, ${childName} needed some extra support. ${data.support || "We used calm guidance, kept everyone safe, and will continue practicing the skills needed for successful play and routines."} I would love to connect with you to share strategies we can use together at home and at daycare.

Provider Note
Review your program policy and state licensing requirements for behavior documentation, incident reporting, and parent notification.`;
}

function generateIncidentReport(data) {
  const childName = data.childName || data.child || "Child";
  const childAge = data.childAge || "";
  const age = data.age || "";
  const programName = data.programName || data.program || "Your Daycare Name";
  const date = data.date || "Date of incident";
  const ageLabel = childAge ? ` (${childAge})` : age ? ` (${age})` : "";
  return `Incident Report
Program: ${programName}
Date and Time: ${date}
Child Name: ${childName}${ageLabel}

Description of Incident
${data.incident || "Describe what happened using factual, objective language."}

What Occurred Before the Incident
${data.trigger || "Describe any known triggers, antecedents, or events that occurred just before the incident."}

Immediate Response Given
${data.response || "Describe the steps taken immediately after the incident, including first aid, comfort, and supervision."}

Witnesses / Others Present
${data.witnesses || "List any witnesses or children who were present."}

Next Steps and Follow-Up
${data.nextSteps || "Document any planned follow-up steps, safety changes, or monitoring needed."}

Parent Notification
Tone: ${data.tone || "Factual and professional"}
Today at ${programName}, I am reaching out to share an incident that occurred involving ${childName}. ${data.incident || "An incident occurred today."} ${data.response ? "Immediate response included: " + data.response + "." : "Comfort and safety support was provided right away."} Please contact me if you have any questions.

Provider Note
Review your state licensing requirements for incident documentation, parent notification timelines, and required forms. Keep a copy in the child's file.`;
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
  const programName = data.programName || data.program || "Your Childcare Program";
  const childName = data.childName || data.child || "";
  const topic = data.topic || "Program Update";
  const tone = data.tone || "Warm and clear";
  const isProviderOnly = (data.audience || "").includes("Provider-only");
  if (isProviderOnly) {
    return `Provider Documentation Note

Topic: ${topic}
Date: ${data.date || new Date().toLocaleDateString()}
Child: ${childName || "Not specified"}

Documentation
${data.details || "Add details here."}

Provider Notes
${data.providerNotes || "Keep in child file. Not for parent distribution."}`;
  }
  return `Parent Message Draft — ${programName}

Topic: ${topic}
Tone: ${tone}
${childName ? "Child: " + childName : ""}

Message
Hi ${childName ? childName + "'s family" : "there"}!

${data.details || "Add the important details here."}

I appreciate your partnership and always want to keep our communication open and positive. Please don't hesitate to reach out if you have any questions or if there is anything you'd like me to know.

Thank you for trusting us with your family,
${programName}`;
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
  const programName = data.programName || data.program || "Your Childcare Program";
  const highlights = data.highlights || "";
  return `${programName}
${month} Parent Newsletter
Theme: ${theme}

Hello Families!
We hope you and your little ones are doing wonderfully. This month at ${programName}, we are focusing on playful learning experiences that support language, social-emotional growth, creativity, movement, and independence. Children will explore through stories, songs, art, sensory play, outdoor play, and hands-on activities connected to our theme: ${theme}.

What We Are Learning This Month
${highlights ? highlights + "\n" : ""}- New vocabulary and concepts connected to ${theme.toLowerCase()}
- Sharing, turn-taking, and expressing feelings
- Fine motor skills through art, building, and table activities
- Gross motor skills through movement and outdoor play
- Early problem-solving, counting, matching, and observation

Important Dates
${dates}

Reminders
${reminders}

Family Connection at Home
You can support learning by reading together, talking about your child's day, naming feelings, counting everyday objects, and encouraging independence with simple everyday routines.

Thank you for being such wonderful partners in your child's care and learning. We love having your family with us!

Warmly,
${programName}`;
}

function generateDailyReport(data) {
  const child = data.childName || data.child || "Your child";
  const mood = data.mood || "Happy and engaged";
  const rawAge = data.age || "";
  const programName = data.programName || data.program || "";
  const date = data.date || "";
  const isInfant = rawAge === "Infant";
  const isToddler = rawAge === "Young Toddler" || rawAge === "Older Toddler" || rawAge === "Toddler";
  const header = [
    programName ? programName + " — Daily Report" : "Daily Report",
    date ? "Date: " + date : "",
    "Child: " + child,
    rawAge ? "Age Group: " + rawAge : "",
  ].filter(Boolean).join("\n");
  const moodText = data.mood || "Happy and engaged";
  const infantExtra = isInfant ? `
Feeding
${data.meals || "Feeding was provided on cue and according to the family's feeding plan."}

Diapers
${data.diapering || "Diaper changes were logged throughout the day."}

Sleep
${data.nap || "Sleep was supported in a safe sleep environment."}

Tummy Time
Tummy time was offered during awake, supervised periods.` : "";
  const toddlerExtra = isToddler ? `
Meals
${data.meals || "Meals and snacks were offered according to the daily menu."}

Diapering / Potty
${data.diapering || "Diapering, potty attempts, and handwashing were supported throughout the day."}

Rest
${data.nap || "Rest time was offered and supported."}` : "";
  const olderExtra = !isInfant && !isToddler ? `
Meals
${data.meals || "Meals and snacks were offered according to the daily menu."}

Rest
${data.nap || "Rest time was offered and supported."}` : "";
  return `${header}

${child} had a great day and participated in our daily routines and learning experiences.

Mood
${moodText}
${infantExtra}${toddlerExtra}${olderExtra}

Highlights
${data.highlights || "Enjoyed play, stories, movement, and hands-on learning activities."}

Learning Moment
${data.learning || "Today supported " + (isInfant ? "sensory development, bonding, communication, and early exploration" : isToddler ? "language development, social-emotional growth, and play-based learning" : "communication, independence, social skills, and curiosity") + "."}

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
        <span>${resource.category} · ${resource.age} · ${resource.plan}</span>
      </div>
      <button class="favorite-button ${!isProUser() ? "disabled-control" : ""}" ${favoriteAttribute} type="button">${favoriteText}</button>
    </div>
  `;
}

function renderFavorites() {
  const target = document.querySelector("#favoritesList");
  if (!target) return;
  if (!isProUser()) {
    target.innerHTML = `<div class="empty-state">Saved favorites are included with Pro.</div>`;
    return;
  }
  const saved = resources.filter((resource) => favorites.includes(resource.id) && isResourceVisibleToCurrentUser(resource));
  target.innerHTML = saved.length
    ? saved.slice(0, 5).map(compactItem).join("")
    : `<div class="empty-state">Save resources you want to come back to later.</div>`;
}

function sampleResources(category, count) {
  return resources.filter((resource) => resource.category === category && isResourceVisibleToCurrentUser(resource)).slice(0, count);
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
  const soldOut = remaining <= 0;
  return `
    <section class="founding-banner ${soldOut ? "founding-sold-out" : ""}">
      <div>
        <p class="eyebrow">${soldOut ? "Regular Pro Pricing" : "Founding Member Special"}</p>
        <h3>${soldOut ? "Founding spots are filled. Pro is now $19.99/month." : "First 50 Members: $9.99/month for life"}</h3>
        <p>${soldOut ? "The founding price-lock offer is closed. New members can join Pro Monthly for $19.99/month or Pro Annual for $199/year." : `${claimed} spots are filled, ${remaining} remain, and regular pricing begins when all ${foundingStatusCache.limit || foundingMemberLimit} are claimed.`}</p>
      </div>
      ${foundingMeterHtml()}
    </section>
  `;
}

function renderHomeFoundingOffer() {
  const target = document.querySelector("#homeFoundingOffer");
  if (!target) return;
  const remaining = foundingSpotsRemaining();
  const claimed = foundingSpotsClaimed();
  const limit = Number(foundingStatusCache.limit || foundingMemberLimit);
  const soldOut = remaining <= 0;
  target.innerHTML = `
    <div class="founding-hero-card ${soldOut ? "founding-sold-out" : ""}">
      <h2>${soldOut ? "Founding Member spots are filled" : "Founding Member Pricing"}</h2>
      <div class="founding-price-row">
        <span class="founding-price-prefix">Get Pro for</span>
        <strong>${soldOut ? "$19.99" : "$9.99"}</strong>
        <em>/month <span>${soldOut ? "regular price" : "for life"}</span></em>
      </div>
      <p class="founding-remaining">${soldOut ? "Founding pricing is closed" : `Only <strong>${remaining}</strong> Spots Remaining`}</p>
      <button class="primary-button founding-cta-button" data-checkout-plan="${soldOut ? "monthly" : "founding"}" type="button">${soldOut ? "Choose Pro Monthly" : "Claim Founding Member Pricing"}</button>
      <div class="founding-live-meter" aria-label="${claimed} of ${limit} founding spots claimed">
        <span><i style="width: ${foundingProgressPercent()}%"></i></span>
        <small>${soldOut ? "All founding spots are claimed" : `${claimed} of ${limit} Spots Claimed`}</small>
      </div>
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

function promoCodePanel() {
  return `
    <section class="section-block promo-code-panel">
      <div>
        <p class="eyebrow">Promo Code</p>
        <h3>Have a promo code? Apply it first.</h3>
        <p class="muted-copy">${escapeHtml(checkoutPromoSummary())}</p>
      </div>
      <div class="promo-code-entry">
        <label>
          <span>Promo code</span>
          <input id="checkoutPromoCodeInput" value="" placeholder="Enter code" autocomplete="off" />
        </label>
        <button class="ghost-button" data-apply-promo-code type="button">Apply Code</button>
        <span class="form-message promo-code-message" id="checkoutPromoCodeMessage" aria-live="polite"></span>
      </div>
    </section>
  `;
}

function renderPricingPage() {
  const target = document.querySelector("#pricingApp");
  if (!target) return;
  const remaining = foundingSpotsRemaining();
  target.innerHTML = `
    ${foundingStatusCard()}
    ${isPromoLinkActive() ? promoCodePanel() : ""}
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
  const soldOut = remaining <= 0;
  target.innerHTML = `
    ${foundingStatusCard()}
    ${isPromoLinkActive() ? promoCodePanel() : ""}
    <div class="pricing-grid">
      ${!soldOut
        ? pricingCard("Founding", { featured: true, primary: true, eyebrow: "Best Launch Offer", checkoutType: "founding", buttonText: "Checkout for $9.99/month" })
        : pricingCard("ProMonthly", { featured: true, primary: true, eyebrow: "Pro", checkoutType: "monthly", buttonText: "Checkout for $19.99/month" })}
      ${!soldOut ? pricingCard("ProMonthly", { checkoutType: "monthly", buttonText: "Checkout Monthly" }) : ""}
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
  const paidBilling = currentUser ? accountHasPaidBilling(account) : false;
  const planLabel = currentUser ? billingPlanLabel(currentPlan, account) : "Guest";
  const statusLabel = currentUser
    ? paidBilling
      ? account?.subscriptionStatus || `${planLabel} Subscription Active`
      : "Free Plan"
    : "No account";
  return `
    <div class="billing-summary-grid">
      <div><span>Current Plan</span><strong>${escapeHtml(planLabel)}</strong></div>
      <div><span>Monthly Price</span><strong>${escapeHtml(billingPriceLabel(account))}</strong></div>
      <div><span>Price Lock</span><strong>${paidBilling ? account?.foundingMember ? "Lifetime" : "Regular Pro pricing" : "None"}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(statusLabel)}</strong></div>
      <div><span>AI Usage</span><strong>${aiUsageCount()} / ${aiMonthlyLimit()}</strong></div>
      <div><span>AI Reset</span><strong>${escapeHtml(aiResetLabel())}</strong></div>
    </div>
  `;
}

function renderBillingPage() {
  const target = document.querySelector("#billingApp");
  if (!target) return;
  const account = currentAccount();
  const paidBilling = currentUser ? accountHasPaidBilling(account) : false;
  target.innerHTML = `
    <section class="account-layout">
      <div class="account-panel">
        <p class="eyebrow">Billing Management</p>
        <h3>${escapeHtml(currentUser || "Guest")}</h3>
        ${subscriptionSummaryHtml()}
        <div class="account-actions-row">
          <button class="primary-button" data-view="upgrade" type="button">${paidBilling ? "Change Plan" : "Upgrade to Pro"}</button>
          ${paidBilling ? `<button class="ghost-button" data-update-payment type="button">Update Payment Method</button>` : ""}
          <button class="ghost-button" data-view="billing-history" type="button">View Billing History</button>
          ${paidBilling ? `<button class="danger-button" data-view="cancel-subscription" type="button">Cancel Subscription</button>` : ""}
        </div>
      </div>
      <div class="account-panel">
        <p class="eyebrow">Payment Method</p>
        <h3>${escapeHtml(paidBilling ? account?.paymentMethod || "Managed in Stripe" : "No payment method on file")}</h3>
        <p>Stripe Customer: ${escapeHtml(paidBilling ? account?.stripeCustomerId || "Created after live checkout" : "Created after checkout")}</p>
        <p>Subscription: ${escapeHtml(paidBilling ? account?.stripeSubscriptionId || "Created after live checkout" : "No active subscription")}</p>
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
  const paidBilling = accountHasPaidBilling(account);
  emailLabel.textContent = currentUser;
  planLabel.textContent = `${billingPlanLabel(currentPlan, account)} account`;
  if (verificationLabel) {
    verificationLabel.textContent = account?.emailVerified
      ? `Email verified through ${account?.authProvider || authProviderName}.`
      : `Email not verified. ${firebaseAuthEnabled ? "Please verify before launch use." : "Connect Firebase Auth to send verification emails."}`;
    verificationLabel.classList.toggle("verified", Boolean(account?.emailVerified));
  }
  if (phoneInput) phoneInput.value = account?.phone || "";
  statusLabel.textContent = paidBilling ? account?.subscriptionStatus || `${billingPlanLabel(currentPlan, account)} Subscription Active` : "Free Plan";
  detailLabel.innerHTML = paidBilling
    ? `Current Plan: ${escapeHtml(billingPlanLabel(currentPlan, account))}<br>Monthly Price: ${escapeHtml(billingPriceLabel(account))}<br>Price Lock: ${account?.foundingMember ? "Lifetime" : "Regular Pro pricing"}<br>Account Recovery: ${escapeHtml(account?.authProvider || authProviderName)}<br>AI Usage: ${aiUsageCount()} of ${paidAiMonthlyLimit} used this billing month. Resets ${escapeHtml(aiResetLabel())}.<br>Your account has full in-app resources, menus, child profiles, portfolios, tracking tools, provider tools, future premium features, and ${paidAiMonthlyLimit} AI generations per month.`
    : `Your Free account includes 5 lesson plans, 10 observations, 10 forms, 10 activity ideas, 10 printables, ${freeAiMonthlyLimit} AI generations per month, up to 3 child profiles, and the weekly observation tracker. Account Recovery: ${escapeHtml(account?.authProvider || authProviderName)}. AI Usage: ${aiUsageCount()} of ${freeAiMonthlyLimit} used. Resets ${escapeHtml(aiResetLabel())}.`;
  if (demoButton) demoButton.style.display = "none";
  if (upgradeButton) {
    upgradeButton.textContent = paidBilling ? "Manage Billing" : "Upgrade to Pro";
    upgradeButton.disabled = false;
    upgradeButton.classList.remove("disabled-control");
  }
  if (resendButton) resendButton.style.display = account?.emailVerified ? "none" : "inline-flex";
  if (cancelButton) cancelButton.style.display = paidBilling ? "inline-flex" : "none";
  if (signOutButton) signOutButton.style.display = "inline-flex";

  const savedFavoriteResources = resources.filter((resource) => favorites.includes(resource.id) && isResourceVisibleToCurrentUser(resource));
  const downloadedResources = resources.filter((resource) => savedDownloads.includes(resource.id) && isResourceVisibleToCurrentUser(resource));
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
        <span>${resource.category} · ${resource.age}</span>
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
  if (!currentUser) {
    // Logged-out: sidebar is hidden by CSS, but keep the DOM neutral just in case.
    currentPlanLabel.textContent = "";
    const summary = document.querySelector("#planAccessSummary");
    if (summary) summary.textContent = "";
    updateSidebarDashboard();
    return;
  }
  currentPlanLabel.textContent = billingPlanLabel();
  const summary = document.querySelector("#planAccessSummary");
  if (summary) {
    summary.textContent = isProUser()
      ? `${billingPlanLabel()} active: ${billingPriceLabel()} with full library access and ${Math.max(paidAiMonthlyLimit - aiUsageCount(), 0)} AI generations left this month.`
      : `Free plan: limited library access, up to 3 child profiles, and ${Math.max(freeAiMonthlyLimit - aiUsageCount(), 0)} AI generations left this month.`;
  }
  updateSidebarDashboard();
}

function updateSidebarDashboard() {
  const nameTarget = document.querySelector("#sidebarUserName");
  const dueTarget = document.querySelector("#sidebarObservationsDue");
  const goalsTarget = document.querySelector("#sidebarActiveGoals");
  const plansTarget = document.querySelector("#sidebarWeekPlans");
  if (!dueTarget || !goalsTarget || !plansTarget) return;
  if (nameTarget) {
    const accountName = currentAccount()?.name || currentUser?.split("@")[0] || "Provider";
    nameTarget.textContent = `Hi, ${accountName}!`;
  }
  const records = childRecords();
  const stats = weeklyObservationStats(records);
  const activeGoals = records.goals.filter((goal) => goalProgressPercent(goal.progress) < 100).length;
  const planner = weeklyPlanner();
  const plannedDays = plannerDays.filter((day) => Object.values(planner.days?.[day] || {}).some(Boolean)).length;
  dueTarget.textContent = String(Math.max(stats.totalNeeded - stats.completed, 0));
  goalsTarget.textContent = String(activeGoals);
  plansTarget.textContent = String(plannedDays);
}

function setFreePlan() {
  trackEvent("free_plan_selected");
  currentPlan = "Free";
  localStorage.setItem("llhPlan", currentPlan);
  updateCurrentAccountBilling({
    plan: "Free",
    subscriptionCadence: "",
    subscriptionStatus: "Free Plan",
    monthlyPrice: "$0/month",
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
  if (type === "founding") await syncFoundingStatus({ render: true });
  const remaining = foundingSpotsRemaining();
  const checkoutType = type === "founding" && remaining <= 0 ? "monthly" : type;
  const amount = checkoutAmount(checkoutType);
  const promoCode = isPromoLinkActive() ? normalizedCheckoutPromoCode() : "";
  const checkoutButton = document.querySelector(`[data-checkout-plan="${type}"]`);
  if (checkoutButton) {
    checkoutButton.disabled = true;
    checkoutButton.textContent = promoCode ? "Checking code..." : "Opening Stripe...";
  }
  let promoValidation = null;
  if (promoCode) {
    promoValidation = await validateCheckoutPromoCode();
    if (!promoValidation?.valid) {
      if (checkoutButton) {
        checkoutButton.disabled = false;
        checkoutButton.textContent = checkoutType === "founding" ? "Claim Founding Spot" : checkoutType === "annual" ? "Choose Pro Annual" : "Choose Pro Monthly";
      }
      return;
    }
  }
  if (checkoutButton) {
    checkoutButton.textContent = "Opening Stripe...";
  }
  const pending = {
    type: checkoutType,
    amount,
    email: currentUser,
    startedAt: new Date().toISOString(),
    foundingEligible: checkoutType === "founding",
    promoCode,
    trialDays: promoValidation?.trialDays || 0,
    promoLabel: promoValidation?.label || "",
  };
  localStorage.setItem("llhPendingCheckout", JSON.stringify(pending));
  trackEvent("checkout_start", { type: checkoutType, amount, promoCode: promoCode ? "entered" : "" });
  addBillingHistory("Checkout Started", `${checkoutType === "annual" ? "Annual" : checkoutType === "founding" ? "Founding Member" : "Monthly"} Stripe checkout started${promoCode ? " with promo applied" : ""}`, amount);

  if (stripeCheckoutConfig.checkoutEndpoint && canUseStripeBackend()) {
    try {
      const response = await fetch(stripeCheckoutConfig.checkoutEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentUser,
          plan: checkoutType,
          promoCode,
          successUrl: `${window.location.origin}${window.location.pathname}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}${window.location.pathname}?checkout=cancel`,
          priceKey: checkoutType === "founding" ? billingPlans.Founding.stripePriceKey : checkoutType === "annual" ? billingPlans.ProAnnual.stripePriceKey : billingPlans.ProMonthly.stripePriceKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Stripe checkout could not start.");
      if (promoCode && !data?.promo) throw new Error("The promo code was not accepted. Please apply the code again before checkout.");
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch (error) {
      addBillingHistory("Stripe Error", error.message || "Checkout endpoint did not return a usable Stripe URL.", amount);
    } finally {
      if (checkoutButton) {
        checkoutButton.disabled = false;
        checkoutButton.textContent = checkoutType === "founding" ? "Claim Founding Spot" : checkoutType === "annual" ? "Choose Pro Annual" : "Choose Pro Monthly";
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

async function startProTrial() {
  if (!requireBillingAccount()) return;
  closeProFeatureModal();
  await syncFoundingStatus({ render: false });
  const remaining = foundingSpotsRemaining();
  const checkoutType = remaining > 0 ? "founding" : "monthly";
  const amount = checkoutAmount(checkoutType);
  const pending = {
    type: checkoutType,
    amount,
    email: currentUser,
    startedAt: new Date().toISOString(),
    foundingEligible: checkoutType === "founding",
    promoCode: "",
    trialDays: 7,
    promoLabel: "7-Day Pro Trial",
  };
  localStorage.setItem("llhPendingCheckout", JSON.stringify(pending));
  trackEvent("checkout_start", { type: checkoutType, amount, promoCode: "", trial7day: true });
  addBillingHistory("Checkout Started", `${checkoutType === "founding" ? "Founding Member" : "Monthly"} Pro trial checkout started (7-day trial)`, amount);

  if (stripeCheckoutConfig.checkoutEndpoint && canUseStripeBackend()) {
    try {
      const response = await fetch(stripeCheckoutConfig.checkoutEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentUser,
          plan: checkoutType,
          trial7day: true,
          successUrl: `${window.location.origin}${window.location.pathname}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}${window.location.pathname}?checkout=cancel`,
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
    }
  }

  setView("upgrade");
  const upgradeTarget = document.querySelector("#upgradeApp");
  if (upgradeTarget) {
    upgradeTarget.insertAdjacentHTML("afterbegin", `
      <section class="section-block checkout-test-panel">
        <p class="eyebrow">7-Day Pro Trial</p>
        <h3>${escapeHtml(amount)} after 7-day free trial</h3>
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
  const type = pending.type === "founding" && foundingSpotsRemaining() <= 0 ? "monthly" : pending.type;
  let plan = planFromCheckoutType(type);
  let cadence = type === "annual" ? "annual" : "monthly";
  let foundingMember = currentAccount()?.foundingMember || false;
  let foundingMemberNumber = currentAccount()?.foundingMemberNumber || null;
  let priceLock = "";
  let monthlyPrice = type === "annual" ? "$199/year" : "$19.99/month";
  let status = type === "annual" ? "Pro Annual Subscription Active" : "Pro Monthly Subscription Active";
  if (pending.promoCode && pending.trialDays) {
    status = `${status} - ${pending.trialDays} Day Free Trial`;
  }

  if (type === "founding" || currentAccount()?.foundingMember) {
    const claim = claimFoundingMembership(currentUser);
    if (claim.claimed || currentAccount()?.foundingMember) {
      plan = "Founding";
      foundingMember = true;
      foundingMemberNumber = claim.memberNumber || currentAccount()?.foundingMemberNumber;
      priceLock = "Lifetime";
      monthlyPrice = "$9.99/month";
      status = pending.promoCode && pending.trialDays ? `Founding Member Subscription Active - ${pending.trialDays} Day Free Trial` : "Founding Member Subscription Active";
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
    promoCode: pending.promoCode || "",
    trialDays: pending.trialDays || 0,
  });
  if (pending.promoCode && pending.trialDays) {
    markCheckoutPromoRedeemed(pending.promoCode, { trialDays: pending.trialDays, label: pending.promoLabel });
  }
  addBillingHistory("Payment Succeeded", `${billingPlanLabel(plan)} subscription activated${pending.promoCode ? " with promo trial" : ""}`, monthlyPrice);
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
  if (session?.founding) applyFoundingStatus(session.founding);
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
    promoCode: pending?.promoCode || "",
    trialDays: session.promo?.trialDays || pending?.trialDays || 0,
    promoLabel: session.promo?.label || pending?.promoLabel || "",
  }));
  completeCheckout();
  updateCurrentAccountBilling({
    stripeCustomerId: session.customerId || currentAccount()?.stripeCustomerId,
    stripeSubscriptionId: session.subscriptionId || currentAccount()?.stripeSubscriptionId,
    paymentMethod: "Managed in Stripe",
  });
  await syncSubscriptionFromBackend(currentUser || session.email, { renderFounding: true });
  await syncFoundingStatus({ render: true });
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
    monthlyPrice: "$0/month",
    priceLock: account?.foundingMember ? "Lifetime" : "",
  });
  addBillingHistory("Subscription Canceled", "Pro permissions removed and Free limits restored.", "$0");
  trackEvent("subscription_canceled", { email: currentUser, previousPlan: account?.plan || "Pro", previousPrice: account?.monthlyPrice || "" });
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
  // Clear admin session so stale admin-unlocked state cannot grant Pro access
  // to a visitor who is no longer authenticated.
  clearAdminSession();
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
  const searchedChild = childFromSearchQuery(searchInput.value.trim(), childRecords());
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
    ${searchedChild && searchInput.value.toLowerCase().includes("lesson") ? renderChildLessonSearchContext(searchedChild) : ""}
    <div class="resource-grid">
      ${results.length ? results.map(resourceCard).join("") : `<div class="empty-state">No matches yet. Try toddler, forms, menu, ocean, farm, fine motor, or observation.</div>`}
    </div>
  `;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (event) => {
  const clickedButton = event.target.closest("button");
  if (clickedButton && !clickedButton.closest("#adminProtectedContent")) {
    trackEvent("button_click", {
      label: (clickedButton.textContent || clickedButton.getAttribute("aria-label") || "Button").replace(/\s+/g, " ").trim(),
      view: clickedButton.dataset.view || "",
      checkoutPlan: clickedButton.dataset.checkoutPlan || "",
      action: clickedButton.id || clickedButton.dataset.view || clickedButton.dataset.checkoutPlan || clickedButton.dataset.proFeature || "button",
    });
  }

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
    const isLimit = proFeatureButton.dataset.proFeature === "resource-limit";
    const message = isLimit
      ? freeResourceLimitMessage
      : "Upgrade to Pro to unlock this feature.";
    showProFeatureModal(message, isLimit ? "limit" : "feature");
    return;
  }

  const startFreeButton = event.target.closest("[data-action='start-free']");
  if (startFreeButton) {
    event.preventDefault();
    if (!currentUser) {
      openAuthModal("signup");
      return;
    }
    setView("home");
    return;
  }

  const upgradeTrialButton = event.target.closest("[data-action='upgrade-trial']");
  if (upgradeTrialButton) {
    event.preventDefault();
    if (!currentUser) {
      openAuthModal("signup");
      return;
    }
    setView("upgrade");
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

  const applyPromoButton = event.target.closest("[data-apply-promo-code]");
  if (applyPromoButton) {
    event.preventDefault();
    applyPromoButton.disabled = true;
    applyPromoButton.textContent = "Checking...";
    validateCheckoutPromoCode().finally(() => {
      applyPromoButton.disabled = false;
      applyPromoButton.textContent = "Apply Code";
    });
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

  const supportHomeButton = event.target.closest("[data-support-home]");
  if (supportHomeButton) {
    event.preventDefault();
    activeSupportCategoryId = "";
    activeSupportTopicId = "";
    activeSupportTab = "why";
    setView("support-center");
    return;
  }

  const supportCategoryButton = event.target.closest("[data-support-category]");
  if (supportCategoryButton) {
    event.preventDefault();
    activeSupportCategoryId = supportCategoryButton.dataset.supportCategory || "";
    activeSupportTopicId = "";
    activeSupportTab = "why";
    setView("support-center");
    return;
  }

  const supportTopicButton = event.target.closest("[data-support-topic]");
  if (supportTopicButton) {
    event.preventDefault();
    activeSupportTopicId = supportTopicButton.dataset.supportTopic || "";
    const topic = supportTopicById(activeSupportTopicId);
    activeSupportCategoryId = topic?.id || activeSupportCategoryId;
    activeSupportTab = "why";
    if (supportTopicButton.dataset.supportChildId) {
      activeSupportChildId = supportTopicButton.dataset.supportChildId;
      selectedChildId = activeSupportChildId;
      localStorage.setItem("llhSelectedChild", selectedChildId);
    }
    setView("support-center");
    return;
  }

  const supportTabButton = event.target.closest("[data-support-tab]");
  if (supportTabButton) {
    event.preventDefault();
    activeSupportTab = supportTabButton.dataset.supportTab || "why";
    renderSupportCenterPage();
    return;
  }

  const supportAiButton = event.target.closest("[data-support-ai]");
  if (supportAiButton) {
    event.preventDefault();
    if (!canUseAi()) {
      showProFeatureModal(aiLimitMessage(), "limit");
      return;
    }
    const topic = supportTopicById(supportAiButton.dataset.supportAi)?.topic || "Support";
    const records = childRecords();
    const child = supportCenterSelectedChild(records);
    const output = document.querySelector("#supportAiOutput");
    if (output) output.innerHTML = renderSupportAiIdeas(topic, child, records);
    recordAiUse();
    supportAiButton.textContent = "Ideas Ready";
    setTimeout(() => {
      supportAiButton.textContent = "Give Me Ideas";
    }, 1400);
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    activeFilter = "All";
    if (searchInput) searchInput.value = "";
    if (viewButton.dataset.view === "plans" || viewButton.dataset.view === "upgrade") {
      trackEvent("upgrade_click", { targetView: viewButton.dataset.view });
    }
    // Free-user guard: intercept pro-only nav items before state mutation
    if (viewButton.hasAttribute("data-pro-nav") && !isProUser()) {
      const label = proNavLabels[viewButton.dataset.view] || "This tool";
      showProFeatureModal(`${label} is a Pro feature. Upgrade to unlock all Pro tools.`);
      return;
    }
    if (viewButton.dataset.view === "children") {
      childManagementMode = "list";
      childProfileTab = "overview";
      activeChildProfileEditId = "";
      activeChildObservationEditId = "";
      activeObservationChildLock = "";
      activePortfolioChildId = "";
    }
    if (viewButton.dataset.view === "goals") {
      childManagementMode = "goals";
      childProfileTab = "goals";
      activeChildProfileEditId = "";
      activeChildObservationEditId = "";
      activeObservationChildLock = "";
      activePortfolioChildId = "";
    }
    if (viewButton.dataset.view === "support-center") {
      activeSupportCategoryId = "";
      activeSupportTopicId = "";
      activeSupportTab = "why";
      activeSupportChildId = selectedChildId;
      supportCenterSearch = "";
    }
    const requestedChildToolTab = childToolTabFromView(viewButton.dataset.view);
    if (requestedChildToolTab) {
      childManagementMode = "tools";
      childToolsTab = requestedChildToolTab;
      activeChildObservationEditId = "";
      activeObservationChildLock = "";
      activePortfolioChildId = "";
    }
    setMobileNavOpen(false);
    setView(viewButton.dataset.view);
    return;
  }

  const pdfDownloadButton = event.target.closest("[data-download-pdf]");
  if (pdfDownloadButton) {
    event.preventDefault();
    downloadResourcePdf(pdfDownloadButton.dataset.downloadPdf);
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
    childManagementMode = "profile";
    renderChildManagement();
    return;
  }

  const childViewButton = event.target.closest("[data-child-view]");
  if (childViewButton) {
    event.preventDefault();
    childManagementMode = childViewButton.dataset.childView || "list";
    activeChildProfileEditId = "";
    activeChildObservationEditId = "";
    activeObservationChildLock = "";
    if (childManagementMode === "list") childProfileTab = "overview";
    if (childManagementMode !== "observe") pendingObservationArea = "";
    renderChildManagement();
    return;
  }

  const viewChildProfileButton = event.target.closest("[data-view-child-profile]");
  if (viewChildProfileButton) {
    event.preventDefault();
    const childId = viewChildProfileButton.dataset.viewChildProfile;
    if (childId) {
      selectedChildId = childId;
      localStorage.setItem("llhSelectedChild", selectedChildId);
      childManagementMode = "profile";
      childProfileTab = viewChildProfileButton.dataset.openChildTab || "overview";
    } else {
      childManagementMode = "list";
      childProfileTab = "overview";
    }
    activeChildObservationEditId = "";
    activeChildProfileEditId = "";
    activeObservationChildLock = "";
    renderChildManagement();
    return;
  }

  const editChildProfileButton = event.target.closest("[data-edit-child-profile]");
  if (editChildProfileButton) {
    event.preventDefault();
    activeChildProfileEditId = editChildProfileButton.dataset.editChildProfile;
    selectedChildId = activeChildProfileEditId;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    childManagementMode = "edit";
    renderChildManagement();
    return;
  }

  const childAiSuggestionsButton = event.target.closest("[data-child-ai-suggestions]");
  if (childAiSuggestionsButton) {
    event.preventDefault();
    if (!canUseAi()) {
      showProFeatureModal(aiLimitMessage(), "limit");
      return;
    }
    const records = childRecords();
    const child = records.children.find((item) => item.id === childAiSuggestionsButton.dataset.childAiSuggestions);
    if (!child) return;
    const output = document.querySelector(`#childAiSuggestions-${domSafeId(child.id)}`);
    if (output) output.innerHTML = renderChildAiSuggestions(child, records);
    recordAiUse();
    childAiSuggestionsButton.textContent = "Ideas Ready";
    setTimeout(() => {
      childAiSuggestionsButton.textContent = "Give Me Ideas";
    }, 1400);
    return;
  }

  const childTabButton = event.target.closest("[data-child-tab]");
  if (childTabButton) {
    event.preventDefault();
    childProfileTab = childTabButton.dataset.childTab || "overview";
    childManagementMode = "profile";
    renderChildManagement();
    return;
  }

  const openChildToolsButton = event.target.closest("[data-open-child-tools]");
  if (openChildToolsButton) {
    event.preventDefault();
    selectedChildId = openChildToolsButton.dataset.openChildTools;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    childManagementMode = "tools";
    childToolsTab = "attendance";
    activeObservationChildLock = "";
    setView(childToolViewForTab(childToolsTab));
    return;
  }

  const childToolTabButton = event.target.closest("[data-child-tool-tab]");
  if (childToolTabButton) {
    event.preventDefault();
    childToolsTab = childToolTabButton.dataset.childToolTab || "attendance";
    childManagementMode = "tools";
    activeObservationChildLock = "";
    setView(childToolViewForTab(childToolsTab));
    return;
  }

  const quickObservationButton = event.target.closest("[data-quick-add-observation]");
  if (quickObservationButton) {
    event.preventDefault();
    selectedChildId = quickObservationButton.dataset.quickAddObservation;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    childManagementMode = "observe";
    activeChildObservationEditId = "";
    activeObservationChildLock = selectedChildId;
    pendingObservationArea = quickObservationButton.dataset.goalArea || "";
    renderChildManagement();
    return;
  }

  const editChildObservationButton = event.target.closest("[data-edit-child-observation]");
  if (editChildObservationButton) {
    event.preventDefault();
    const observation = childRecords().observations.find((item) => item.id === editChildObservationButton.dataset.editChildObservation);
    if (!observation) return;
    selectedChildId = observation.childId;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    activeChildObservationEditId = observation.id;
    childManagementMode = "observe";
    activeObservationChildLock = observation.childId;
    pendingObservationArea = "";
    renderChildManagement();
    return;
  }

  const duplicateChildObservationButton = event.target.closest("[data-duplicate-child-observation]");
  if (duplicateChildObservationButton) {
    event.preventDefault();
    const observations = childStore("Observations");
    const observation = observations.find((item) => item.id === duplicateChildObservationButton.dataset.duplicateChildObservation);
    if (!observation) return;
    if (!isProUser() && observations.length >= freeObservationRecordLimit) {
      showProFeatureModal(`You've reached your Free Plan limit of ${freeObservationRecordLimit} observations.`, "limit");
      return;
    }
    const copy = {
      ...observation,
      id: `Observations-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      text: `${observation.text || ""}`,
    };
    saveChildStore("Observations", [...observations, copy]);
    renderChildManagement();
    return;
  }

  const deleteChildObservationButton = event.target.closest("[data-delete-child-observation]");
  if (deleteChildObservationButton) {
    event.preventDefault();
    if (!window.confirm("Delete this observation?")) return;
    saveChildStore("Observations", childStore("Observations").filter((item) => item.id !== deleteChildObservationButton.dataset.deleteChildObservation));
    renderChildManagement();
    return;
  }

  const generateObservationIdeasButton = event.target.closest("[data-generate-observation-ideas]");
  if (generateObservationIdeasButton) {
    event.preventDefault();
    const form = generateObservationIdeasButton.closest("form");
    const formData = new FormData(form);
    const child = childRecords().children.find((item) => item.id === formData.get("childId"));
    const selectedAreas = formData.getAll("areas").map((area) => normalizeObservationArea(area) || area).filter(Boolean);
    const area = selectedAreas[0] || "Approaches to Learning";
    const ideas = suggestedActivitiesForArea(area, child).slice(0, 4);
    const nextStep = nextStepForArea(area, child);
    const output = form.querySelector("#observationIdeasOutput");
    if (output) {
      output.innerHTML = `
        <strong>${escapeHtml(area)} ideas for ${escapeHtml(child?.name || "this child")}</strong>
        <p>Look for: ${escapeHtml(strengthForArea(area, child?.name || "The child"))}</p>
        <p>Next step: ${escapeHtml(nextStep)}</p>
        ${renderChipList(ideas)}
      `;
    }
    const note = form.querySelector('textarea[name="text"]');
    if (note && !note.value.trim()) {
      note.value = `${child?.name || "The child"} practiced ${area.toLowerCase()} skills during play. I noticed engagement, effort, and growing confidence while using the materials.`;
    }
    const nextSteps = form.querySelector('textarea[name="nextSteps"]');
    if (nextSteps && !nextSteps.value.trim()) nextSteps.value = nextStep;
    return;
  }

  const scrollChildGoalsButton = event.target.closest("[data-scroll-child-goals]");
  if (scrollChildGoalsButton) {
    event.preventDefault();
    document.querySelector("#childGoalsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const goalPickerChildButton = event.target.closest("[data-goal-picker-child]");
  if (goalPickerChildButton) {
    event.preventDefault();
    selectedChildId = goalPickerChildButton.dataset.goalPickerChild;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    childManagementMode = "goals";
    renderChildManagement();
    return;
  }

  const startGoalAreaButton = event.target.closest("[data-start-goal-area]");
  if (startGoalAreaButton) {
    event.preventDefault();
    selectedChildId = startGoalAreaButton.dataset.childId || selectedChildId;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    pendingGoalArea = startGoalAreaButton.dataset.startGoalArea || "";
    childManagementMode = "profile";
    childProfileTab = "goals";
    renderChildManagement();
    return;
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
    const area = normalizeObservationArea(resource.tags.find((tag) => learningAreas.includes(tag)) || resource.tags[0]) || "Cognitive Development";
    appendChildRecord("Observations", enrichObservationRecord({
      childId: child.id,
      date: new Date().toISOString().slice(0, 10),
      area,
      text: resource.observationText || resource.description,
      nextSteps: resource.nextSteps || "Continue observing and offer a similar activity with one small added challenge.",
      sourceResourceId: resource.id,
    }, child));
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
    printTextDocument(`${planner.theme || "Weekly"} Plan`, plannerExportText(planner));
  }

  const clearPlannerButton = event.target.closest("#clearPlannerButton");
  if (clearPlannerButton) {
    saveWeeklyPlanner(defaultPlanner());
    renderWeeklyPlanner();
  }

  const useCurrentWeekButton = event.target.closest("#useCurrentWeekButton");
  if (useCurrentWeekButton) {
    const planner = currentWeekPlanner(weeklyPlanner());
    saveWeeklyPlanner(planner);
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
    trackEvent("generated_print", { title: result.title, tool: result.toolId || "generator" });
    printGeneratedResult(result);
  }

  const downloadOutputButton = event.target.closest("#downloadOutputButton");
  if (downloadOutputButton) {
    if (!isProUser()) {
      showProFeatureModal("Saving generated AI content as a printable PDF is a Pro feature.");
      return;
    }
    const result = currentGeneratedResult();
    if (!result) return;
    trackEvent("generated_pdf", { title: result.title, tool: result.toolId || "generator" });
    printTextDocument(result.title, result.text);
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
    trackEvent("provider_tool_pdf", { title });
    printTextDocument(title, text);
  }

  const openSelectedGoalFormButton = event.target.closest("[data-open-selected-goal-form]");
  if (openSelectedGoalFormButton) {
    event.preventDefault();
    const records = childRecords();
    const child = selectedChild(records);
    if (!child) {
      childManagementMode = "add";
      renderChildManagement();
      return;
    }
    selectedChildId = child.id;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    childManagementMode = "profile";
    childProfileTab = "goals";
    renderChildManagement();
    return;
  }

  const generateGoalSupportButton = event.target.closest("[data-generate-goal-support]");
  if (generateGoalSupportButton) {
    event.preventDefault();
    const records = childRecords();
    const child = records.children.find((item) => item.id === generateGoalSupportButton.dataset.childId);
    if (!child) return;
    const goal = childActiveGoals(child, records).find((item) => item.id === generateGoalSupportButton.dataset.generateGoalSupport);
    if (!goal) return;
    const output = document.querySelector(`#goalSupportIdeas-${domSafeId(goal.id)}`);
    if (output) output.innerHTML = renderGoalSupportIdeasOutput(child, { ...goal, childId: child.id }, records);
    generateGoalSupportButton.textContent = "Ideas Generated";
    setTimeout(() => {
      generateGoalSupportButton.textContent = "Generate Support Ideas";
    }, 1400);
    return;
  }

  const generateGoalPrintableButton = event.target.closest("[data-generate-goal-printable]");
  if (generateGoalPrintableButton) {
    event.preventDefault();
    const records = childRecords();
    const child = records.children.find((item) => item.id === generateGoalPrintableButton.dataset.childId);
    if (!child) return;
    const goal = childActiveGoals(child, records).find((item) => item.id === generateGoalPrintableButton.dataset.generateGoalPrintable);
    if (!goal) return;
    const recommendations = goalRecommendations(child, { ...goal, childId: child.id }, records);
    const resource = recommendations.professionalPrintableFallback || professionalGoalPrintableResource(child, goal, recommendations.area);
    openGeneratedPrintableResource(resource);
    generateGoalPrintableButton.textContent = "Printable Ready";
    setTimeout(() => {
      generateGoalPrintableButton.textContent = "Generate Professional Printable";
    }, 1400);
    return;
  }

  const completeGoalButton = event.target.closest("[data-complete-goal]");
  if (completeGoalButton) {
    if (!isProUser()) {
      showProFeatureModal("Development goal tracking is a Pro feature.");
      return;
    }
    const goals = childStore("Goals").map((goal) => goal.id === completeGoalButton.dataset.completeGoal ? { ...goal, progress: "100%" } : goal);
    saveChildStore("Goals", goals);
    renderChildManagement();
  }

  const updateGoalProgressButton = event.target.closest("[data-update-goal-progress]");
  if (updateGoalProgressButton) {
    event.preventDefault();
    if (!isProUser()) {
      showProFeatureModal("Development goal tracking is a Pro feature.");
      return;
    }
    const goals = childStore("Goals").map((goal) => {
      if (goal.id !== updateGoalProgressButton.dataset.updateGoalProgress) return goal;
      const nextProgress = Math.min(100, goalProgressPercent(goal.progress) + 25);
      return { ...goal, progress: `${nextProgress}%`, updatedAt: new Date().toISOString() };
    });
    saveChildStore("Goals", goals);
    renderChildManagement();
    return;
  }

  const buildDailyReportButton = event.target.closest("[data-build-daily-report]");
  if (buildDailyReportButton) {
    if (!isProUser()) {
      showProFeatureModal("Daily reports are a Pro feature.");
      return;
    }
    buildDailyReportFromChild(buildDailyReportButton.dataset.buildDailyReport);
  }

  const openPortfolioButton = event.target.closest("[data-open-portfolio]");
  if (openPortfolioButton) {
    if (!isProUser()) {
      showProFeatureModal("Child portfolios are a Pro feature.");
      return;
    }
    renderChildPortfolioPage(openPortfolioButton.dataset.openPortfolio);
  }

  const backToChildrenButton = event.target.closest("[data-back-to-children]");
  if (backToChildrenButton) {
    activePortfolioChildId = "";
    renderChildManagement();
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

  const refreshAnalyticsButton = event.target.closest("#refreshAnalyticsButton, [data-refresh-analytics]");
  if (refreshAnalyticsButton) {
    adminAnalyticsCache = null;
    loadAdminAnalyticsFromBackend();
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
  if (event.target.matches("#childDobInput")) {
    updateChildAgePreview();
  }
  if (event.target.matches("#childObservationSearch")) {
    childObservationSearch = event.target.value;
    renderChildManagement();
  }
  if (event.target.matches("#childObservationDate")) {
    childObservationDateFilter = event.target.value;
    renderChildManagement();
  }
  if (event.target.matches("#portfolioObservationSearch")) {
    childPortfolioSearch = event.target.value;
    if (activePortfolioChildId) renderChildPortfolioPage(activePortfolioChildId);
  }
  if (event.target.matches("#portfolioObservationDate")) {
    childPortfolioDateFilter = event.target.value;
    if (activePortfolioChildId) renderChildPortfolioPage(activePortfolioChildId);
  }
  if (event.target.matches("#supportCenterSearch")) {
    supportCenterSearch = event.target.value;
    activeSupportCategoryId = "";
    activeSupportTopicId = "";
    renderSupportCenterPage();
  }
  if (event.target.matches("#checkoutPromoCodeInput")) {
    saveCheckoutPromoCode(event.target.value);
    const panel = event.target.closest(".promo-code-panel");
    const summary = panel?.querySelector(".muted-copy");
    if (summary) summary.textContent = checkoutPromoSummary();
    setPromoCodeMessage("", false, panel);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("#childDobInput")) {
    updateChildAgePreview();
  }
  if (event.target.matches("#monthlyObservationGoalSelect")) {
    const customWrap = document.querySelector("#customMonthlyObservationGoalWrap");
    customWrap?.classList.toggle("hidden-field", event.target.value !== "custom");
  }
  if (event.target.matches("#childObservationArea")) {
    childObservationAreaFilter = event.target.value;
    renderChildManagement();
  }
  if (event.target.matches("#childToolsChildSelect")) {
    selectedChildId = event.target.value;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    childManagementMode = "tools";
    renderChildManagement();
  }
  if (event.target.matches("#supportCenterChildSelect")) {
    activeSupportChildId = event.target.value;
    selectedChildId = activeSupportChildId;
    localStorage.setItem("llhSelectedChild", selectedChildId);
    renderSupportCenterPage();
  }
  if (event.target.matches("#portfolioObservationArea")) {
    childPortfolioAreaFilter = event.target.value;
    if (activePortfolioChildId) renderChildPortfolioPage(activePortfolioChildId);
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

document.querySelector("#signinButton")?.addEventListener("click", () => {
  trackEvent("login_click");
  if (currentUser) {
    setView("account");
    return;
  }
  openAuthModal("login");
});

document.querySelector("#signupButton")?.addEventListener("click", () => {
  trackEvent("signup_click");
  if (currentUser) {
    setView(isProUser() ? "account" : "plans");
    return;
  }
  openAuthModal("signup");
});

document.querySelector("#closeModal")?.addEventListener("click", () => {
  closeAuthModal();
});

document.querySelector("#forgotPasswordButton")?.addEventListener("click", () => setAuthMode("forgot"));

document.querySelector("#switchAuthModeButton")?.addEventListener("click", () => {
  if (currentAuthMode === "forgot") {
    setAuthMode("login");
    return;
  }
  setAuthMode(currentAuthMode === "signup" ? "login" : "signup");
});

document.querySelector("#closeProModal")?.addEventListener("click", closeProFeatureModal);

// -------------------------------------------------------
// Feature Preview Modal
// -------------------------------------------------------
const featurePreviewModal = document.querySelector("#featurePreviewModal");
const featurePreviewTitle = document.querySelector("#featurePreviewTitle");
const featurePreviewEyebrow = document.querySelector("#featurePreviewEyebrow");
const featurePreviewBody = document.querySelector("#featurePreviewBody");
const closeFeaturePreviewButton = document.querySelector("#closeFeaturePreviewModal");
const FEATURE_PREVIEW_FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const featurePreviewContent = {
  "child-profiles": {
    eyebrow: "Preview",
    title: "Child Profiles",
    html: `<div class="fp-screen">
      <div class="fp-screen-bar"><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-screen-title">Child Profiles — Little Learner Hub</span></div>
      <div class="fp-screen-body">
        <aside class="fp-sidebar">
          <div class="fp-nav active">Children</div>
          <div class="fp-nav">Observations</div>
          <div class="fp-nav">Lessons</div>
          <div class="fp-nav">AI Tools</div>
        </aside>
        <div class="fp-main">
          <div class="fp-stat-row">
            <div class="fp-stat"><strong>3</strong><span>Profiles</span></div>
            <div class="fp-stat"><strong>2</strong><span>Active Goals</span></div>
            <div class="fp-stat"><strong>8</strong><span>Observations</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Child Profiles</div>
            <div class="fp-row"><span class="fp-avatar">E</span><span><strong>Emma, Age 3</strong> — Preschooler</span><span class="fp-tag">Active</span></div>
            <div class="fp-row"><span class="fp-avatar">L</span><span><strong>Liam, Age 2</strong> — Toddler</span><span class="fp-tag">Active</span></div>
            <div class="fp-row"><span class="fp-avatar">S</span><span><strong>Sofia, Age 4</strong> — Preschooler</span><span class="fp-tag">Active</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Emma — Profile Details</div>
            <div class="fp-field"><label>Age Group</label><div class="fp-field-value">Preschooler (3–5 years)</div></div>
            <div class="fp-field"><label>Enrolled</label><div class="fp-field-value">September 2024</div></div>
            <div class="fp-field"><label>Primary Goals</label><div class="fp-field-value">Fine Motor · Language · Social-Emotional</div></div>
          </div>
        </div>
      </div>
    </div>`,
  },
  "observation-tracker": {
    eyebrow: "Preview",
    title: "Observation Tracker",
    html: `<div class="fp-screen">
      <div class="fp-screen-bar"><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-screen-title">Observation Tracker — Little Learner Hub</span></div>
      <div class="fp-screen-body">
        <aside class="fp-sidebar">
          <div class="fp-nav">Children</div>
          <div class="fp-nav active">Observations</div>
          <div class="fp-nav">Lessons</div>
          <div class="fp-nav">AI Tools</div>
        </aside>
        <div class="fp-main">
          <div class="fp-stat-row">
            <div class="fp-stat"><strong>8</strong><span>This Month</span></div>
            <div class="fp-stat"><strong>3</strong><span>Children</span></div>
            <div class="fp-stat"><strong>5</strong><span>Areas Covered</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Recent Observations</div>
            <div class="fp-row"><span class="fp-avatar">E</span><div><strong>Emma — Fine Motor</strong><br><small>Stacking blocks with both hands, showing improving grip.</small></div><span class="fp-tag">Fine Motor</span></div>
            <div class="fp-row"><span class="fp-avatar">L</span><div><strong>Liam — Language</strong><br><small>Used 3-word sentences during play with peers.</small></div><span class="fp-tag purple">Language</span></div>
            <div class="fp-row"><span class="fp-avatar">S</span><div><strong>Sofia — Social</strong><br><small>Shared toys independently and invited a friend to play.</small></div><span class="fp-tag gold">Social</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">New Observation</div>
            <div class="fp-field"><label>Child</label><div class="fp-field-value">Emma</div></div>
            <div class="fp-field"><label>Developmental Area</label><div class="fp-field-value">Fine Motor</div></div>
            <div class="fp-field"><label>Observation Note</label><div class="fp-field-value">Emma demonstrated strong pincer grasp while threading beads...</div></div>
          </div>
        </div>
      </div>
    </div>`,
  },
  "lesson-plans": {
    eyebrow: "Preview",
    title: "Lesson Plans",
    html: `<div class="fp-screen">
      <div class="fp-screen-bar"><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-screen-title">Lesson Plans — Little Learner Hub</span></div>
      <div class="fp-screen-body">
        <aside class="fp-sidebar">
          <div class="fp-nav">Children</div>
          <div class="fp-nav">Observations</div>
          <div class="fp-nav active">Lessons</div>
          <div class="fp-nav">AI Tools</div>
        </aside>
        <div class="fp-main">
          <div class="fp-stat-row">
            <div class="fp-stat"><strong>5</strong><span>Plans Available</span></div>
            <div class="fp-stat"><strong>3</strong><span>Age Groups</span></div>
            <div class="fp-stat"><strong>12</strong><span>Activities</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Saved Lesson Plans</div>
            <div class="fp-row"><span>🌿</span><div><strong>Spring Nature Walk</strong><br><small>Preschoolers · Science &amp; Outdoor</small></div><span class="fp-tag">Saved</span></div>
            <div class="fp-row"><span>🎨</span><div><strong>Sensory Color Mixing</strong><br><small>Toddlers · Fine Motor &amp; Art</small></div><span class="fp-tag purple">New</span></div>
            <div class="fp-row"><span>📖</span><div><strong>Storytime with Puppets</strong><br><small>All Ages · Language &amp; Literacy</small></div><span class="fp-tag">Saved</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Spring Nature Walk — Plan Details</div>
            <div class="fp-field"><label>Age Group</label><div class="fp-field-value">Preschoolers (3–5 years)</div></div>
            <div class="fp-field"><label>Learning Goal</label><div class="fp-field-value">Explore seasonal changes, practice observation skills, build vocabulary.</div></div>
            <div class="fp-field"><label>Materials</label><div class="fp-field-value">Magnifying glass · Collection bags · Field journal · Crayons</div></div>
          </div>
        </div>
      </div>
    </div>`,
  },
  "ai-tools": {
    eyebrow: "Preview",
    title: "AI Tools",
    html: `<div class="fp-screen">
      <div class="fp-screen-bar"><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-screen-title">AI Tools — Little Learner Hub</span></div>
      <div class="fp-screen-body">
        <aside class="fp-sidebar">
          <div class="fp-nav">Children</div>
          <div class="fp-nav">Observations</div>
          <div class="fp-nav">Lessons</div>
          <div class="fp-nav active">AI Tools</div>
        </aside>
        <div class="fp-main">
          <div class="fp-stat-row">
            <div class="fp-stat"><strong>10+</strong><span>AI Generators</span></div>
            <div class="fp-stat"><strong>7</strong><span>Used This Month</span></div>
            <div class="fp-stat"><strong>3</strong><span>Remaining</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Generate Observation Note</div>
            <div class="fp-field"><label>Child</label><div class="fp-field-value">Emma — Age 3</div></div>
            <div class="fp-field"><label>Developmental Area</label><div class="fp-field-value">Fine Motor</div></div>
            <div class="fp-field"><label>What did you notice?</label><div class="fp-field-value">Emma threaded 6 beads without help today.</div></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">✨ AI Generated Output</div>
            <div class="fp-ai-output">During a structured fine motor activity, Emma demonstrated focused concentration and developing dexterity as she independently threaded six beads onto a string. This skill highlights Emma's growing hand-eye coordination and perseverance. Next steps: introduce smaller beads or lacing cards to continue building precision.</div>
          </div>
        </div>
      </div>
    </div>`,
  },
  "portfolio-builder": {
    eyebrow: "Preview — Pro Feature",
    title: "Portfolio Builder",
    html: `<div class="fp-screen">
      <div class="fp-screen-bar"><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-screen-title">Portfolio Builder — Little Learner Hub Pro</span></div>
      <div class="fp-screen-body">
        <aside class="fp-sidebar">
          <div class="fp-nav">Children</div>
          <div class="fp-nav">Observations</div>
          <div class="fp-nav">Lessons</div>
          <div class="fp-nav active">Portfolios</div>
        </aside>
        <div class="fp-main">
          <div class="fp-stat-row">
            <div class="fp-stat"><strong>3</strong><span>Portfolios</span></div>
            <div class="fp-stat"><strong>24</strong><span>Entries</span></div>
            <div class="fp-stat"><strong>2</strong><span>Shared</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Emma's Portfolio — Fall 2024</div>
            <p class="fp-desc">A compiled record of Emma's development including observations, goals, and highlights to share with families.</p>
            <div class="fp-row"><span>📝</span><span>8 Observations Included</span><span class="fp-tag">Language</span></div>
            <div class="fp-row"><span>🎯</span><span>3 Goals Tracked</span><span class="fp-tag purple">Fine Motor</span></div>
            <div class="fp-row"><span>⭐</span><span>2 Monthly Highlights</span><span class="fp-tag gold">Social</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Developmental Summary — Emma</div>
            <div class="fp-field"><label>Fine Motor Progress</label>
              <div class="fp-progress-bar-wrap"><div class="fp-progress-bar" style="width:75%"></div></div>
            </div>
            <div class="fp-field"><label>Language Progress</label>
              <div class="fp-progress-bar-wrap"><div class="fp-progress-bar" style="width:60%"></div></div>
            </div>
            <div class="fp-field"><label>Social-Emotional</label>
              <div class="fp-progress-bar-wrap"><div class="fp-progress-bar" style="width:85%"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>`,
  },
  "goals-progress": {
    eyebrow: "Preview",
    title: "Goals & Progress",
    html: `<div class="fp-screen">
      <div class="fp-screen-bar"><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-screen-title">Goals &amp; Progress — Little Learner Hub</span></div>
      <div class="fp-screen-body">
        <aside class="fp-sidebar">
          <div class="fp-nav">Children</div>
          <div class="fp-nav active">Goals</div>
          <div class="fp-nav">Lessons</div>
          <div class="fp-nav">Reports</div>
        </aside>
        <div class="fp-main">
          <div class="fp-stat-row">
            <div class="fp-stat"><strong>6</strong><span>Active Goals</span></div>
            <div class="fp-stat"><strong>4</strong><span>In Progress</span></div>
            <div class="fp-stat"><strong>2</strong><span>Achieved</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Emma — Active Goals</div>
            <div class="fp-row"><span>🎯</span><div><strong>Fine Motor: Pincer Grasp</strong><br><small>Started Sept 2024</small></div><span class="fp-tag">In Progress</span></div>
            <div class="fp-row"><span>🎯</span><div><strong>Language: 4-Word Sentences</strong><br><small>Started Oct 2024</small></div><span class="fp-tag purple">In Progress</span></div>
            <div class="fp-row"><span>🎯</span><div><strong>Social: Cooperative Play</strong><br><small>Achieved Nov 2024</small></div><span class="fp-tag gold">✓ Done</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Progress Overview</div>
            <div class="fp-field"><label>Fine Motor</label>
              <div class="fp-progress-bar-wrap"><div class="fp-progress-bar" style="width:70%"></div></div>
            </div>
            <div class="fp-field"><label>Language</label>
              <div class="fp-progress-bar-wrap"><div class="fp-progress-bar" style="width:55%"></div></div>
            </div>
            <div class="fp-field"><label>Social-Emotional</label>
              <div class="fp-progress-bar-wrap"><div class="fp-progress-bar" style="width:90%"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>`,
  },
  "forms-paperwork": {
    eyebrow: "Preview",
    title: "Forms & Paperwork",
    html: `<div class="fp-screen">
      <div class="fp-screen-bar"><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-dot"></span><span class="fp-screen-title">Forms &amp; Paperwork — Little Learner Hub</span></div>
      <div class="fp-screen-body">
        <aside class="fp-sidebar">
          <div class="fp-nav">Children</div>
          <div class="fp-nav">Observations</div>
          <div class="fp-nav">Lessons</div>
          <div class="fp-nav active">Forms</div>
        </aside>
        <div class="fp-main">
          <div class="fp-stat-row">
            <div class="fp-stat"><strong>50+</strong><span>Forms</span></div>
            <div class="fp-stat"><strong>12</strong><span>Categories</span></div>
            <div class="fp-stat"><strong>Free</strong><span>&amp; Pro</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Forms Library</div>
            <div class="fp-row"><span>📋</span><div><strong>Enrollment Form</strong><br><small>Editable · Enrollment &amp; Registration</small></div><span class="fp-tag">Editable</span></div>
            <div class="fp-row"><span>📋</span><div><strong>Emergency Contact Card</strong><br><small>PDF · Child Info &amp; Medical Notes</small></div><span class="fp-tag purple">PDF</span></div>
            <div class="fp-row"><span>📋</span><div><strong>Incident Report</strong><br><small>Editable · Accident Documentation</small></div><span class="fp-tag">Editable</span></div>
            <div class="fp-row"><span>📋</span><div><strong>Parent Handbook Template</strong><br><small>Editable · Program Policies</small></div><span class="fp-tag gold">Pro</span></div>
          </div>
          <div class="fp-card">
            <div class="fp-card-title">Enrollment Form — Details</div>
            <div class="fp-field"><label>Type</label><div class="fp-field-value">Editable Word Document</div></div>
            <div class="fp-field"><label>Category</label><div class="fp-field-value">Enrollment &amp; Registration</div></div>
            <div class="fp-field"><label>Access</label><div class="fp-field-value">Free Plan Included</div></div>
          </div>
        </div>
      </div>
    </div>`,
  },
};

let featurePreviewTrigger = null;

function isFeaturePreviewOpen() {
  return featurePreviewModal?.getAttribute("aria-hidden") === "false";
}

function featurePreviewFocusableElements() {
  if (!featurePreviewModal) return [];
  return [...featurePreviewModal.querySelectorAll(FEATURE_PREVIEW_FOCUSABLE_SELECTOR)]
    .filter((element) => !element.disabled && !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function openFeaturePreview(previewId, triggerEl = null) {
  const content = featurePreviewContent[previewId];
  if (!content || !featurePreviewModal || !featurePreviewTitle || !featurePreviewEyebrow || !featurePreviewBody || !closeFeaturePreviewButton) return;
  featurePreviewTrigger = triggerEl || document.activeElement || null;
  featurePreviewEyebrow.textContent = content.eyebrow;
  featurePreviewTitle.textContent = content.title;
  featurePreviewBody.innerHTML = content.html;
  featurePreviewModal.classList.add("open");
  featurePreviewModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("auth-modal-open");
  featurePreviewTitle.focus();
}

function closeFeaturePreview() {
  if (!featurePreviewModal) return;
  featurePreviewModal.classList.remove("open");
  featurePreviewModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-modal-open");
  featurePreviewBody.innerHTML = "";
  if (featurePreviewTrigger && typeof featurePreviewTrigger.focus === "function") {
    featurePreviewTrigger.focus();
  }
  featurePreviewTrigger = null;
}

closeFeaturePreviewButton?.addEventListener("click", closeFeaturePreview);

featurePreviewModal?.addEventListener("click", (event) => {
  if (event.target === featurePreviewModal) closeFeaturePreview();
});

document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-preview]");
  if (card) {
    event.preventDefault();
    openFeaturePreview(card.dataset.preview, card);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isFeaturePreviewOpen()) {
    closeFeaturePreview();
    return;
  }
  if (event.key === "Tab" && isFeaturePreviewOpen()) {
    const focusable = featurePreviewFocusableElements();
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!focusable.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && event.target.closest("[data-preview]")) {
    event.preventDefault();
    const card = event.target.closest("[data-preview]");
    openFeaturePreview(card.dataset.preview, card);
  }
});

document.querySelector("#proModalUpgrade")?.addEventListener("click", () => {
  startProTrial();
});

document.querySelector("#proModalDismiss")?.addEventListener("click", closeProFeatureModal);

document.querySelector("#authForm")?.addEventListener("submit", async (event) => {
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
      updateAccount(result.email, {
        signupAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        selectedPlanAtSignup: currentPlan,
      });
      await syncSubscriptionFromBackend(result.email);
      await syncChildDataFromBackend();
      trackEvent("account_signup_complete", { email: result.email, plan: currentPlan, source: trafficSource() });
      setFormMessage("#authMessage", result.message || "Account created.", true);
    } else {
      const result = await loginWithProvider(email, password);
      loadAccountState(result.email);
      markAccountLogin(result.email);
      await syncSubscriptionFromBackend(result.email);
      await syncChildDataFromBackend();
      trackEvent("account_login_complete", { email: result.email, plan: currentPlan });
    }
    closeAuthModal();
    setView("children");
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

document.querySelector("#uploadForm")?.addEventListener("submit", async (event) => {
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

document.querySelector("#adminCancelEdit")?.addEventListener("click", resetAdminForm);

document.querySelector("#adminAddDemo")?.addEventListener("click", addDemoAdminResource);

document.querySelector("#adminSearchInput")?.addEventListener("input", renderAdminDashboard);

document.querySelector("#adminCategoryFilter")?.addEventListener("change", renderAdminDashboard);

document.querySelector("#demoAccountButton")?.addEventListener("click", () => {
  loadAccountState("demo@littlelearnerhub.com");
  renderAccountPage();
});

document.querySelector("#accountUpgradeButton")?.addEventListener("click", () => {
  if (!currentUser) {
    openAuthModal("signup");
    return;
  }
  setView(isProUser() ? "billing" : "upgrade");
});

document.querySelector("#accountCancelButton")?.addEventListener("click", () => {
  setView("cancel-subscription");
});

document.querySelector("#signOutButton")?.addEventListener("click", signOut);

document.querySelector("#resendVerificationButton")?.addEventListener("click", async () => {
  setFormMessage("#profileSettingsMessage", "Sending...", true);
  try {
    const message = await resendVerificationEmail();
    setFormMessage("#profileSettingsMessage", message, true);
    renderAccountPage();
  } catch (error) {
    setFormMessage("#profileSettingsMessage", friendlyAuthError(error));
  }
});

document.querySelector("#profileSettingsForm")?.addEventListener("submit", (event) => {
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

document.querySelector("#changePasswordForm")?.addEventListener("submit", async (event) => {
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

document.querySelector("#resetPasswordForm")?.addEventListener("submit", async (event) => {
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

document.querySelector("#aiChatForm")?.addEventListener("submit", (event) => {
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
  trackEvent("ai_generation_success", { tool: "chat", promptLength: prompt.length, plan: currentPlan, backendUsed: false });
  promptBox.value = "";
});

document.querySelector("#preferencesForm")?.addEventListener("submit", (event) => {
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
    trackEvent("ai_generation_success", { tool: toolId, plan: currentPlan, backendUsed: Boolean(result.backendUsed), used: result.used, limit: result.limit });
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
  const form = event.target;
  const data = collectFormData(form);
  const editId = data.childId || activeChildProfileEditId || "";
  if (!editId && !isProUser() && childStore("Profiles").length >= freeChildProfileLimit) {
    showProFeatureModal("You've reached your Free Plan limit of 3 child profiles.", "limit");
    return;
  }
  const formData = new FormData(form);
  const photoFile = formData.get("photo");
  const goalAreas = Array.from(new Set(formData.getAll("goalAreas").map((area) => String(area || "").trim()).filter(Boolean)));
  const supportAreas = Array.from(new Set(formData.getAll("supportAreas").map((area) => String(area || "").trim()).filter(Boolean)));
  const existing = editId ? childStore("Profiles").find((item) => item.id === editId) : null;
  const photo = photoFile?.name ? await fileToDataUrl(photoFile) : "";
  const monthlyGoal = data.monthlyObservationGoal === "custom" ? data.customMonthlyObservationGoal : data.monthlyObservationGoal;
  const age = calculateAgeFromDob(data.dob) || data.age;
  const child = {
    ...(existing || {}),
    id: editId || `child-${Date.now()}`,
    name: data.name,
    ageGroup: normalizeAgeGroup(data.ageGroup) || ageGroupFromDob(data.dob) || data.ageGroup,
    age,
    dob: data.dob,
    enrollmentDate: data.enrollmentDate,
    classroom: data.classroom,
    monthlyObservationGoal: monthlyGoal || "4",
    observationsRequiredPerMonth: monthlyGoal || "4",
    parentInfo: data.parentInfo,
    emergency: data.emergency,
    allergies: data.allergies,
    medical: data.medical,
    photo: photo || existing?.photo || "",
    goalAreas,
    supportAreas,
    activeGoals: data.activeGoals,
    notes: data.notes,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const children = childStore("Profiles");
  saveChildStore("Profiles", editId ? children.map((item) => item.id === editId ? child : item) : [...children, child]);
  selectedChildId = child.id;
  localStorage.setItem("llhSelectedChild", selectedChildId);
  childManagementMode = "profile";
  childProfileTab = "overview";
  activeChildProfileEditId = "";
  form.reset();
  renderChildManagement();
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#childObservationForm")) return;
  event.preventDefault();
  const form = event.target;
  const data = collectFormData(form);
  const formData = new FormData(form);
  const selectedAreas = formData.getAll("areas").map((area) => normalizeObservationArea(area) || area).filter(Boolean);
  const child = childRecords().children.find((item) => item.id === data.childId);
  if (!child) {
    childManagementMode = "list";
    renderChildManagement();
    return;
  }
  const record = enrichObservationRecord({
    ...data,
    childId: child.id,
    childName: child.name,
    area: selectedAreas[0] || data.area || "Approaches to Learning",
    categories: selectedAreas.length ? Array.from(new Set(selectedAreas)) : undefined,
  }, child);
  const observations = childStore("Observations");
  if (data.observationId || activeChildObservationEditId) {
    const editId = data.observationId || activeChildObservationEditId;
    saveChildStore("Observations", observations.map((item) => item.id === editId ? {
      ...item,
      ...record,
      id: editId,
      updatedAt: new Date().toISOString(),
    } : item));
  } else {
    if (!isProUser() && observations.length >= freeObservationRecordLimit) {
      showProFeatureModal(`You've reached your Free Plan limit of ${freeObservationRecordLimit} observations.`, "limit");
      return;
    }
    saveChildStore("Observations", [...observations, {
      id: `Observations-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...record,
    }]);
  }
  selectedChildId = child.id;
  localStorage.setItem("llhSelectedChild", selectedChildId);
  activeChildObservationEditId = "";
  activeObservationChildLock = "";
  pendingObservationArea = "";
  childProfileTab = "observations";
  childManagementMode = "profile";
  renderChildManagement();
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#supportPlanForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Individual child support plans are a Pro feature.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("SupportPlans", { ...data, title: `${data.area} Support Plan`, summary: `${data.goal} | ${data.status}` });
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#childGoalForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Development goal tracking is a Pro feature.");
    return;
  }
  const data = collectFormData(event.target);
  childProfileTab = "goals";
  pendingGoalArea = "";
  appendChildRecord("Goals", { ...data, title: `${data.area} Goal`, summary: `${data.goal} | ${data.progress}` });
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
  appendChildRecord("Attendance", { ...data, title: `${data.date} | ${data.status}`, summary: `Drop-off: ${data.dropoff || "not entered"} | Pick-up: ${data.pickup || "not entered"}` });
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#mealTrackingForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Meal tracking is a Pro feature.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("Meals", { ...data, title: `Meals | ${data.date}`, summary: `Breakfast: ${data.breakfast || ""} | Lunch: ${data.lunch || ""} | Snack: ${data.snack || ""}` });
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("#communicationForm")) return;
  event.preventDefault();
  if (!isProUser()) {
    showProFeatureModal("Parent communication tools are Pro features.");
    return;
  }
  const data = collectFormData(event.target);
  appendChildRecord("Communications", { ...data, title: `${data.type} | ${data.date}`, summary: data.message });
});

installMobileNavigation();

if (currentUser) {
  loadAccountState(currentUser);
} else {
  updateAuthButtons();
  updatePlanLabel();
}
document.body.classList.add("home-view");
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
    await syncSubscriptionFromBackend(currentUser, { renderFounding: true });
    await syncChildDataFromBackend({ render: true });
  }
  await syncFoundingStatus({ render: true });
  const initialView = initialViewFromLocation();
  if (!currentAttribution()?.firstSeenAt) {
    saveAttribution({ route: window.location.pathname || window.location.hash || "home", view: initialView, source: trafficSource() });
  }
  trackEvent("website_visit", { view: initialView, source: trafficSource() });
  if (initialView === "home") trackEvent("page_view", { view: "home" });
  if (initialView !== "home") {
    const route = window.location.pathname || window.location.hash;
    saveAttribution({ route, view: initialView });
    trackEvent("ad_route_visit", { route, view: initialView });
    setView(initialView);
  }
}

initializeAppView();

if (canUseLaunchBackend()) {
  setInterval(() => {
    syncFoundingStatus({ render: true });
  }, 60000);
}
