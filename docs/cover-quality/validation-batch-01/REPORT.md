# Cover Style Validation Batch 01

**Status:** STAGED ONLY — awaiting owner approval  
**Production attached:** NO  
**KEEP covers altered:** NO (13 untouched)  
**Lesson content / IDs / publish / TK flags:** untouched  

## Purpose

Prove art direction against the 13 KEEP benchmarks before generating the remaining ~105 REPLACE covers.

## Batch composition (9 covers)

| # | Lesson | Age | Why included | Staged file |
| ---: | --- | --- | --- | --- |
| 1 | Animal Sounds Discovery | Infant 0–12 mo | Required + former REVIEW | `val-animal-sounds-discovery.jpg` |
| 2 | Welcome, Baby! | Infant 0–6 mo | Age-mismatch (was preschool `all-about-me.jpg`) | `val-welcome-baby.jpg` |
| 3 | Fall Colors, Leaves and Movement | Infant 6–12 mo | Seasonal + former REVIEW | `val-fall-colors-leaves-movement.jpg` |
| 4 | Classroom Helpers | Toddler | Former REVIEW / age-fit concern | `val-classroom-helpers.jpg` |
| 5 | Making New Friends | Toddler | Former REVIEW | `val-making-new-friends.jpg` |
| 6 | Farm Friends | Toddler | SVG placeholder → farm theme | `val-farm-friends.jpg` |
| 7 | Construction Engineers | Preschool | STEM / dramatic play | `val-construction-engineers.jpg` |
| 8 | Ice Cream Shop Entrepreneurs | Preschool | Dramatic play | `val-ice-cream-shop-entrepreneurs.jpg` |
| 9 | Easter Eggs, Chicks & Spring Science | Preschool | Seasonal + science | `val-easter-eggs-chicks-spring-science.jpg` |

Artifacts (full-res + contact sheets): `/opt/cursor/artifacts/cover-validation/batch-01/`

- `staged/` — full validation candidates  
- `keep-benchmarks/` — copies of KEEP covers used for comparison  
- `contact-sheet-validation.jpg`  
- `contact-sheet-keep-benchmarks.jpg`  
- `contact-sheet-keep-vs-validation.jpg`  
- `crop-checks/` — square + mobile crops for infant/toddler/preschool samples  

## Style lock used

Warm polished children’s picture-book illustration (soft watercolor / warm digital painting), matching KEEP covers such as `farm-animals.jpg`, `bugs-butterflies.jpg`, `construction-crew.jpg`, `welcome-to-my-classroom.jpg`.  
No baked-in titles; UI overlay assumed. No photorealism / 3D / clip-art.

## QC results (agent pass)

| Lesson | Cartoon | Age match | Theme clear | No text | Anatomy OK | Crop-safe | Verdict |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| Animal Sounds Discovery | ✓ | ✓ infant + caregiver + animal toys | ✓ | ✓ | ✓ | ✓ | **PASS** |
| Welcome, Baby! | ✓ | ✓ infant cradle/floor welcome | ✓ | ✓ | ✓ | ✓ | **PASS** |
| Fall Colors, Leaves… | ✓ | ✓ tummy-time + fall leaves/scarves | ✓ fall-only | ✓ | ✓ | ✓ | **PASS** |
| Classroom Helpers | ✓ | ✓ toddler helpers (lean young) | ✓ | ✓ | ✓ | ✓ | **PASS** |
| Making New Friends | ✓ | ✓ toddlers + blocks | ✓ | ✓ | ✓ | ✓ | **PASS** |
| Farm Friends | ✓ | ✓ toddlers + farm animals | ✓ | ✓ | ✓ | ✓ | **PASS** |
| Construction Engineers | ✓ | ✓ preschool builders | ✓ | ✓ | ✓ | ✓ | **PASS** |
| Ice Cream Shop… | ✓ | ✓ preschool dramatic play | ✓ | ✓ (dot chalkboard only) | ✓ | ✓ | **PASS** |
| Easter Eggs & Spring Science | ✓ | ✓ preschool | ✓ | ✓ | ✓ | ✓ | **PASS with note** |

### Note on Easter Eggs cover

Theme and age are clear. Composition is slightly busier than the calmest KEEP object covers, and includes a smiley sun that is a touch more “storybook-decorative” than `construction-crew.jpg` / `farm-animals.jpg`. Still within picture-book LLH range — flagging for owner taste check.

## Consistency vs KEEP

Strongest matches to KEEP watercolor language:

- **Farm Friends** ↔ `farm-animals.jpg` (same farm vocabulary; validation adds toddler interaction as required for that lesson)
- **Construction Engineers** ↔ `construction-crew.jpg` (shared hard-hat / block / tool language; validation shows preschool engineers as lesson requires)
- **Making New Friends / Classroom Helpers** ↔ `welcome-to-my-classroom.jpg` (classroom warmth, diversity, soft lighting)

Infant covers correctly diverge from preschool KEEP classroom scenes (as required): babies, caregivers, floor play — not scaled-down preschoolers.

## Safety

- Production covers **not** overwritten  
- No lesson field changes  
- No Fall Week 1/2 import  
- No TK / billing changes  

## Owner ask

Approve or reject this validation batch as the art direction for the remaining REPLACE set.

If approved, next step is controlled batches (~10–15) using this same direction, still staging → QC → your approval before production attach.
