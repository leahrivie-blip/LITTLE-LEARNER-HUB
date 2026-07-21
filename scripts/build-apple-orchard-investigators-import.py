#!/usr/bin/env python3
"""Build the Apple Orchard Investigators Preschool Pro import file."""
from pathlib import Path
import re

OUT = Path(__file__).resolve().parent / "curriculum-preschool-fall-imports/01-preschool-apple-orchard-investigators-pro.txt"


def act(
    name,
    category,
    objective,
    description,
    domains,
    materials,
    setup,
    role,
    language,
    directions,
    goals,
    observations,
    vocab,
    extensions,
    adaptations,
    safety,
    age_mod,
):
    lang = "\n".join(language) if isinstance(language, list) else language
    dirs = "\n".join(f"{i + 1}. {step}" for i, step in enumerate(directions))
    return f"""ACTIVITY_NAME:
{name}
CATEGORY:
{category}
OBJECTIVE:
{objective}
DESCRIPTION:
{description}
LEARNING_DOMAINS:
{domains}
MATERIALS:
{materials}
SETUP:
{setup}
TEACHER_ROLE:
{role}
TEACHER_LANGUAGE:
{lang}
DIRECTIONS:
{dirs}
LEARNING_GOALS:
{goals}
OBSERVATION_OPPORTUNITIES:
{observations}
VOCABULARY:
{vocab}
EXTENSIONS:
{extensions}
ADAPTATIONS:
{adaptations}
SAFETY_NOTES:
{safety}
AGE_MODIFICATIONS:
{age_mod}
"""


def day(
    theme,
    objectives,
    vocab,
    materials,
    domains,
    books,
    songs,
    circle,
    transitions,
    outdoor,
    family,
    observations,
    adaptations,
    safety,
    activities,
):
    obj = "\n".join(objectives)
    circ = "\n".join(circle)
    trans = "\n".join(transitions)
    obs = "\n".join(observations) if isinstance(observations, list) else observations
    body = "\n".join(activities)
    return f"""DAILY_THEME:
{theme}

DAILY_OBJECTIVES:
{obj}

DAILY_VOCABULARY:
{vocab}

DAILY_MATERIALS:
{materials}

DAILY_LEARNING_DOMAINS:
{domains}

DAILY_BOOKS:
{books}

DAILY_SONGS:
{songs}

CIRCLE_TIME:
{circ}

TRANSITIONS:
{trans}

OUTDOOR_PLAY:
{outdoor}

DAILY_FAMILY_CONNECTION:
{family}

DAILY_OBSERVATIONS:
{obs}

DAILY_ADAPTATIONS:
{adaptations}

DAILY_SAFETY_NOTES:
{safety}

{body}"""


monday_acts = [
    act(
        "Apple Investigation Lab",
        "STEM/Discovery",
        "Children will use multiple senses and simple tools to observe, compare, and describe apples.",
        "Children rotate through a calm investigation area where they look closely at whole apples, explore texture with hands or tools, smell near the stem, listen while an apple is gently tapped, and record discoveries through drawing, marks, dictation, gesture, or photographs.",
        "Science, Language & Literacy, Physical Development, Social Emotional",
        "Washed whole apples in varied colors and sizes; trays; magnifying glasses; clipboards; paper; crayons; picture vocabulary cards; optional balance scale.",
        "Place two or three contrasting apples on individual trays. Add magnifiers, paper, and description cards. Limit materials so observation stays focused and tools can be shared safely.",
        "Model how to look closely without telling children what they should notice. Accept all forms of communication, write down child words, support tool-sharing, and invite children to compare ideas across observations.",
        [
            "What do you notice first?",
            "How does this apple feel? What makes you say that?",
            "What is the same about these apples? What is different?",
            "What could we use to look even closer?",
            "You may touch it, use a tool, look, or draw. Which way works for you?",
        ],
        [
            "Invite children to choose one apple and observe it before using any tools.",
            "Offer a magnifying glass and model moving it slowly over the skin, stem, and blossom end.",
            "Encourage children to describe or indicate color, shape, texture, smell, and size.",
            "Place a second apple nearby and invite comparison.",
            "Let each child record one discovery through drawing, marks, dictation, gesture, or a teacher-taken photo.",
            "Add discoveries to a shared “What We Notice About Apples” chart.",
        ],
        "Use senses and tools for observation.\nCommunicate descriptive information.\nCompare visible and tactile properties.\nPractice sustained attention and shared tool use.",
        "Does the child attend to more than one feature?\nDoes the child use or understand comparison words?\nHow does the child communicate sensory preferences?\nDoes the child use the magnifier purposefully?",
        "investigate, observe, smooth, bumpy, shiny, firm, stem, skin",
        "Invite children to draw the apple from two different angles.\nAdd a scale and ask which apple might be heavier before testing.\nPhotograph close-up skin patterns and match photos to the correct apple.",
        "Use a stand magnifier, large apple photographs, or a sealed sensory bag.\nOffer a simple two-column same/different board.\nProvide extra wait time and sentence starters such as “I notice…”",
        "Keep whole apples on trays so they do not roll into walkways. Supervise magnifier use and sanitize shared materials as required.",
        "For younger preschoolers, focus on choosing between two describing words. For older preschoolers, invite detailed comparison sentences, labeled drawings, or a question they want to investigate later.",
    ),
    act(
        "Apple Taste Test Without Pressure",
        "Sensory Play",
        "Children will compare optional apple samples and communicate preferences using respectful language.",
        "Children may taste small allergy-safe pieces of different apple varieties or participate by smelling, looking, touching with a utensil, or matching sample colors. The focus is investigation rather than finishing food or choosing a “best” apple.",
        "Science, Language & Literacy, Social Emotional",
        "Allergy-safe apple slices prepared according to program policy; serving tongs; plates or cups; napkins; color cards; preference chart; handwashing materials; non-tasting alternatives such as whole apples and photos.",
        "Set a calm tasting or investigating table with clearly labeled samples. Post a visual reminder that tasting is optional. Provide a parallel non-food investigation option at the same table.",
        "Protect every child’s right not to taste. Model polite preference language, manage allergy and sanitation protocols, and celebrate looking, smelling, and describing as equal investigation strategies.",
        [
            "You can taste, smell, look, or compare with a utensil.",
            "What do you notice before you decide?",
            "Is this sample sweeter, tarter, juicier, or crunchier to you?",
            "How can we show our preference without saying someone else’s choice is wrong?",
        ],
        [
            "Review allergy, family-permission, and sanitation rules before beginning.",
            "Invite children to wash hands and choose a participation method.",
            "Offer one sample at a time and pause for description before the next.",
            "Record preferences, describing words, and questions on a class chart.",
            "Thank every investigator, including children who did not taste.",
            "Clean and sanitize according to program procedures.",
        ],
        "Practice respectful food exploration.\nUse descriptive sensory language.\nMake and communicate personal choices.\nFollow classroom safety routines.",
        "Does the child communicate preference clearly?\nWhich senses does the child use?\nDoes the child respect peers’ different choices?\nDoes the child use new taste or texture words?",
        "taste, smell, juicy, crisp, sweet, tart, preference, optional",
        "Graph class preferences with picture markers.\nCompare a cooked apple sample only if approved and clearly labeled.\nInvite children to invent a fair tasting rule for the class.",
        "Provide scent-only or look-only stations.\nUse picture cards for “like,” “not for me,” and “still noticing.”\nOffer seated participation and utensil-only touching.",
        "Follow all allergy, choking, sanitation, and family-permission policies. Never require tasting. Cut food to safe sizes and supervise closely.",
        "Younger preschoolers may compare only two samples. Older preschoolers can record results with tallies, labels, or simple charts.",
    ),
    act(
        "Collaborative Orchard Mural",
        "Art",
        "Children will contribute apple and orchard details to a shared mural using process art techniques.",
        "Children add trees, leaves, baskets, and apple prints or painted apples to a large mural. The mural grows across the week and becomes a documentation wall for questions and discoveries.",
        "Creative Arts, Social Emotional, Physical Development, Language & Literacy",
        "Large butcher paper; red, green, yellow, brown, and white washable paint; sponges; apple halves for adult-supervised printing if desired; brushes; crayons; collage paper; glue; leaf shapes; name labels.",
        "Tape mural paper at child height. Set paint and collage materials on trays. Leave open sky and pathway space so the composition stays readable.",
        "Protect process over product. Invite children to choose where and how to contribute, narrate peer cooperation, and add child quotes beside their work with permission.",
        [
            "Where should your apple tree grow?",
            "What colors do you notice in the orchard?",
            "How can we leave space for a friend’s idea?",
            "What discovery should we write beside this part?",
        ],
        [
            "Invite children to choose a mural role such as tree painter, leaf maker, apple printer, or label writer.",
            "Demonstrate one open-ended technique without a model product.",
            "Support children as they add details and negotiate shared space.",
            "Add optional labels, arrows, or dictated captions.",
            "Pause for a gallery walk and notice teamwork.",
            "Plan one blank area for later-week discoveries.",
        ],
        "Strengthen fine-motor control.\nContribute to a shared project.\nRepresent orchard ideas visually.\nUse art language and planning talk.",
        "How does the child approach shared space?\nDoes the child persist through multi-step art?\nWhat orchard vocabulary appears during making?\nDoes the child describe their contribution?",
        "mural, orchard, contribute, print, collage, branch, leaf, pathway",
        "Add a photograph station of real apples beside the mural.\nInvite families to send one optional orchard or fruit word to include.\nCreate a small portable mural strip for a child who needs a personal workspace.",
        "Offer larger brushes, stampers, seated workboards, and pre-cut collage shapes.\nAllow pointing to choose placement while an adult assists motor steps.",
        "Use washable paint, cover floors, and supervise any adult-cut apple printing. Watch for slipping paint water.",
        "Younger preschoolers may stamp or sponge simple shapes. Older preschoolers can plan sections, make signs, or create a mural key.",
    ),
]

tuesday_acts = [
    act(
        "Apple Sorting Challenge",
        "Math",
        "Children will sort apple materials by one or more observable attributes and explain or show their rule.",
        "Children sort real or pretend apples, counters, and pictures by color, size, type, or a child-invented rule. They may re-sort using a new rule and compare group quantities.",
        "Math, Language & Literacy, Social Emotional, Physical Development",
        "Red, green, and yellow apples or manipulatives; sorting trays; muffin tins; labels; picture attribute cards; numeral cards; baskets.",
        "Prepare several sorting trays with mixed apple materials. Keep attribute cards visible. Provide enough materials for parallel play.",
        "Ask children to show or tell their sorting rule before naming it for them. Support flexible thinking when a child changes a rule mid-sort.",
        [
            "What is the same about the apples in this group?",
            "Can you sort them a different way?",
            "How do you know these belong together?",
            "Which group has more, fewer, or the same?",
        ],
        [
            "Invite children to explore the mixed apples before sorting.",
            "Ask each child or pair to create groups using a rule they choose.",
            "Encourage children to explain, point to, or demonstrate the rule.",
            "Invite a re-sort using a new attribute.",
            "Compare quantities across groups.",
            "Photograph or record one sorting rule for documentation.",
        ],
        "Classify by observable attributes.\nExplain or demonstrate a sorting rule.\nCompare quantities.\nFlexibly revise a rule.",
        "Does the child sort by one clear attribute?\nCan the child change rules?\nDoes the child compare group sizes?\nHow does the child communicate the rule?",
        "sort, group, color, size, rule, more, fewer, same, compare",
        "Invite children to invent a silly rule and test whether peers can guess it.\nAdd graphing after sorting.\nInclude weight sorting with a balance scale.",
        "Limit to two categories at first.\nUse color mats and larger manipulatives.\nAccept nonverbal demonstration of the rule.",
        "Sanitize materials and keep walkways clear of rolling apples.",
        "Younger preschoolers sort by one attribute. Older preschoolers can use two attributes or create labeled category signs.",
    ),
    act(
        "How Big Is an Apple?",
        "STEM/Discovery",
        "Children will compare apple size and weight using nonstandard measurement and a balance scale.",
        "Children measure apple circumference or height with cubes or yarn, compare weight on a balance scale, and record which apple is heavier, lighter, taller, or rounder.",
        "Math, Science, Language & Literacy, Physical Development",
        "Apples of different sizes; balance scale; linking cubes; yarn; child-safe measuring tape; clipboards; recording sheets; crayons; trays.",
        "Set a measurement station with two or three contrasting apples, a scale, and recording tools. Model gentle placement on the scale.",
        "Focus on comparison language and fair testing. Avoid rushing to “correct” answers; help children check and revise.",
        [
            "Which apple looks heavier? How could we check?",
            "How many cubes tall is this apple?",
            "What happens if we measure around the middle?",
            "Did your prediction match what happened?",
        ],
        [
            "Invite a prediction about which apple is heavier or larger.",
            "Measure height or length with cubes or yarn.",
            "Compare weight on the balance scale.",
            "Record results with drawings, tallies, or dictated words.",
            "Invite children to choose a new apple and repeat.",
            "Discuss whether eyes alone were enough to decide.",
        ],
        "Use nonstandard measurement.\nCompare weight and size.\nMake and revise predictions.\nRecord mathematical ideas.",
        "Does the child use comparison words?\nDoes the child measure with one-to-one attention?\nDoes the child revise a prediction after evidence?\nHow does the child record results?",
        "measure, balance, heavier, lighter, taller, round, predict, compare",
        "Order three apples from lightest to heaviest.\nMeasure a classmate’s hand span against an apple.\nCreate a class book of measurement discoveries.",
        "Provide hand-over-hand support, larger cubes, and a picture recording board with heavier/lighter icons.",
        "Supervise scale use and prevent apples from falling on feet. Keep cords and yarn short.",
        "Younger preschoolers compare two apples. Older preschoolers can order three or more and explain the test.",
    ),
    act(
        "Orchard Workers Dramatic Play",
        "Dramatic Play",
        "Children will take on orchard roles, cooperate to complete jobs, and use functional math and literacy in pretend play.",
        "Children create an orchard workplace with pickers, sorters, drivers, inspectors, and market helpers. They pack baskets, fill orders, make signs, and solve simple teamwork problems.",
        "Social Emotional, Language & Literacy, Math, Physical Development",
        "Baskets; crates; pretend apples; bags; order pads; crayons; signs; aprons; name tags; toy trucks; blocks; pretend money; role cards.",
        "Arrange a picking area, packing table, and delivery path. Place duplicate high-demand props and visual role cards at child height.",
        "Observe before entering play. Join as a customer or coworker to extend language, counting, and cooperation without taking over the story.",
        [
            "What does your job involve?",
            "The market ordered six apples. What should we do?",
            "How will you know these are ready to deliver?",
            "How can both of you use the truck?",
        ],
        [
            "Invite children to choose or invent orchard roles.",
            "Offer a simple starter problem such as a large order or mixed apples that need sorting.",
            "Support children as they pack, count, label, and deliver.",
            "Encourage writing, drawing, or marking orders and signs.",
            "Pause to solve a peer conflict with choices.",
            "Reflect briefly on how the team worked together.",
        ],
        "Negotiate roles and sustain shared play.\nUse counting in meaningful contexts.\nPractice functional writing and signs.\nSolve social problems with peers.",
        "Note role flexibility, symbolic use of materials, peer language, quantity use, and conflict-resolution strategies.",
        "worker, picker, inspector, order, pack, deliver, market, team",
        "Add price signs, receipts, maps, customer requests, or a repair station.\nCreate a bilingual label set for common props.",
        "Use visual role badges, short scripted phrases, duplicate props, and nonverbal jobs such as transporter or sign holder.",
        "Avoid strings around necks and overloaded crates. Keep pathways clear for safe carrying.",
        "Younger preschoolers engage in simple picking and carrying. Older preschoolers coordinate multi-step orders and changing roles.",
    ),
]

wednesday_acts = [
    act(
        "Apple Dissection Investigation",
        "STEM/Discovery",
        "Children will observe the inside of an apple and identify basic parts such as skin, flesh, stem, core, and seeds.",
        "An adult cuts an apple crosswise and lengthwise for safe observation. Children predict what they will see, examine parts with magnifiers, count seeds, and record the cross-section.",
        "Science, Math, Language & Literacy, Physical Development",
        "Apples; adult knife kept out of child reach; trays; magnifiers; chart paper; paper; crayons; apple-part picture cards; tweezers for seed transfer if appropriate.",
        "Prepare a protected adult cutting area. Seat children where everyone can see. Provide individual observation trays after cutting.",
        "Keep cutting as an adult-only job. Invite predictions, wait for child ideas, and use accurate part names without turning the moment into a quiz.",
        [
            "What do you predict we will see inside?",
            "Where is the skin? Where is the flesh?",
            "How many seeds can we count?",
            "Does the star shape appear in both cuts?",
        ],
        [
            "Invite predictions and record them.",
            "Show a whole apple and review outside features.",
            "Adult cuts one apple crosswise and one lengthwise.",
            "Children observe, point to, and name parts.",
            "Count seeds and compare the two cuts.",
            "Children draw or stamp a cross-section record.",
        ],
        "Identify apple parts.\nPractice prediction and observation.\nCount with one-to-one correspondence.\nRepresent a science discovery.",
        "Does the child use or recognize part names?\nDoes the child compare prediction with evidence?\nHow accurately does the child count seeds?\nDoes the child represent the star pattern?",
        "skin, flesh, stem, core, seed, cross-section, predict, observe",
        "Make a simple parts diagram with movable labels.\nCompare a second variety’s seed count.\nDry a few seeds for a later planting invitation if program policy allows.",
        "Offer photographs for children who prefer not to view wet interiors.\nUse large labels and pointing responses.\nProvide pre-drawn circles for children to fill with seed marks.",
        "Adults only handle knives. Follow allergy and sanitation rules. Supervise seed use to prevent mouthing by children who still mouth objects.",
        "Younger preschoolers focus on two or three parts. Older preschoolers can compare cuts, count seeds, and explain the star pattern.",
    ),
    act(
        "Apple Print Pattern Studio",
        "Art",
        "Children will create repeating or growing patterns using apple prints and fall colors.",
        "Children dip adult-cut apple halves into washable paint and stamp patterns on paper. They may copy, extend, or invent AB, ABC, or growing patterns and describe their pattern rule.",
        "Creative Arts, Math, Physical Development, Language & Literacy",
        "Adult-cut apple halves; washable red, green, yellow, and brown paint; trays; paper; smocks; pattern strips; wet wipes; optional cork or sponge stampers as alternatives.",
        "Set paint trays with one color each. Provide paper and a few sample pattern strips without requiring children to copy them.",
        "Protect experimentation. Discuss pattern ideas without requiring a prescribed craft product.",
        [
            "What comes next in your pattern?",
            "How did you decide the order?",
            "Can you make the same pattern with different colors?",
            "What name should we give your pattern?",
        ],
        [
            "Invite children to explore stamping before making a pattern.",
            "Offer a challenge to make a repeating pattern.",
            "Support children who want to extend or read their pattern aloud.",
            "Encourage cleaning a stamp between colors if they want clear prints.",
            "Display finished work with child-dictated pattern rules.",
            "Invite a peer to continue someone’s pattern with permission.",
        ],
        "Create and describe patterns.\nStrengthen fine-motor stamping control.\nUse math language in art.\nMake independent creative choices.",
        "Does the child create a recognizable pattern?\nCan the child describe or continue the pattern?\nHow does the child manage stamping pressure and spacing?",
        "pattern, repeat, print, stamp, next, AB pattern, color",
        "Make pattern necklaces with paper apple shapes.\nGraph how many prints were used.\nTry printing with different apple orientations.",
        "Offer sponge stampers, larger paper, and hand-over-hand support.\nProvide pattern cards with only two elements.",
        "Adults prepare apple halves. Supervise paint use and clean slippery floors promptly.",
        "Younger preschoolers may stamp freely or use two-color repeats. Older preschoolers can create complex patterns and record the rule.",
    ),
    act(
        "Build an Apple Model",
        "Fine Motor",
        "Children will construct a three-dimensional apple model and talk about its parts.",
        "Children use play dough, loose parts, and recycled materials to build apples with skin, stem, leaf, and optional seed details. They compare models and explain choices.",
        "Physical Development, Science, Creative Arts, Language & Literacy",
        "Play dough in apple colors; brown pipe cleaners or short sticks for stems; green paper leaves; beads or seeds for representation if safe; trays; plastic knives/spreaders; example photographs—not model products.",
        "Prepare dough and loose parts on trays. Offer photographs of apples as references rather than a sample product children must copy.",
        "Support planning and fine-motor problem-solving. Ask about parts and choices rather than correcting for realism.",
        [
            "Which part will you make first?",
            "How can you make the stem stay?",
            "Where would the seeds be if we opened it?",
            "What color mixture did you create?",
        ],
        [
            "Invite children to plan which apple parts to include.",
            "Offer dough and loose parts for building.",
            "Support pinching, rolling, pressing, and attaching.",
            "Encourage children to name parts on their model.",
            "Invite a comparison walk among peers’ models.",
            "Photograph models for portfolios with permission.",
        ],
        "Strengthen hand muscles and coordination.\nRepresent science ideas in 3D.\nUse part vocabulary.\nPlan and revise a construction.",
        "Which fine-motor strategies appear?\nDoes the child include multiple apple parts?\nDoes the child explain design choices?",
        "model, stem, leaf, skin, core, attach, pinch, roll",
        "Build a whole orchard of dough trees and apples.\nAdd number labels for seed counts.\nCreate a stop-motion growth sequence with photos.",
        "Provide pre-rolled dough balls, larger stems, and adaptive spreaders.\nAllow a flat collage apple as an alternative model.",
        "Avoid small beads for children who mouth objects. Supervise stick stems and sanitize dough tools.",
        "Younger preschoolers make simple round apples with stems. Older preschoolers can open a model to show seeds or create a before-and-after cut apple.",
    ),
]

thursday_acts = [
    act(
        "Apple Browning Investigation",
        "STEM/Discovery",
        "Children will test what happens to cut apples over time and compare covered, uncovered, and lemon-water samples when approved.",
        "Children observe apple slices under different conditions, predict changes, check results, and discuss why some slices brown faster. The investigation emphasizes careful looking and revising ideas.",
        "Science, Math, Language & Literacy, Social Emotional",
        "Fresh apple slices prepared by an adult; clear cups or trays; lemon juice or water if approved; plastic wrap or lids; timers or schedule cards; clipboards; crayons; chart paper.",
        "Prepare labeled trays: uncovered, covered, and lemon-water if allowed. Place recording sheets nearby. Keep tasting separate from the science samples unless approved.",
        "Guide fair testing language. Help children wait, observe, and compare without giving the scientific explanation too early.",
        [
            "What do you predict will happen to each slice?",
            "Which sample changed first?",
            "What is different about the covered apple?",
            "What new idea do you have now?",
        ],
        [
            "Show freshly cut slices and invite predictions.",
            "Place slices into labeled conditions.",
            "Children draw or describe the starting look.",
            "Return later to observe and compare.",
            "Record which sample changed most and least.",
            "Discuss ideas and remaining questions.",
        ],
        "Make and revise predictions.\nCompare changes over time.\nParticipate in a fair test.\nCommunicate science ideas.",
        "Does the child recall the prediction?\nDoes the child notice color or texture change?\nDoes the child use time words such as first, next, later?",
        "change, brown, predict, compare, cover, observe, timer, evidence",
        "Take photos for a time sequence book.\nTest room temperature versus cool storage if practical.\nInvite children to invent a way to keep apple snacks looking fresh.",
        "Provide picture prediction cards and a simple most/least changed chart.\nAllow children to observe without drawing.",
        "Adults prepare slices. Follow allergy rules. Do not leave lemon juice where it can irritate eyes. Supervise closely.",
        "Younger preschoolers compare two conditions. Older preschoolers can help plan a third test and explain their evidence.",
    ),
    act(
        "Apple Mash and Mix",
        "Sensory Play",
        "Children will explore how apples change when mashed, mixed, or combined with safe ingredients during a supervised sensory cooking invitation.",
        "Children use tools to mash soft cooked apple or unsweetened applesauce if approved, compare textures, and describe changes from chunky to smooth. Non-food dough or fabric alternatives are available for children who prefer not to use food materials.",
        "Science, Physical Development, Language & Literacy, Social Emotional",
        "Program-approved applesauce or soft cooked apple; potato mashers; bowls; spoons; cinnamon optional only if allowed; trays; smocks; non-food mash alternative such as soft dough.",
        "Set a mash station with limited seats, tools, and clear visual steps. Provide a parallel non-food sensory tray.",
        "Keep the invitation calm and optional. Narrate texture changes and support children who prefer tools instead of hands.",
        [
            "What do you notice as we mash?",
            "Is it becoming smoother or chunkier?",
            "Which tool works better for you?",
            "How does this feel different from a whole apple?",
        ],
        [
            "Review participation choices and hygiene steps.",
            "Invite children to mash with a preferred tool.",
            "Pause to compare textures and describe changes.",
            "Offer an optional sprinkle of cinnamon only if approved and desired.",
            "Clean hands and tools together.",
            "Dictate or draw one change the child noticed.",
        ],
        "Explore texture change.\nStrengthen arm and hand muscles.\nUse descriptive language.\nFollow multi-step routines.",
        "Which tools does the child prefer?\nWhat texture words appear?\nDoes the child tolerate or avoid sticky textures?\nHow does the child sequence clean-up?",
        "mash, mix, smooth, chunky, texture, change, tool, stir",
        "Compare warm and cool applesauce if safe.\nMake a simple recipe card with child photos.\nGraph favorite textures.",
        "Offer utensils only, gloves, or a dry dough alternative.\nShorten the activity and provide a wipe nearby.",
        "Follow allergy, heat, and sanitation rules. Use only food approved by the program. Supervise all tasting separately from sensory exploration if needed.",
        "Younger preschoolers focus on mashing and describing. Older preschoolers can sequence a simple recipe card and compare two textures.",
    ),
    act(
        "Recipe Sequence Theater",
        "Dramatic Play",
        "Children will retell and act out a simple apple recipe or orchard-to-table sequence.",
        "Children use props and picture sequence cards to act out washing, cutting by an adult, mashing, tasting optional samples, and sharing. They negotiate roles and practice ordinal language.",
        "Language & Literacy, Social Emotional, Math, Creative Arts",
        "Picture sequence cards; pretend kitchen props; bowls; spoons; aprons; stuffed apple or pretend food; chart with first/next/then/last; optional book How to Make an Apple Pie and See the World.",
        "Place sequence cards in a pocket chart. Set a small pretend kitchen nearby with enough props for three to four children.",
        "Support storytelling language and turn-taking. Use the cards to help children repair sequence mistakes playfully.",
        [
            "What happens first?",
            "Who is the chef today?",
            "What do we do after we wash the apple?",
            "How can we share the steps so everyone has a turn?",
        ],
        [
            "Review the picture sequence together.",
            "Invite children to choose roles.",
            "Act out the recipe or orchard-to-table steps.",
            "Pause to check whether the sequence still makes sense.",
            "Encourage children to narrate for peers.",
            "Create a new optional step and decide where it belongs.",
        ],
        "Use ordinal vocabulary.\nRetell a sequence.\nNegotiate dramatic-play roles.\nConnect literacy and cooking routines.",
        "Does the child use first/next/last language?\nCan the child retell with pictures?\nHow does the child negotiate roles?",
        "first, next, then, last, recipe, sequence, chef, share",
        "Make a class recipe book with photos.\nAct out a delivery from orchard to market to kitchen.\nAdd written labels for each step.",
        "Provide only three sequence cards at first.\nAllow a child to hold the card while another acts.\nAccept nonverbal sequencing by ordering cards.",
        "No real knives in play. Keep pretend cooking distinct from any real food prep.",
        "Younger preschoolers act out three steps. Older preschoolers can write or draw a four- to five-step recipe.",
    ),
]

friday_acts = [
    act(
        "Child-Led Orchard Market",
        "Dramatic Play",
        "Children will plan and run an orchard market that uses counting, signs, cooperation, and customer service language.",
        "Children set up market stands with baskets, signs, and pretend products. They take orders, count apples, make choices about display, and celebrate the week’s learning through play.",
        "Social Emotional, Math, Language & Literacy, Creative Arts, Physical Development",
        "Baskets; crates; pretend apples and art apples from the week; signs; markers; bags; pretend money; order pads; aprons; role cards; blocks for stands.",
        "Clear a market space with room for sellers and customers. Display child-made signs and mural nearby for atmosphere.",
        "Let children lead the market design. Enter as a customer to request quantities, read signs, and prompt collaboration.",
        [
            "What will your stand sell today?",
            "How will customers know the price or amount?",
            "I need four apples. How will you pack them?",
            "How can you welcome a new customer?",
        ],
        [
            "Review the class market plan created at circle.",
            "Invite children to choose roles and set up stands.",
            "Open the market and support orders, counting, and signs.",
            "Rotate roles so children can buy and sell.",
            "Solve a spontaneous problem such as running out of bags.",
            "Close the market with a brief celebration and clean-up song.",
        ],
        "Plan and sustain cooperative play.\nUse counting and quantity language.\nCreate functional print.\nPractice welcoming social language.",
        "Does the child sustain a role?\nDoes the child use numbers in orders?\nHow does the child welcome or help peers?\nWhat print does the child create?",
        "market, customer, seller, price, order, display, welcome, pack",
        "Add a tasting-description booth using words only.\nCreate receipts and maps to the orchard.\nInvite another classroom for a short visiting market if schedules allow.",
        "Provide scripted welcome phrases and picture menus.\nOffer a quieter cashier seat and duplicate props.",
        "Keep aisles clear. Limit crowd size. Avoid money becoming a competition; focus on fair turns.",
        "Younger preschoolers sell and carry. Older preschoolers manage orders, change roles, and create more detailed signs.",
    ),
    act(
        "Design an Apple Carrier",
        "STEM/Discovery",
        "Children will design and test a carrier that can move apples safely from one place to another.",
        "Children use recycled materials to build baskets, bags, or carts, then test how many pretend apples the carrier can hold while walking a short delivery path.",
        "Science, Math, Physical Development, Social Emotional, Creative Arts",
        "Cardboard, paper bags, tape, string, cups, boxes, fabric, scissors, pretend apples, cones to mark a delivery path, clipboards.",
        "Set a building table and a short delivery test path. Provide a bin of loose parts and clear safety limits for string and load size.",
        "Encourage design, test, and revise cycles. Celebrate improvements rather than a single correct carrier.",
        [
            "What must your carrier do well?",
            "How will you keep apples from falling?",
            "What happened on the test walk?",
            "What will you change next?",
        ],
        [
            "Invite children to identify the problem: move apples without dropping them.",
            "Brainstorm carrier ideas with sketches or gestures.",
            "Build a first version with available materials.",
            "Test the carrier on the delivery path.",
            "Revise based on what happened.",
            "Share one design success or next idea with the group.",
        ],
        "Plan and revise a design.\nTest cause and effect.\nCount load capacity.\nPersist through a challenge.",
        "Does the child plan before building?\nHow does the child respond when apples fall?\nDoes the child revise the design?\nWhat counting appears during loading?",
        "design, carrier, test, revise, hold, deliver, strong, tip",
        "Compare carriers and graph how many apples each held.\nAdd a longer delivery route.\nCreate a delivery map.",
        "Offer partially built bases, larger materials, and partner building.\nAllow a child to be the tester while a peer builds.",
        "Avoid long neck strings and unstable towers. Keep loads light. Supervise scissors and walking tests.",
        "Younger preschoolers decorate and test a simple bag. Older preschoolers iterate multiple designs and record capacity.",
    ),
    act(
        "Our Apple Discoveries Book",
        "Language & Literacy",
        "Children will reflect on and communicate one discovery, question, or favorite investigation from the week.",
        "Children each create a page for a class book using drawing, collage, dictation, or photography. Pages are bound into an Apple Discoveries book for the library and family sharing.",
        "Language & Literacy, Creative Arts, Social Emotional, Science",
        "Paper; crayons; markers; collage scraps; glue; stapler or binder rings; child quote cards; photos from the week if permitted; alphabet stamps optional.",
        "Set a quiet book-making table with samples of blank page frames—not finished adult models. Display the wonder chart for inspiration.",
        "Scribe children’s words accurately. Honor home language and nonverbal contributions. Keep reflection joyful rather than evaluative.",
        [
            "What do you want friends to remember about apples?",
            "What question are you still wondering about?",
            "Which investigation surprised you?",
            "What should we write under your picture?",
        ],
        [
            "Review a few week highlights and open questions.",
            "Invite each child to choose one discovery, question, or favorite moment.",
            "Support drawing, collage, or photo selection.",
            "Dictate or write the child’s words on the page.",
            "Read several pages aloud with permission.",
            "Bind the class book and place it in the library.",
        ],
        "Reflect on learning.\nCommunicate ideas through drawing and words.\nContribute to a shared text.\nBuild identity as an investigator and author.",
        "What discovery does the child choose?\nHow detailed is the dictation or drawing?\nDoes the child connect to earlier investigations?",
        "discovery, author, remember, question, page, book, reflect",
        "Add a family response page.\nRecord children reading their page.\nCreate a digital slideshow version for families.",
        "Offer photo choices, sentence starters, and scribe support.\nAllow a child to choose a peer’s quote to illustrate.",
        "Use child-safe binders. Respect photo permissions.",
        "Younger preschoolers may dictate one word or short phrase. Older preschoolers can write letters, labels, or longer sentences.",
    ),
]


def main():
    header = """TITLE:
Apple Orchard Investigators

AGE_GROUP:
Preschool

THEME:
Apples and Early Fall

PLAN:
Pro

STATUS:
published

LEARNING_DOMAINS:
Social Emotional, Language & Literacy, Math, Science, Physical Development, Creative Arts

WEEKLY_OVERVIEW:
Preschool children become apple orchard investigators as they explore real and pretend apples through observation, sorting, counting, measuring, sensory play, dramatic play, art, movement, and simple science. The week begins with noticing apple features, moves into orchard jobs and harvesting play, investigates what is inside an apple, explores how apples change when prepared, and ends with a child-led orchard market celebration. Learning stays play-based and invitational: children compare, wonder, test ideas, cooperate, and represent discoveries in many ways. Tasting is always optional and follows program allergy, sanitation, and family-permission policies.

LEARNING_OBJECTIVES:
Children will describe apples using color, size, texture, smell, and shape words.
Children will identify basic apple parts, including skin, flesh, stem, core, and seeds.
Children will compare, sort, count, measure, and create simple patterns with apple-related materials.
Children will ask questions, make predictions, test ideas, and communicate observations.
Children will strengthen fine-motor control through grasping, transferring, drawing, stamping, and building.
Children will strengthen gross-motor coordination through carrying, balancing, reaching, and orchard movement play.
Children will use new vocabulary in conversation, storytelling, dramatic play, and group discussion.
Children will cooperate, take turns, negotiate roles, and care for shared materials.
Children will express ideas through process art, music, movement, construction, and documentation.
Children will connect classroom investigations to family fruit experiences without assuming every family shares the same traditions.

WEEKLY_MATERIALS:
Real apples in several colors and sizes; one apple reserved for adult cutting; apple and orchard photographs; magnifying glasses; balance scale; linking cubes; yarn; baskets; trays; bowls; tongs; scoops; chart paper; clipboards; paper; crayons; markers; washable red, green, yellow, brown, and white paint; sponges; play dough; cardboard and recycled building parts; pretend apples; toy trucks; aprons; order pads; pretend money; scarves; cones; sequence cards; allergy-safe tasting supplies when approved; cups; napkins; handwashing materials; visual supports; adaptive scissors and large-handled tools.

VOCABULARY:
apple, orchard, tree, seed, core, stem, skin, flesh, blossom, fruit, harvest, ripe, crisp, juicy, sweet, tart, smooth, bumpy, round, compare, sort, pattern, predict, observe, measure, balance, heavier, lighter, investigate, slice, change, market, customer

BOOKS:
Apples | Gail Gibbons | Use selected pages to introduce orchards, harvesting, and apple parts.
The Apple Pie Tree | Zoe Hall | Observe seasonal change from blossom to fruit.
Ten Apples Up On Top! | Dr. Seuss writing as Theo. LeSieg | Support counting, balance, and playful movement.
Apple Farmer Annie | Monica Wellington | Connect orchard work, products, and market play.
How to Make an Apple Pie and See the World | Marjorie Priceman | Support sequencing, ingredients, and imaginative storytelling.
Hello, World! How Do Apples Grow? | Jill McDonald | Offer accessible nonfiction for younger listeners.
A Day at the Apple Orchard | Megan Faulkner and Adam Krawesky | Connect to realistic orchard experiences.
Tap the Magic Tree | Christie Matheson | Invite participation around seasonal tree changes.

SONGS:
Way Up High in the Apple Tree | Traditional fingerplay | Add counting, reaching, shaking, and falling motions.
Five Red Apples | Traditional counting chant | Remove one felt apple during each verse.
Apples and Bananas | Traditional song | Play with vowel sounds and silly language.
The Farmer in the Dell | Traditional song | Adapt verses to orchard jobs such as picking, sorting, carrying, and selling.
This Is the Way We Pick the Apples | Teacher-adapted song | Add verses for wash, sort, carry, sell, and cook.
Apple Tree Movement Song | Teacher-created | Children curl like seeds, stretch like trees, sway like branches, and drop like ripe apples.

FAMILY_CONNECTION:
Invite families to share one optional response: a favorite way their family uses fruit, a photo from fruit shopping or cooking, or a short story about a fruit they enjoy. Make clear that any fruit counts and families do not need to buy or send food. Send home the conversation prompt: “What fruit do we eat or use at home, and what do we notice about it?” Optional home extension: count, sort, wash, or describe fruit during a normal routine. Do not require homework or documentation.

OBSERVATION_OPPORTUNITIES:
Document descriptive vocabulary during sensory exploration and optional tasting.
Note whether children sort by one attribute, change rules, or explain their reasoning.
Observe one-to-one counting during basket, seed, and market play.
Record measurement strategies for size, weight, and capacity.
Listen for predictions and revised ideas during investigations.
Observe fine-motor control with tongs, dough, stamps, scissors, and drawing tools.
Document cooperation, role negotiation, and problem-solving in orchard dramatic play.
Collect drawings, dictated explanations, photographs, and quotes for portfolios.
Honor communication through gesture, signs, pictures, home language, or assistive tools.

ADAPTATIONS:
Offer whole apples, pretend apples, photographs, or sealed sensory bags when food contact is not appropriate.
Provide large-handled tongs, adaptive scissors, thick crayons, non-slip mats, and pre-cut materials.
Use visual sequences, first-then language, modeled gestures, and short directions before combining steps.
Allow children to observe before touching, use tools instead of hands, or choose dry alternatives.
Provide seated, standing, and floor-level participation choices.
Use picture vocabulary cards and honor home-language or nonverbal responses.
Never require tasting; smelling, looking, drawing, and comparing are equal participation options.
Extend learning with numerals, invented sorting rules, multiple measurements, labels, or leadership roles.

"""

    days = [
        "MONDAY\n\n"
        + day(
            "Meet the Apple Investigators: Using Our Senses",
            [
                "Children will investigate apples using sight, touch, smell, and sound.",
                "Children will use descriptive words to compare two or more apples.",
                "Children will practice asking questions and recording observations.",
                "Children will cooperate while sharing tools and materials.",
            ],
            "investigate, observe, smooth, bumpy, shiny, dull, firm, soft, crisp, juicy, sweet, tart",
            "Several washed apples in different colors and sizes; trays; magnifying glasses; chart paper; markers; clipboards; crayons; paper; baskets; sensory description cards; optional allergy-safe apple slices; cups; napkins; mural paper and paint for afternoon art.",
            "Social Emotional, Language & Literacy, Science, Physical Development, Creative Arts",
            "Apples | Gail Gibbons | Read selected introductory pages and pause for predictions.",
            "Way Up High in the Apple Tree | Traditional fingerplay | Use slow motions and count imaginary apples.",
            [
                "Reveal a covered basket and invite children to predict what might be inside using clues such as round, grows on a tree, and can be red, green, or yellow.",
                "Introduce the word investigator and explain that investigators look closely, ask questions, and share what they notice.",
                "Pass one whole apple for careful observation while children offer describing words; record all communication forms on chart paper.",
                "Read selected pages from Apples by Gail Gibbons and compare book photographs with real apples.",
                "Sing Way Up High in the Apple Tree with reaching, shaking, and gentle falling motions.",
                "Explain that tasting is optional and that looking, smelling, touching with a tool, or drawing are also ways to investigate.",
            ],
            [
                "Invite children to move to centers by choosing an apple word or pointing to a picture card.",
                "Use the chant, “Red, green, yellow too, apple investigators know what to do.”",
                "Ask children to pretend to carry a tiny apple, medium apple, or giant apple while walking safely.",
            ],
            "Take clipboards outdoors or to a courtyard to look for round shapes, tree parts, or colors that match classroom apples. Offer a gentle apple-gather relay with beanbags if space allows.",
            "Send home the optional prompt: What fruit do we notice at home, and what words describe it?",
            [
                "Document descriptive words and questions during the investigation lab.",
                "Notice how children communicate preferences during optional tasting.",
                "Observe cooperation and shared space use at the mural.",
            ],
            "Offer sealed sensory bags, utensil-only exploration, and non-tasting roles. Provide adaptive tools and visual vocabulary cards.",
            "Follow allergy and sanitation policies. Keep floors dry after tasting or painting. Supervise magnifiers and mural traffic.",
            monday_acts,
        ),
        "TUESDAY\n\n"
        + day(
            "Orchard Jobs: Harvest, Sort, and Carry",
            [
                "Children will sort apples by observable attributes and explain or show a sorting rule.",
                "Children will compare size and weight using nonstandard measurement tools.",
                "Children will cooperate in orchard-themed dramatic play roles.",
                "Children will use counting and comparison language during meaningful work play.",
            ],
            "harvest, sort, group, measure, heavier, lighter, picker, pack, deliver, more, fewer",
            "Red, green, and yellow apple manipulatives; sorting trays; balance scale; linking cubes; yarn; baskets; crates; order pads; aprons; toy trucks; role cards; clipboards.",
            "Math, Science, Language & Literacy, Social Emotional, Physical Development",
            "Apple Farmer Annie | Monica Wellington | Connect orchard jobs and market work.",
            "This Is the Way We Pick the Apples | Teacher-adapted song | Add verses for sort, carry, and deliver.",
            [
                "Review Monday discoveries and introduce orchard jobs children can try today.",
                "Read Apple Farmer Annie and list jobs such as picker, sorter, packer, and seller.",
                "Model one sorting rule and invite children to invent another.",
                "Preview the measurement station and dramatic play orchard.",
                "Sing This Is the Way We Pick the Apples with job motions.",
                "Set a cooperation goal for packing and sharing tools.",
            ],
            [
                "Dismiss by orchard job picture card.",
                "Ask children to count three quiet steps like careful pickers.",
                "Use a short packing chant while lining up.",
            ],
            "Create an outdoor orchard path with cones and baskets for safe carrying and delivery races using beanbags or pretend apples.",
            "Invite families to notice how groceries are sorted at home or in a store—by type, size, or where they belong.",
            [
                "Observe sorting rules and whether children can re-sort.",
                "Note measurement strategies and prediction language.",
                "Document role negotiation in dramatic play.",
            ],
            "Limit sorting categories, provide visual role badges, and duplicate popular props. Offer seated measuring options.",
            "Keep delivery paths clear. Avoid overloaded baskets. Sanitize shared props.",
            tuesday_acts,
        ),
        "WEDNESDAY\n\n"
        + day(
            "Inside the Apple: Parts, Prints, and Models",
            [
                "Children will identify basic apple parts after a safe adult-led observation.",
                "Children will create and describe patterns with apple prints.",
                "Children will build a model apple and name its parts.",
                "Children will connect outside features to inside structures.",
            ],
            "skin, flesh, stem, core, seed, cross-section, pattern, model, star",
            "Apples for adult cutting; magnifiers; trays; paint and apple halves for printing; paper; play dough; stems and leaf loose parts; part cards; chart paper.",
            "Science, Math, Creative Arts, Physical Development, Language & Literacy",
            "Hello, World! How Do Apples Grow? | Jill McDonald | Support simple nonfiction talk about growth and parts.",
            "Five Red Apples | Traditional counting chant | Remove one felt apple each verse.",
            [
                "Begin with the wonder question: What might we find inside an apple?",
                "Record predictions before any cutting.",
                "Explain that only adults use knives and that everyone can observe safely.",
                "Read a short nonfiction selection about apple parts or growth.",
                "Preview the print studio and model-building invitations.",
                "Remind children that seeds are for looking and counting, not tasting, unless the program’s safe-food plan says otherwise.",
            ],
            [
                "Transition by naming an apple part from a picture card.",
                "Move like seeds tucked small, then trees stretching tall.",
                "Use a clean-up song while wiping observation trays.",
            ],
            "Search outdoors for seeds, pods, or tree parts to photograph and compare with apple seeds—look only, no collecting if not permitted.",
            "Share one optional photo of the class cross-section chart and ask families what fruit parts they notice at home.",
            [
                "Listen for accurate or emerging part vocabulary.",
                "Note pattern rules during printing.",
                "Observe fine-motor strategies while building models.",
            ],
            "Provide photos for children who prefer not to view wet interiors. Offer sponge stampers and pre-rolled dough.",
            "Adults only handle knives. Supervise seeds for children who mouth objects. Manage paint slip hazards.",
            wednesday_acts,
        ),
        "THURSDAY\n\n"
        + day(
            "Apples Change: Investigate, Mash, and Retell",
            [
                "Children will predict and observe how cut apples change over time.",
                "Children will explore texture changes through supervised mashing or a non-food alternative.",
                "Children will retell a simple recipe or orchard-to-table sequence.",
                "Children will use ordinal words such as first, next, and last.",
            ],
            "change, brown, predict, mash, smooth, chunky, first, next, last, recipe, evidence",
            "Apple slices for investigation; lids or wrap; lemon juice or water if approved; mashers; approved applesauce or soft cooked apple; sequence cards; pretend kitchen props; chart paper.",
            "Science, Language & Literacy, Physical Development, Social Emotional, Creative Arts",
            "How to Make an Apple Pie and See the World | Marjorie Priceman | Support sequencing and imaginative cooking talk.",
            "Apples and Bananas | Traditional song | Play with sound changes as a playful link to change over time.",
            [
                "Return to the week’s wonder chart and ask what still needs testing.",
                "Introduce the browning investigation as a fair test.",
                "Discuss that food experiences stay optional and policy-based.",
                "Read or retell a short cooking sequence from the featured book.",
                "Preview mash and recipe theater invitations.",
                "Set a class goal to use the words first, next, and last today.",
            ],
            [
                "Line up in a recipe order: washers, mashers, servers, cleaners.",
                "Clap a first-next-last pattern while transitioning.",
                "Carry imaginary pie pans with slow balancing steps.",
            ],
            "Take the browning clipboards outside and compare whether shade or sun changes how quickly a safe sample warms—not for eating. Keep food-safety rules clear.",
            "Send a simple optional sequence prompt: What is one food your family makes in steps?",
            [
                "Note whether children revise browning predictions.",
                "Observe sensory preferences during mash or alternatives.",
                "Document ordinal language in recipe theater.",
            ],
            "Offer look-only science roles, utensil-only mashing, and three-card sequences. Keep non-food sensory options visible.",
            "Adults prepare all real food. Follow allergy and sanitation rules. Separate science samples from tasting foods.",
            thursday_acts,
        ),
        "FRIDAY\n\n"
        + day(
            "Orchard Market Celebration: Share What We Discovered",
            [
                "Children will help plan and run a child-led orchard market.",
                "Children will design and test a carrier for moving apples.",
                "Children will contribute a page to a class discoveries book.",
                "Children will reflect on questions answered and questions still open.",
            ],
            "market, customer, seller, design, test, revise, discovery, author, celebrate, reflect",
            "Market props; signs; baskets; recycled building parts; pretend apples; paper for book pages; crayons; photos from the week; binder rings; role cards.",
            "Social Emotional, Math, Language & Literacy, Science, Creative Arts, Physical Development",
            "Ten Apples Up On Top! | Dr. Seuss writing as Theo. LeSieg | Celebrate counting and playful teamwork.",
            "Apple Tree Movement Song | Teacher-created | Retell the week from seed to harvest through movement.",
            [
                "Review the wonder chart: which questions did we answer, and which are still open?",
                "Invite children to help plan market spaces, roles, and fair rules.",
                "Read a short celebratory counting story.",
                "Preview the carrier challenge and discoveries book.",
                "Agree on one way the class will welcome customers kindly.",
                "End circle with the movement song from seed to harvest.",
            ],
            [
                "Open the market with a welcome chant.",
                "Transition to book-making with quiet investigator walking feet.",
                "Close the day by delivering the class book to the library shelf.",
            ],
            "Host an outdoor market pathway or parade where children deliver carriers along a cone route and wave to classmates as customers.",
            "Share a short learning summary with a child quote when permitted, plus the question: What did you discover about apples this week?",
            [
                "Observe counting and social language in the market.",
                "Note design-test-revise persistence with carriers.",
                "Collect discovery-book dictation for portfolios.",
            ],
            "Provide picture menus, partner roles, and pre-built carrier bases. Offer photo choices for book pages.",
            "Keep market aisles clear and loads light. Respect photo permissions for the class book.",
            friday_acts,
        ),
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = header + "\n".join(days) + "\n"
    OUT.write_text(text)
    names = re.findall(r"^ACTIVITY_NAME:\n(.+)$", text, re.M)
    print(f"wrote {OUT} lines={len(text.splitlines())} activities={len(names)}")
    print("\n".join(names))


if __name__ == "__main__":
    main()
