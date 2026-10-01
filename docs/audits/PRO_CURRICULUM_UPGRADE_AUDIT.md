# PRO Curriculum Upgrade Audit — Executive Report

Generated: 2026-08-20T14:13:59.403Z
Status: **READ-ONLY inventory complete. No production curriculum writes.**

## Scope snapshot

- Live Pro lessons: **118** (Infant 41 / Toddler 36 / Preschool 41)
- Priority 1 / 2 / 3: **7 / 105 / 6**
- Import-matched for field-level QA: **91/118**
- Covers needing realistic upgrade: **118/118** (nearly all are illustrated/storybook covers, not classroom photos)
- Pro lessons with linked printables in public resources: **4**
- Free lessons excluded (9 Free currently live, including Colors All Around Us, Black & White Discovery, Tiny Artist Studio, Construction Crew, Bugs & Butterflies, etc.)

## Cross-cutting findings

1. **Teaching Kit premium depth is the main gap** — many plans parse as structurally complete but lack questions/prompts, prep checklists, cleanup, duration, image direction, and non-generic objectives.
2. **Five toddler Pro theme weeks are 100% generic AI-template wording** (objective/description/setup echo the activity title). These are Priority 1 major rebuilds: Pet Vet Clinic, Zoo Adventures, Camping Under the Stars, Pirate Adventure, Superhero Training Camp.
3. **All 118 Pro covers** should eventually use a realistic activity/example image from that lesson (current alts commonly say “Illustration for …”).
4. **Printables/resources are sparse** on Pro (public library shows only 4 Pro lessons with linked printable-like resources).
5. **27 Pro lessons** (mostly `cur-lp-19fb…` IDs) have no matched Master Paste in-repo — admin hydrate needed before precise stay/improve/replace lists.
6. **13 former Free templates are now Pro** (e.g. Letters & Sounds, Colors Everywhere, infant Music & Movement). Content exists but needs premium Teaching Kit polish — Priority 2, not blind rebuild.
7. **Family Connections** weeks are the strongest current set (Priority 3 polish).

## Priority ranking

### PRIORITY 1 — Needs major rebuild (7)

- **Apples in the Kitchen** (`cur-lp-toddler-apples-in-the-kitchen`) — toddler — weak_or_thin — 20 activities — replace-flagged 1
- **Camping Under the Stars** (`cur-lp-toddler-camping-under-the-stars`) — toddler — generic_template_rebuild — 25 activities — replace-flagged 25
- **Johnny Appleseed & Apple Fun** (`cur-lp-toddler-johnny-appleseed-apple-fun`) — toddler — weak_or_thin — 20 activities — replace-flagged 1
- **Pet Vet Clinic** (`cur-lp-toddler-pet-vet-clinic`) — toddler — generic_template_rebuild — 25 activities — replace-flagged 25
- **Pirate Adventure** (`cur-lp-toddler-pirate-adventure`) — toddler — generic_template_rebuild — 25 activities — replace-flagged 25
- **Superhero Training Camp** (`cur-lp-toddler-superhero-training-camp`) — toddler — generic_template_rebuild — 25 activities — replace-flagged 25
- **Zoo Adventures** (`cur-lp-toddler-zoo-adventures`) — toddler — generic_template_rebuild — 25 activities — replace-flagged 25

### PRIORITY 2 — Good foundation but incomplete (105)

Includes: most infant/preschool Pro themes, former Free→Pro templates, production-only hashed IDs awaiting admin hydrate, and theme weeks that need questions/images/printables/cover upgrades without full rewrite.

Full per-lesson rows: `docs/audits/pro-curriculum-upgrade-audit.md` + `.json`.

### PRIORITY 3 — Mostly strong; polish only (6)

- **My Home & My Family** (`cur-lp-infant-family-connections-infant-0-12-months-my-home-and-my-family`) — infant
- **The People Who Love Me** (`cur-lp-infant-family-connections-infant-0-12-months-the-people-who-love-me`) — infant
- **We Belong Together** (`cur-lp-infant-family-connections-infant-0-12-months-we-belong-together`) — infant
- **We Belong Together** (`cur-lp-preschool-family-connections-preschool-we-belong-together`) — preschool
- **My Home & My Family** (`cur-lp-toddler-family-connections-toddler-my-home-and-my-family`) — toddler
- **The People Who Love Me** (`cur-lp-toddler-family-connections-toddler-the-people-who-love-me`) — toddler

## INFANT inventory (Pro only)

| Title | ID | Acts | Days | Cover style | Printables | Books | Songs | Family | Priority | Quality |
|---|---|---:|---|---|---:|---|---|---|---|---|
| Animal Sounds Discovery | `cur-lp-infant-animal-sounds-discovery` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Apple Colors for Tiny Eyes | `cur-lp-19fb3839b4851b9b76b` | 10 | Mon,Tue,Wed,Thu,Fri | static_catalog_likely_illustrated | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Apple Discovery for Mobile Babies | `cur-lp-19fb388c44a2e7430c4` | 10 | Mon,Tue,Wed,Thu,Fri | static_catalog_likely_illustrated | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Baby's First Conversations | `cur-lp-infant-baby-s-first-conversations` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Caring Hearts | `cur-lp-infant-family-connections-infant-0-12-months-caring-hearts` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Crawling Adventures | `cur-lp-infant-crawling-adventures` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Crawling, Reaching and Discovering | `cur-lp-19fb35df5f889da9eb9` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Easter Exploration | `cur-lp-infant-easter-exploration` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Fall Colors, Leaves and Movement | `cur-lp-19fb3849d087888afe5` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Family Faces and Loving People | `cur-lp-19fb35c39f471ef767d` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Family Songs and Loving Rhythms | `cur-lp-19fb387b1f5ad5653ec` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Fire Trucks, Safe Helpers and Moving Colors | `cur-lp-19fb3c245b23c300c8b` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Fourth of July Celebration | `cur-lp-infant-fourth-of-july-celebration` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Grandfriends and Loving Faces | `cur-lp-19fb376f4eb2e18b4c9` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 4 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Grandfriends, Photos and Little Keepsakes | `cur-lp-19fb36844752f3715bd` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 4 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Hello Fall, Little One | `cur-lp-19fb387f75cfd1f1745` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Helpful Faces and Gentle Work | `cur-lp-19fb38773df610d367a` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Little Helpers on the Move | `cur-lp-19fb38792893375328a` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Little Movers in My Classroom | `cur-lp-19fb35b217473a645d5` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Mirror Me | `cur-lp-infant-mirror-me` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Music and Movement (Infant 0-6 Months) | `cur-lp-infant-music-and-movement-0-6-months` | 13 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Music and Movement (Infant 6-12 Months) | `cur-lp-infant-music-and-movement-6-12-months` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Music, Movement and Family Traditions | `cur-lp-19fb387d847b502ae2e` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| My Family and Familiar Faces | `cur-lp-19fb359f28e308b9e53` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| My Senses | `cur-lp-infant-my-senses` | 13 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| New Year's Celebration | `cur-lp-infant-new-years-celebration` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Nursery Rhymes & Lullabies | `cur-lp-infant-nursery-rhymes-lullabies` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Peek-A-Boo & Play | `cur-lp-infant-peek-a-boo-play` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Peek-A-Boo Fun | `cur-lp-infant-peek-a-boo-fun` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Reaching & Grasping Adventures | `cur-lp-infant-reaching-grasping-adventures` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Sensory Discovery | `cur-lp-infant-sensory-discovery` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Smiles & Expressions | `cur-lp-infant-smiles-expressions` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Sounds, Signs and Songs | `cur-lp-19fb35d1cfedca7c83b` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Sounds, Songs and Communication | `cur-lp-19fb35ac80b02a50635` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Summer Colors | `cur-lp-infant-summer-colors` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Water Play Wonders | `cur-lp-infant-water-play-wonders` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Welcome to Our Infant Room | `cur-lp-19fb35bed3bc020c16a` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Welcome, Baby! | `cur-lp-19fb35928244ffc2f1f` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| My Home & My Family | `cur-lp-infant-family-connections-infant-0-12-months-my-home-and-my-family` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P3 | usable_but_incomplete |
| The People Who Love Me | `cur-lp-infant-family-connections-infant-0-12-months-the-people-who-love-me` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P3 | usable_but_incomplete |
| We Belong Together | `cur-lp-infant-family-connections-infant-0-12-months-we-belong-together` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P3 | usable_but_incomplete |

## TODDLER inventory (Pro only)

| Title | ID | Acts | Days | Cover style | Printables | Books | Songs | Family | Priority | Quality |
|---|---|---:|---|---|---:|---|---|---|---|---|
| Apples in the Kitchen | `cur-lp-toddler-apples-in-the-kitchen` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P1 | weak_or_thin |
| Camping Under the Stars | `cur-lp-toddler-camping-under-the-stars` | 25 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P1 | generic_template_rebuild |
| Johnny Appleseed & Apple Fun | `cur-lp-toddler-johnny-appleseed-apple-fun` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P1 | weak_or_thin |
| Pet Vet Clinic | `cur-lp-toddler-pet-vet-clinic` | 25 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P1 | generic_template_rebuild |
| Pirate Adventure | `cur-lp-toddler-pirate-adventure` | 25 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P1 | generic_template_rebuild |
| Superhero Training Camp | `cur-lp-toddler-superhero-training-camp` | 25 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P1 | generic_template_rebuild |
| Zoo Adventures | `cur-lp-toddler-zoo-adventures` | 25 | Mon,Tue,Wed,Thu,Fri | missing | 0 | present | present | present | P1 | generic_template_rebuild |
| All About Me | `cur-lp-toddler-all-about-me` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | weak_or_thin |
| Amazing Apples | `cur-lp-toddler-amazing-apples` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Apple Orchard Adventure | `cur-lp-toddler-apple-orchard-adventure` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Caring Hearts | `cur-lp-toddler-family-connections-toddler-caring-hearts` | 30 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Classroom Helpers | `cur-lp-toddler-classroom-helpers` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Colors Everywhere | `cur-lp-toddler-colors-everywhere` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Community Helpers | `cur-lp-toddler-community-helpers` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Dinosaur Discovery | `cur-lp-toddler-dinosaur-discovery` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Easter Eggstravaganza | `cur-lp-toddler-easter-eggstravaganza` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Fairy Tale Adventures | `cur-lp-toddler-fairy-tale-adventures` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Farm Friends | `cur-lp-toddler-farm-friends` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Fourth of July Stars & Stripes | `cur-lp-toddler-fourth-of-july-stars-stripes` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Friendship & Feelings | `cur-lp-toddler-friendship-feelings` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Grandfriends, Hugs and Happy Memories | `cur-lp-19fb3a8c4d2ab6b1e42` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 3 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Growing Gardens | `cur-lp-toddler-growing-gardens` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Healthy Me | `cur-lp-toddler-healthy-me` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Hibernation and Winter Sleep | `cur-lp-19fb346d58153d2c3c0` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Making New Friends | `cur-lp-toddler-making-new-friends` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Music & Movement | `cur-lp-toddler-music-movement` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| My Feelings at School | `cur-lp-toddler-my-feelings-at-school` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| My Five Senses | `cur-lp-toddler-my-five-senses` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| New Year's Little Celebrations | `cur-lp-toddler-new-years-little-celebrations` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Rainforest Adventure | `cur-lp-19fb3322814d045f881` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Under the Sea | `cur-lp-toddler-under-the-sea` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| We Belong Together | `cur-lp-toddler-family-connections-toddler-we-belong-together` | 30 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Weather Wonders | `cur-lp-toddler-weather-wonders` | 14 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | weak_or_thin |
| Welcome to My Classroom | `cur-lp-toddler-welcome-to-my-classroom` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| My Home & My Family | `cur-lp-toddler-family-connections-toddler-my-home-and-my-family` | 30 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P3 | usable_but_incomplete |
| The People Who Love Me | `cur-lp-toddler-family-connections-toddler-the-people-who-love-me` | 30 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P3 | usable_but_incomplete |

## PRESCHOOL inventory (Pro only)

| Title | ID | Acts | Days | Cover style | Printables | Books | Songs | Family | Priority | Quality |
|---|---|---:|---|---|---:|---|---|---|---|---|
| Amazing Insects | `cur-lp-preschool-amazing-insects` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Animal Habitats | `cur-lp-preschool-animal-habitats` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Archaeology Adventure | `cur-lp-preschool-archaeology-adventure` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Around the World | `cur-lp-preschool-around-the-world` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Camping Adventure | `cur-lp-preschool-camping-adventure` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Caring Hearts | `cur-lp-preschool-family-connections-preschool-caring-hearts` | 30 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Christmas Celebration | `cur-lp-19fb34ba94f759d2c5b` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Colors Everywhere | `cur-lp-preschool-colors-everywhere` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Construction Engineers | `cur-lp-preschool-construction-engineers` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Construction Zone | `cur-lp-preschool-construction-zone` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Dinosaur Discovery | `cur-lp-preschool-dinosaur-discovery` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Easter Eggs, Chicks & Spring Science | `cur-lp-preschool-easter-eggs-chicks-spring-science` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Fairy Tale Adventures | `cur-lp-preschool-fairy-tale-adventures` | 18 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Feelings & Emotions | `cur-lp-preschool-feelings-and-emotions` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Five Senses | `cur-lp-preschool-five-senses` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Fourth of July Stars, Stripes & Community Heroes | `cur-lp-preschool-fourth-of-july-stars-stripes-community-heroes` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Friendship Problem Solvers | `cur-lp-19fb3681a778d44b04f` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Gardening & Plant Life | `cur-lp-preschool-gardening-plant-life` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Grandfriends, Stories and Special Memories | `cur-lp-19fb3b385454cd884f3` | 10 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 4 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Healthy Habits | `cur-lp-preschool-healthy-habits` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Ice Cream Shop Entrepreneurs | `cur-lp-preschool-ice-cream-shop-entrepreneurs` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Inventors Workshop | `cur-lp-preschool-inventors-workshop` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Kindergarten Readiness | `cur-lp-preschool-kindergarten-readiness` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Letters & Sounds | `cur-lp-preschool-letters-and-sounds` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Little Scientists | `cur-lp-preschool-little-scientists` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| My Home & My Family | `cur-lp-preschool-family-connections-preschool-my-home-and-my-family` | 30 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Names, Letters and Learning | `cur-lp-19fb367efa47d920b80` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| New Year's Goal Setters & Big Dreams | `cur-lp-preschool-new-years-goal-setters-big-dreams` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Numbers Everywhere | `cur-lp-preschool-numbers-everywhere` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Ocean Explorers | `cur-lp-preschool-ocean-explorers` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Pet Pals | `cur-lp-preschool-pet-pals` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Preschool Classroom Explorers | `cur-lp-19fb3677fbfe91a68f1` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | unknown_no_import | unknown_no_import | unknown_no_import | P2 | production_live_content_locked_for_audit |
| Seasons of the Year | `cur-lp-preschool-seasons-of-the-year` | 20 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Shapes Around Us | `cur-lp-preschool-shapes-around-us` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Space Adventure | `cur-lp-preschool-space-adventure` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| STEM Explorers | `cur-lp-preschool-stem-explorers` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Transportation Adventures | `cur-lp-preschool-transportation-adventures` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Water Park Engineers | `cur-lp-preschool-water-park-engineers` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Zoo Adventure | `cur-lp-preschool-zoo-adventure` | 19 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| Zoo Veterinarians | `cur-lp-preschool-zoo-veterinarians` | 15 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P2 | usable_but_incomplete |
| We Belong Together | `cur-lp-preschool-family-connections-preschool-we-belong-together` | 30 | Mon,Tue,Wed,Thu,Fri | illustrated_storybook | 0 | present | present | present | P3 | strong_foundation |
