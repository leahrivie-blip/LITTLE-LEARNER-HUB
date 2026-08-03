# Gold Standard Teaching Kit — Final Product Design (Review)

**Status:** Product design for review — **not approved · not implementation**  
**PR:** #436 (draft) · Slice 1A approved · Slice 1B **not started**  
**Example week:** *Bugs & Butterflies* · Toddler · Pro  
**Date:** 2026-08-03  

**Companion mockup:** [`mockups/gold-standard.html`](./mockups/gold-standard.html)

---

## 1. Vision

The Teaching Kit should **replace everything a provider carries around during the week** — not merely organize lesson-plan content.

It is the binder that lives on the counter / in the bag:

- Monday morning setup sheet  
- All-day Today board  
- Activity cards with real examples  
- Songs with lyrics + motions  
- Books with read-aloud questions  
- Vocabulary with definitions + talk prompts  
- Ready-to-send family message  
- Observation prompts tied to today’s activities  
- A printed pack that looks like a **professional curriculum binder**, not a raw lesson dump  

**Lesson plan** = curriculum source in the library.  
**Teaching Kit** = the thing you prepare with, teach from, and print.

---

## 2. What this kit replaces (provider bag)

| Usually carried / hunted | Teaching Kit surface |
| --- | --- |
| Sticky notes for morning prep | **Monday Morning Setup** |
| Day schedule on the fridge | **Today’s Classroom** |
| Printed activity pages from random sites | **Activity cards** (with photo + cleanup) |
| Song lyrics on phone / memory | **Songs** (lyrics + motions) |
| Book sticky-notes | **Books** (read-aloud questions) |
| Word list on whiteboard | **Vocabulary** (definitions + discussion) |
| Half-written parent message | **Parent connection** (ready-to-send) |
| Observation clipboard | Prompts **tied to activities** on Today + print |
| Stack of mismatched PDFs | **Build My Kit** → one binder PDF |

---

## 3. Binder information architecture

| Nav | Job |
| --- | --- |
| **Monday Morning Setup** | Everything before children arrive |
| **Today’s Classroom** | Stays open all day |
| **This Week** | Switch day → loads Today |
| **Activity Cards** | Full teachable cards |
| **Songs** | Lyrics + motions |
| **Books** | Read-aloud questions |
| **Vocabulary** | Definitions + discussion |
| **Parents** | Ready-to-send family message |
| **Build My Kit** | Choose sections **and activities**, then print binder |

---

## 4. Monday Morning Setup

**Purpose:** One page to clear before the door opens.

Must show:

1. **Arrive-by checklist** (time-ordered prep tasks)  
2. **Supplies to gather** (from closet / buy / ask families)  
3. **Materials by area** (circle / table / outdoor)  
4. **Print checklist** (what to run before kids)  
5. **Environment setup** (where trays go — with example photo thumbs)  
6. **Safety / allergy glance** for the week  
7. Primary CTA: **Open Today’s Classroom**  
8. Secondary: Assign week · Favorite · Build My Kit  

This is distinct from a content “Overview.” It is **operations before arrival**.

---

## 5. Today’s Classroom (all-day dashboard)

**Purpose:** The screen that stays open from arrival to pickup.

Must show on one scrollable board:

| Block | Contents |
| --- | --- |
| Day header | Week title · day · focus one-liner |
| Schedule | Arrive → Circle → Activity → Transition → Outdoor → Closing (times / estimates) |
| Activities today | Cards with thumb + Open |
| Book today | Title + one read-aloud question peek |
| Song today | Title + motion peek · open lyrics |
| Materials today | Short list only |
| Transitions | Exact phrases / cues |
| Quick notes | Scratch pad (UX pattern; persistence later) |
| Observation | Prompts **linked to today’s activities** |
| Parent peek | One sentence to say at pickup + link to full message |

Mobile: same board, large taps, bottom nav Prep / Today / Week / More.

---

## 6. Activity card standard (every activity)

Every activity in a gold-standard kit includes:

1. **Example photo** (setup or finished — realistic, reproducible)  
2. **Learning objectives**  
3. **Materials** (+ substitutions when helpful)  
4. **Setup instructions**  
5. **Step-by-step**  
6. **Teacher prompts** (language / questions)  
7. **Cleanup tips**  
8. **Observation prompts** (activity-specific)  
9. **Adaptations** (simplified / stretch)  
10. **Estimated setup / activity / cleanup time**  

Entry: from Today schedule or Activity Cards list.  
Always: **Back to Today**.

---

## 7. Songs, books, vocabulary, parents

### Songs
- Title  
- When to use (circle / transition / outdoor)  
- **Full lyrics** when original LLH or verified public domain  
- **Motions / actions** line by line when possible  
- Copyrighted modern songs: title + motions + suggestion only — no illegal lyric paste  
- Print lyric sheet option when allowed  

### Books
- Title · author  
- Short why-this-book  
- **Read-aloud questions:** before / during / after  
- Vocabulary tie-ins  
- Extension idea  
- Disclaimer: full book not provided by LLH  

### Vocabulary
- Word  
- **Simple child-friendly definition**  
- **Discussion idea** (question or prompt)  
- Link to printable cards  

### Parent connection
- **Ready-to-send family message** (copy button UX)  
- Short pickup talking points  
- Optional home extension  
- Print as family letter page in binder  

---

## 8. Observation prompts (tied to activities)

Rules:

- Today board shows prompts for **today’s activities only**  
- Each activity card has its own observation bullets  
- Printed observation page lists activity name beside each prompt  
- Never generic “observe learning” without a target  

Example: *Leaf & Bug Sort* → “Does the child sort by color or size with support? Uses ‘gentle’?”

---

## 9. Build My Kit (print with activity control)

### Presets (operations-first)
1. **Today’s classroom pack** (default)  
2. **Monday Morning Setup pack**  
3. **Week binder** (professional full kit)  
4. **Family pack**  

### Section toggles
Cover · Setup page · Today sheet · Materials · Songs · Books · Vocabulary · Parent message · Observation forms · Example photos · Teacher notes  

### Activity picker (required)
- Checklist of week activities (grouped by day)  
- Provider can **add or remove activities** before generating PDF  
- Removing an activity drops its steps + its observation prompts from the pack  
- “Today’s activities only” quick filter  

### Output quality bar — “professional curriculum binder”
Printed packet should feel like a purchased teacher binder:

- Cover page with kit title, age, week theme, LLH brand  
- Clear section dividers / running headers  
- Consistent activity card layout  
- Page numbers · “Bugs & Butterflies · Teaching Kit” footer  
- US Letter · ink-conscious option  
- Not a screenshot of the web app  
- Not an unstructured lesson-plan paste  

Entitlements: existing Free / Trial / Pro / Founding rules; Trial watermark path before assembly.

---

## 10. Desktop vs mobile

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Monday Morning Setup | Two-column checklist + print queue | Stacked checklist |
| Today’s Classroom | Schedule + side materials/obs | Single column, sticky observe |
| Activity card | Panel / wide card with photo | Full-screen card |
| Build My Kit | Modal with activity picker | Full-screen picker |

---

## 11. Example week

Still **Bugs & Butterflies** · Toddler · complete gold-standard content in the mockup for Monday focus, with Tue–Fri visible in This Week / activity picker.

---

## 12. Non-goals

- No runtime implementation  
- No Slice 1B / merge / deploy / flag enablement  
- No live sync of quick notes yet (show the pattern)  
- No claiming copyrighted modern song lyrics  

---

## 13. Owner approval checklist

- [ ] Monday Morning Setup is what you’d want before kids arrive  
- [ ] Today’s Classroom is what you’d leave open all day  
- [ ] Activity card fields are complete enough to teach without Google  
- [ ] Songs / books / vocab / parent message depth feels right  
- [ ] Observation prompts feel tied to activities  
- [ ] Build My Kit activity add/remove is clear  
- [ ] Printed binder vision matches “professional curriculum binder”  
- [ ] Approve final product design → then authorize implementation planning / Slice 1B  

**Stop until approved.**
