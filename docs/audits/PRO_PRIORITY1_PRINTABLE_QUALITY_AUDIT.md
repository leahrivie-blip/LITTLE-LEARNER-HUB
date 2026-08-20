# Priority 1 Printable Quality Audit (Owner Admin scope)

**Scope source:** Priority 1 Pro printable rebuild (PR #713 / `PRO_PRIORITY1_PRINTABLE_REBUILD_*`) — the recently uploaded **draft** printables on seven toddler lessons.  
**Not in scope:** rest of curriculum library, Colors / Community Helpers VP work, lesson body text, Free/Pro flags, publishing.  
**Production check:** `2026-08-20` via Owner Admin site-content. All listed resources remain `status: draft`; enrichment unpublished.

**Origin of each resource:** newly created draft upload in the v2 activity-driven rebuild (replaced prior generic zone-sign / blank-word packs). Not a mere relink.

---

## Exact recent scope (7 lessons · 19 draft printables)

| Lesson | Lesson ID | Draft resource | Resource ID |
|---|---|---|---|
| Pet Vet Clinic | `cur-lp-toddler-pet-vet-clinic` | Pet Care Action Cards | `cur-res-b722ba10ee070a6b` |
| Pet Vet Clinic | `cur-lp-toddler-pet-vet-clinic` | Pet Friend Picture Cards | `cur-res-f69bee309aa41f32` |
| Pet Vet Clinic | `cur-lp-toddler-pet-vet-clinic` | Vet Check Picture Chart | `cur-res-ab46a19506a160f1` |
| Zoo Adventures | `cur-lp-toddler-zoo-adventures` | Zoo Animal Picture Cards | `cur-res-47289150a016e6a4` |
| Zoo Adventures | `cur-lp-toddler-zoo-adventures` | Animal–Habitat Match Cards | `cur-res-ed3dd8cd112b51ba` |
| Camping Under the Stars | `cur-lp-toddler-camping-under-the-stars` | Day & Night Scene Cards | `cur-res-739b44750866b0e1` |
| Camping Under the Stars | `cur-lp-toddler-camping-under-the-stars` | Nature Treasure Hunt Cards | `cur-res-72b3d0b06da14a7f` |
| Camping Under the Stars | `cur-lp-toddler-camping-under-the-stars` | Pack the Backpack Cards | `cur-res-046771f59434cc05` |
| Pirate Adventure | `cur-lp-toddler-pirate-adventure` | Toddler Treasure Map | `cur-res-c7064e918084ee60` |
| Pirate Adventure | `cur-lp-toddler-pirate-adventure` | Gold Coin Sort Mat & Cutouts | `cur-res-2703fd901b3a8d48` |
| Superhero Training Camp | `cur-lp-toddler-superhero-training-camp` | Kindness Mission Cards | `cur-res-d0766e0900173303` |
| Superhero Training Camp | `cur-lp-toddler-superhero-training-camp` | Hero Movement Action Cards | `cur-res-f72e48f308860194` |
| Superhero Training Camp | `cur-lp-toddler-superhero-training-camp` | Super Badge Emblem Template | `cur-res-59fbca5ee3088b9c` |
| Apples in the Kitchen | `cur-lp-toddler-apples-in-the-kitchen` | Applesauce Picture Recipe | `cur-res-179aaab4a0a9646a` |
| Apples in the Kitchen | `cur-lp-toddler-apples-in-the-kitchen` | Apple Juice Café Menu & Order Tickets | `cur-res-486331e0aae8b242` |
| Apples in the Kitchen | `cur-lp-toddler-apples-in-the-kitchen` | Apple Color Sort Mat & Cutouts | `cur-res-fbb9f1ba0546e6f2` |
| Johnny Appleseed & Apple Fun | `cur-lp-toddler-johnny-appleseed-apple-fun` | Apple Tree Life Cycle Sequence Cards | `cur-res-07b827adcb81ad41` |
| Johnny Appleseed & Apple Fun | `cur-lp-toddler-johnny-appleseed-apple-fun` | Planting Steps Cards | `cur-res-7311a00e011d37f7` |
| Johnny Appleseed & Apple Fun | `cur-lp-toddler-johnny-appleseed-apple-fun` | Apple Tree Counting Mat & Cutouts | `cur-res-f521606e808db17e` |

---

## Audit table (before any replacement)

| Activity (primary) | Activity ID | Current resource | Decision | Problem found | What the printable SHOULD do | Proposed replacement type |
|---|---|---|---|---|---|---|
| Kindness Mission Cards (+ Carry and Deliver / Friendship Rescue) | `cur-act-bf61d078e8c51d1f` | Kindness Mission Cards `cur-res-d0766e0900173303` | **REPLACE** | SVG bubble people (circle heads + rectangle bodies); filler duplicate “Help Carry”; action unclear without reading labels | Teacher holds large picture missions; child points to a help and acts it with props | Teaching/action cards via VP `TEACHING_CARD_REALISTIC` or `TEACHING_CARD_ILLUSTRATED` (show the action; no filler dupes; 5 unique missions) |
| Hero Movement Dance / Obstacle / Training Course | `cur-act-37b58f708dd73c73` / `cur-act-dc54af2dad371870` / `cur-act-1ccfd9e4ec40df09` | Hero Movement Action Cards `cur-res-f72e48f308860194` | **REPLACE** | Same bubble-person style; filler duplicate “Stretch Tall”; poses hard to read | Teacher draws a move card; child copies stretch/jump/tiptoe/freeze/fly-arms on the course | Movement action cards via VP (realistic or quality illustrated child poses); 5 unique moves |
| Super Badge Creation / Hero Medal | `cur-act-246f72c75f23433a` / `cur-act-630b9a73bdc79497` | Super Badge Emblem Template `cur-res-59fbca5ee3088b9c` | **KEEP** | Simple craft blank — intentional | Child decorates, cuts, wears emblem | — |
| Move Like An Animal / Animal Discovery / Parade | `cur-act-1a4b4240cee6c77e` / `cur-act-912a6c94b99926f6` / `cur-act-b769f62eb3a3db53` | Zoo Animal Picture Cards `cur-res-47289150a016e6a4` | **REPLACE** | Lion looks like a sun; giraffe is a yellow block; animals not recognizable | Child sees animal → copies movement / names animal | Clear animal picture + movement cue cards (VP illustration or recognizable animal art) |
| Habitat Matching Game | `cur-act-f6fedd816cc9b337` | Animal–Habitat Match Cards `cur-res-ed3dd8cd112b51ba` | **REPLACE** | Lion = sun again; habitat scenes too abstract | Child matches animal card to home card | Matching set with recognizable animals + clear habitat scenes |
| Feed / Bath / Brush / Vet Exam | `cur-act-0f7c570752a6d275` / `cur-act-4bd10cc0e28f34eb` / `cur-act-d8f02e60ca6847e6` / `cur-act-b2b1ddee2ce87623` | Pet Care Action Cards `cur-res-b722ba10ee070a6b` | **IMPROVE** | Purpose good; pets are featureless ovals | Child points to next care action | Keep format; upgrade to clearer pet + tool scenes (later pass) |
| Meet the Pets / Investigation / Adoption | `cur-act-c83ce6325897933b` / `cur-act-e5b666895a1799c4` / `cur-act-e846238cdf5098fe` | Pet Friend Picture Cards `cur-res-f69bee309aa41f32` | **IMPROVE** | Geometric pets; fish labeled “soft friend” | Name / match / adopt pet friends | Keep; clearer pet portraits later |
| Vet Examination Station | `cur-act-b2b1ddee2ce87623` | Vet Check Picture Chart `cur-res-ab46a19506a160f1` | **IMPROVE** | Checklist useful; central pet is bubble-oval | Child follows eyes→ears→paws→tummy on stuffed pet | Keep checklist; upgrade pet art later |
| Flashlight Exploration / Campfire Story | `cur-act-f1dbe1ff95d48526` / `cur-act-4217259c4cdcd3e3` | Day & Night Scene Cards `cur-res-739b44750866b0e1` | **IMPROVE** | Purpose OK; scenes very icon-like | Point / talk about day vs night camping moments | Keep; richer scenes later |
| Nature Treasure Hunt | `cur-act-6e6e7d6425ab3eab` | Nature Treasure Hunt Cards `cur-res-72b3d0b06da14a7f` | **IMPROVE** | Useful hunt cues; filler duplicate Leaf; thin icons | Match tray/outdoor finds | Keep 5 unique finds; drop filler leaf later |
| Pack the Backpack | `cur-act-d0734a5f4eaa75de` | Pack the Backpack Cards `cur-res-046771f59434cc05` | **KEEP** | Clear object props for packing game | Child packs matching items | — |
| Follow / Create Treasure Map | `cur-act-d897267d336ea9fd` / `cur-act-ff2679fd77588b99` | Toddler Treasure Map `cur-res-c7064e918084ee60` | **KEEP** | Functional ship→island→X path | Follow path; stamp treasures | — |
| Gold Coin Sorting | `cur-act-e8d28e7aa229f03c` | Gold Coin Sort Mat & Cutouts `cur-res-2703fd901b3a8d48` | **KEEP** | Clear big/little sort mat + cutouts | Sort coins by size | — |
| Make Homemade Applesauce / Mash / Stir | `cur-act-e5f59219f0723052` / `cur-act-7733af1afd3f54f3` / `cur-act-d05c182421615376` | Applesauce Picture Recipe `cur-res-179aaab4a0a9646a` | **KEEP** | Clear 4-step picture recipe | Follow wash→mash→stir→taste? | — |
| Apple Juice Café | `cur-act-e9a81ab16a7c2789` | Apple Juice Café Menu & Order Tickets `cur-res-486331e0aae8b242` | **KEEP** | Clear dramatic-play menu + tickets | Point to order; hand ticket | — |
| Little Apple Kitchen / measuring play | `cur-act-8d7b27b09ffce0dd` (+ related) | Apple Color Sort Mat & Cutouts `cur-res-fbb9f1ba0546e6f2` | **KEEP** | Clear red/green/yellow sort | Sort apple props by color | — |
| Apple Tree Life Cycle Sequencing / Review | `cur-act-b7cd54b3a4b68934` / `cur-act-9ec32666482d3bd4` | Apple Tree Life Cycle Sequence Cards `cur-res-07b827adcb81ad41` | **KEEP** | Clear seed→sprout→tree→apple | Cut, mix, order while talking | — |
| Plant Your Own Apple Seed | `cur-act-3b644433afdd9764` | Planting Steps Cards `cur-res-7311a00e011d37f7` | **KEEP** | Clear planting sequence | Order steps at planting table | — |
| Count the Apples / Orchard Counting | `cur-act-98e9c60035ff0725` / `cur-act-3d583dbf586494f9` | Apple Tree Counting Mat & Cutouts `cur-res-f521606e808db17e` | **KEEP** | Clear place-and-count mat | Place apples; count together | — |

### Decision counts (resources)

| Decision | Count |
|---|---|
| KEEP | 10 |
| IMPROVE | 5 |
| REPLACE | 4 |
| NOT NEEDED | 0 |

### Meaningless / random / low-quality cards found

- Kindness Mission: geometric bubble humans; “Extra mission card” filler  
- Hero Movement: bubble humans; “Extra move card” filler  
- Zoo Animal: Lion graphic reads as a **sun**; giraffe unreadable  
- Habitat Match: same sun-as-lion error  
- Nature Hunt: duplicate Leaf filler (IMPROVE, not full replace this pass)

---

## Replacement plan (this pass only — clear REPLACE)

1. **Kindness Mission Cards** — new draft via VP teaching-card rules; unlink old from enrichment draft printableIds; **do not delete** old resource; **do not publish**.  
2. **Hero Movement Action Cards** — same.  
3. **Zoo Animal Picture Cards** — redesigned recognizable animals + movement cues; draft only.  
4. **Animal–Habitat Match Cards** — redesigned match set; draft only.

No lesson/activity content rewrites. No Free/Pro changes. Unrelated lessons untouched.
