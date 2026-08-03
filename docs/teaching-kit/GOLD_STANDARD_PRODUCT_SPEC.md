# Gold Standard Teaching Kit — Final Product Design (v4 polish)

**Status:** Product design **approved** · Slice 1A–1C implemented · UI still flagged off · **1C review**  
**PR:** #436 (draft) · Slice 1A–1C done · Slice 1D not started  
**Example week:** *Bugs & Butterflies* · Toddler · Pro  
**Date:** 2026-08-03  

**Companion mockup:** [`mockups/gold-standard.html`](./mockups/gold-standard.html)

---

## 1. Vision (subscribe-for feature)

The Teaching Kit **replaces everything a provider carries during the week**. It is the product people subscribe for:

- Monday morning setup with **prep-time estimate** and **missing-items highlight**
- An all-day **Today’s Classroom** board they can leave open without screen-hopping
- **Open Everything I Need Today** — one tap for today’s cards, books, songs, printables, parent message
- Activity cards with **example photo + setup photo**, prompts, objectives, cleanup, observations
- **Substitute This Activity** when materials don’t match what’s on hand
- Printables that show **exactly where they appear in the week**
- A printed pack that looks like a **professional curriculum binder** (cover, tabs, branding)

**Lesson plan** = library source. **Teaching Kit** = prepare · teach · print · carry.

---

## 2. Information architecture

| Surface | Job |
| --- | --- |
| **Start the Week** | Choose kit · jump into Setup / Today / Build |
| **Monday Morning Setup** | Prep before children arrive |
| **Today’s Classroom** | Leave open all day (primary runtime surface) |
| **Today tray** (“Open Everything…”) | Stacked day’s materials in one place |
| **Activity card** | Full teachable depth + Substitute |
| **Printable detail** | File + **Used in week** map |
| **Build My Kit** | Add/remove activities · assemble binder |
| **Printable binder** | Cover · tab dividers · consistent brand |

---

## 3. Monday Morning Setup

**Purpose:** Clear the counter before the door opens.

Must show:

1. **Estimated prep time** for the whole setup (e.g. “About 18 minutes”)  
2. **Missing before the week begins** — red/amber callout of unchecked critical items  
3. Materials to gather (checkable)  
4. Prep tasks (time-ordered, with per-task minutes)  
5. Print checklist  
6. Supplies status: Ready / Need to gather / Optional  
7. CTA: **Open Today’s Classroom**  
8. Secondary: Build My Kit · Assign week  

Missing-items rules (product):

- Critical materials still unchecked → show in **Needs attention** banner  
- Optional items never block “ready”  
- Banner clears as checks complete  

---

## 4. Today’s Classroom (leave-open-all-day)

**Purpose:** One board from arrival to pickup — no constant switching.

### Design rules
- Everything for the day is on **one scrollable surface** (or sticky day-rail + content)
- Primary action: **Open Everything I Need Today**
- Day switcher stays on-board (Mon–Fri chips)
- Schedule rows open depth **inline / tray**, not a dead-end away from Today
- Quick notes + parent message + observations stay visible without leaving Today
- Mobile: same board; bottom nav Prep / Today / Build only

### Must show
| Block | Contents |
| --- | --- |
| Sticky header | Day · kit title · **Open Everything I Need Today** |
| Schedule | Full day with type tags |
| Activities today | Thumb + open + substitute peek |
| Books / songs / vocab | Full usable peeks (questions, lyrics/motions, definitions) |
| Materials · transitions | Short lists |
| Observations | Tied to **today’s** activities |
| Parent connection | Ready-to-send + copy |
| Quick notes | Scratch pad |

### Open Everything I Need Today
One control that opens a **Today tray / packet** containing:

1. Today’s activity cards (stacked)  
2. Today’s book(s) with read-aloud questions  
3. Today’s song(s) with lyrics + motions  
4. Today’s printables (each with **Used in week** label)  
5. Parent message (copy-ready)  
6. Observation prompts for today’s activities  

Provider can dismiss tray and return to the same Today board (state preserved).

---

## 5. Activity card standard (every activity)

Required fields:

1. **Example photo** (finished / in-use with children — realistic)  
2. **Setup photo** (table/tray before children arrive)  
3. **Materials** (+ common substitutions)  
4. **Learning objective** (clear, child-observable)  
5. **Teacher prompts**  
6. **Setup instructions** + steps  
7. **Cleanup tips**  
8. **Observation ideas** (tied to this activity)  
9. Estimated setup / run / cleanup time  
10. **Substitute This Activity** control  

### Substitute This Activity
Suggests 1–3 alternatives that:

- Fit the same age band / learning goal when possible  
- Prefer **materials already listed as Ready** on Monday Setup / Today materials  
- Show why it fits (“Uses paint + paper you already have”)  
- One tap: **Use substitute for today** (updates Today + print selection for that slot)  
- Always offer **Keep original**

---

## 6. Printables — “where used in the week”

Every printable shows:

- Thumbnail / title  
- **Used in week** map: day + moment (e.g. “Tue · after Bug Hunt · circle”)  
- Linked activity / song / book if any  
- Print / include-in-binder toggle  

Providers should never guess *when* to pull a sheet.

---

## 7. Songs, books, vocabulary, parents

Unchanged depth bar from v3:

- Songs: lyrics (when rights-safe) + motions  
- Books: read-aloud questions  
- Vocabulary: simple definitions + discussion ideas  
- Parent connection: ready-to-send family message  

---

## 8. Build My Kit

- Add / remove activities before print  
- Section toggles for binder parts  
- Presets: Today pack · Monday Setup pack · **Week binder** · Family pack  
- Removing an activity removes its observations + linked printables from that pack  

---

## 9. Printable Teaching Kit = professional curriculum binder

Not “export web pages.” Output must feel purchased:

| Binder element | Requirement |
| --- | --- |
| **Cover page** | Kit title, age, week theme, LLH mark, optional provider/program line |
| **Spine / tab labels** | Setup · Daily · Activities · Songs & Books · Families · Observe |
| **Section divider tabs** | Color-coded tab edge on divider pages |
| **Running brand** | Header or footer: mark + kit name + page # |
| **Consistent activity cards** | Same photo/objective/materials/prompts/cleanup grid |
| **US Letter** | Ink-conscious option |
| **Not** | App screenshots, random lesson dumps, mismatched fonts |

Visual mockup shows cover + tab strip + sample interior page.

---

## 10. Desktop vs mobile

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Monday Setup | Prep time + missing banner + checklists | Stacked; missing banner sticky |
| Today | One board + sticky Open Everything | Same; tray = full-screen sheet |
| Activity | Dual photos + Substitute panel | Full-screen card |
| Binder preview | Cover + tabs + sample pages | Swipe sample pages |

---

## 11. Implementation note (Slice 1C)

Design approved. Slices 1A–1C ship flags, mapper, and flagged API  
`GET /api/curriculum/lesson-plans/:id/teaching-kit` (viewer or print-center flag).  
**Still deferred:** binder / Today UI (1D), PDF/print, production flag enablement, merge/deploy.

Non-goals that remain:

- No live inventory sync (missing items = checklist state / readyMaterials option)  
- No illegal copyrighted lyric paste  

---

## 12. Owner approval checklist (v4)

- [x] Prep-time estimate + missing-items highlight feel right on Monday Setup  
- [x] Today board is leave-open-all-day (Open Everything is the right power move)  
- [x] Activity cards have example **and** setup photos + full teach fields  
- [x] Substitute This Activity is clear and materials-aware  
- [x] Printables show where used in the week  
- [x] Binder preview feels like a professional curriculum binder (tabs/cover/brand)  
- [x] **Approve → begin implementation** (Slice 1A–1C done — stop for review before 1D)

**Stop after Slice 1C for review before starting Slice 1D.**
