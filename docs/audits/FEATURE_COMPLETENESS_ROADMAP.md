# Feature Completeness Roadmap

**Question this answers:** *If I owned a childcare program, what would I expect to exist that still doesn’t?*  
**Environment:** Testing site / branch `cursor/family-hub-testing-readiness-d3df`  
**Shell baseline:** `20260803-beta-polish`  
**Date:** 2026-08-03  
**Rule:** Do not merge. Do not deploy production. No new admin/analytics infrastructure in this phase.

---

## North star

Little Learner Hub already proves something competitors often don’t: **curriculum + AI documentation + daily care + family sharing can live in one product.**

The remaining work is not polish or dashboards. It is closing the gaps that force providers to keep Brightwheel/Procare/Lillio/Playground (or paper, Venmo, Google Docs, and texting) alongside LLH.

**Product thesis to win the switch:**  
Be the all-in-one where planning and documentation are world-class *and* the money, enrollment, staff, and parent loops are complete enough that a home daycare or single-site center does not need a second system.

---

## 1. What a program owner still expects that we don’t fully have

### Missing workflows (must eventually exist)

| Workflow | Owner expectation | LLH today | Gap type |
|---|---|---|---|
| **Tuition billing & payments** | Invoice, autopay, late fees, payment history, receipts | Membership billing for LLH Pro only | Missing product |
| **Subsidy / CCDF / contracts** | Track voucher kids, attendance-linked billing | None | Missing product |
| **Enrollment pipeline** | Inquiry → tour → waitlist → offer → packet → enrolled | Light leads / mark enrolled | Incomplete |
| **Digital enrollment packets** | Fillable forms, e-sign, stored PDF in child file | AI draft + in-app acknowledge | Incomplete |
| **Door check-in** | Tablet kiosk, PIN/QR, authorized pickup verify | Attendance inside Daily Logs | Incomplete |
| **Ratio & room capacity** | Live children:staff by classroom | Classrooms + roster exist; no ratio engine | Missing connection |
| **Staff scheduling / time clock** | Shifts, open/close, hours for payroll | Staff invites + roles only | Missing product |
| **Reliable multi-device sync** | Teacher phone + owner laptop same data | Local/Firebase-dependent; FH durable separately | Missing connection |
| **Parent push / SMS / email** | Instant “your child checked in / form due” | In-app FH + often manual magic links | Incomplete |
| **Business reports** | Attendance %, tuition aged receivables, form completion | Local snapshot reports | Incomplete |
| **Menus → meal logging → CACFP** | Plan menus, log meals, claim readiness | Menu library + meal logs separate | Missing connection |

### Missing connections between things we already have

These are high leverage because the screens exist:

1. **Single child identity** — Profiles ↔ program blob ↔ Family Hub household ↔ classroom roster must stay one person everywhere (rename/archive/enroll included).  
2. **Daily ops → Family Hub by default** — check-in, meals, naps, photos, end-of-day report should flow without re-entry once household exists.  
3. **Activity Center / Lesson → Daily Log** — “We did this today” one tap.  
4. **Forms pack → due dates → parent notify → signed PDF back on child file.**  
5. **Staff classroom assignment → server ACLs** — UI filter exists; helpers can still write too broadly server-side.  
6. **Calendar events → Family Hub calendar** — family-facing by clear default, not easy-to-miss flags.  
7. **Enrollment lead → child + classroom + packet + Family Hub invite** — one “Enroll” action.  
8. **Message Support vs Family Hub** — already labeled better; still two systems that need crisp mental models forever.

### Incomplete features (feel real but not “done”)

- Family Hub parent beta (strong Today/messages/forms ack; not legal e-sign / email/SMS product)  
- Behavior Support (library + AI notes; no living behavior plan with goals/tracking)  
- Reports (useful snapshots; not ops/finance KPIs)  
- Center Director Center (routes to tools; not a director command surface)  
- Forms Library vs HDH pack vs Documents (still multi-surface)  
- AI Guide vs Documentation Helpers (parallel entry points)

### Places providers still leave LLH

| Job | They leave for… |
|---|---|
| Collect tuition | Brightwheel/Procare/Playground, QuickBooks, Venmo/Zelle |
| Subsidy paperwork | Procare / state portals / spreadsheets |
| Legal e-sign packets | DocuSign, Adobe, paper |
| Parent SMS / push | Text/iMessage, competitor parent apps |
| Staff payroll / hours | Gusto, ADP, paper timesheets |
| Door tablet check-in | Brightwheel/Procare kiosk |
| Licensing binders / CACFP claims | Folders, state systems, Kangarootime-class tools |
| Multi-room ratio boards | Whiteboard / competitor live attendance |

---

## 2. Gaps by role

### Home daycare owner

**Have:** Curriculum, AI docs, children, daily logs, Family Hub path, forms pack, staff invite for a helper.  
**Still missing to feel complete:**

1. Tuition + autopay for families (not LLH subscription)  
2. Enrollment packet e-sign end-to-end  
3. Guaranteed parent delivery (email/SMS/push) without manual link copying  
4. Simple “my day” home: who’s here, what’s due, what parents haven’t seen  
5. Reliable sync between phone and laptop  
6. Light CACFP/menu → meal log connection  
7. Exportable licensing packet (attendance, incidents, signed forms)

### Childcare center director

**Have:** Classrooms, staff roles, children roster, calendar, curriculum assign, coarse permissions.  
**Still missing:**

1. Live ratios / capacity by room  
2. Staff shift schedule + time clock  
3. Server-enforced helper/teacher write permissions  
4. Assigned children (not only classroom) for floaters  
5. Enrollment CRM (waitlist stages, offers, conversion analytics — *ops*, not admin vanity dashboards)  
6. Multi-classroom Family Hub oversight (which rooms shared what today)  
7. Billing/subsidy depth  
8. Center-wide form completion & incident log views  
9. Substitute / coverage workflow

### Teacher

**Have:** Daily Logs, observations, AI helpers, lessons on calendar, classroom-filtered children (when assigned).  
**Still missing:**

1. Phone-first “room mode” (fast check-in, meal, nap, photo, note in &lt;3 taps)  
2. One-tap log planned activity/lesson as completed  
3. Clear share defaults so parent updates don’t need hunting toggles  
4. Offline capture → sync later  
5. Behavior plan follow-through tied to the child (not only a note)

### Assistant / helper

**Have:** Invite, role, classroom filter in UI.  
**Still missing:**

1. True limited permissions (no billing, no delete child, no revoke households) enforced on server  
2. Task list from lead (“complete lunch logs for Blue Room”)  
3. Cannot see/edit other rooms or Family Hub invites  
4. Simple training/compliance checklist that directors trust

### Parent

**Have (testing Family Hub):** Today feed, photos, messages, calendar, form acknowledge, settings.  
**Still missing to match Brightwheel/Lillio expectation:**

1. Native-feeling push notifications  
2. Real-time check-in/out alerts  
3. Pay tuition in-app  
4. Legal e-sign + download signed PDF  
5. Multiple children UX polish at scale  
6. Absent / pickup change requests  
7. Memory/portfolio keepsakes over time

---

## 3. AI completeness review

### What exists (strength — protect and deepen)

Documentation Helpers / generators already cover: Observation, Parent Message, Daily Report, Incident, Behavior Note, Lesson, Activity, plus deeper tools (Newsletter, Handbook, Contract, Menu, Assessment, Progress, Portfolio, Curriculum, Schedule, Classroom Setup, Emergency Plan, Sub Plan, Grant letter).  
HDH AI form drafts + AI Guide (testing) exist.

**We already do better than most competitors:** AI that writes *usable childcare language* from a short note, tied to curriculum and child context — not just logging UI.

### AI that should exist but doesn’t (or isn’t productized)

| AI feature | Why it matters | Manual work removed |
|---|---|---|
| **End-of-day auto report from today’s logs** | One tap after last checkout | Rewriting meals/naps/activities into parent prose |
| **Weekly family summary from calendar + lessons + highlights** | Sunday night email/app post | Newsletter grind |
| **Enrollment message / tour follow-up** | Waitlist conversion | Custom emails per family |
| **Behavior plan generator → living plan** | From note to goals + strategies + check-ins | Word docs / sticky notes |
| **Incident → parent message + internal report pair** | Compliance + tone | Writing two versions |
| **Observation → goal / next-step suggestion** | Continuity of care | Re-reading old notes |
| **Ratio / coverage suggestion** | “Blue Room needs help at 3pm” | Mental math |
| **Form fill assist from child profile** | Prefill allergies, contacts, DOB | Re-typing enrollment data |
| **Sub plan from today’s lesson + roster** | Sick day survival | Scrambling paper plans |
| **Billing reminder / overdue tone assist** | Awkward money talk | Staring at blank email |
| **Licensing binder narrative** | Inspection prep | Panic binders |
| **Ask-my-program** (AI Guide Phase 3) productized | “What did Maya eat this week?” | Searching logs |

### Where AI should *not* become a duplicate system

- Do not build a second “AI Hub” beside Documentation Helpers — extend the one providers already find.  
- Do not label local template tools as AI.  
- Prefer AI that **writes into existing records** (Daily Log, Documents, Family Hub message) over orphan chat windows.

---

## 4. Competitive comparison

### What they can do that we still cannot (material switch blockers)

| Capability | Brightwheel | Procare | Lillio (HiMama) | Playground | LLH |
|---|---|---|---|---|---|
| Parent app real-time feed + push | Strong | Strong | Strong | Strong | Partial (FH testing; push/email weak) |
| Tuition billing / autopay | Strong | Strongest | Strong | Strong (home) | Missing (family tuition) |
| Subsidy / complex ledgers | Medium | Strongest | Medium | Light | Missing |
| Door tablet check-in / pickup auth | Strong | Strong | Strong | Medium | Light (in-app attendance) |
| Staff scheduling / time clock | Medium–Strong | Strong | Medium | Light | Missing |
| Enrollment CRM / waitlist automation | Strong (growing) | Strong | Medium | Medium | Light |
| Learning stories / milestone frameworks | Medium | Medium | Strongest | Light | Medium (obs + AI; weaker portfolios) |
| CACFP / compliance automation | Medium | Medium | Medium | Light | Light |
| Multi-site enterprise | Medium | Strongest | Medium | Weak | Not a goal yet |

### What we already do better (defend and advertise)

1. **Curriculum depth** — lesson library, Teaching Kit, Activity Center, calendar assignment as a first-class planning system.  
2. **AI documentation** — observation/parent/incident/daily/lesson quality from short notes.  
3. **Provider-built voice** — feels like a teacher’s toolkit, not only a compliance SaaS.  
4. **Home daycare pack thinking** — forms pack + Hub path aimed at small programs, not only centers.  
5. **Behavior & Support content + AI** — uncommon as an integrated care surface.  
6. **Price/positioning potential** — if ops gaps close, a curriculum+AI+ops bundle is a sharp alternative to “ops-first, curriculum bolted on.”

### What would make providers switch

Providers switch when **one product removes a second subscription** and a daily pain:

1. **Keep our curriculum + AI advantage**, then add **tuition + parent delivery** so they can cancel Brightwheel/Playground.  
2. Make **Family Hub feel inevitable** (check-in → photo → end-of-day report without retyping).  
3. Finish **enrollment e-sign** so DocuSign/paper leaves.  
4. For centers: **ratios + staff permissions + room mode** so directors trust LLH on the floor.  
5. Promise a clean migration story later (import children/families) — not before core loops work.

---

## 5. Build-next roadmap (no random features)

Ordered by **completeness of the platform**, not by shiny novelty.  
Explicitly **out of scope for this phase:** new Leah admin dashboards, marketing analytics, beta infrastructure.

### Horizon A — Close the “second app” leaks (highest ROI)

*Goal: A home daycare can run money + parents + paperwork without leaving LLH.*

1. **Family tuition billing v1** — simple invoices, online pay, payment history, sibling discount; no enterprise subsidy yet.  
2. **Parent delivery reliability** — email (and later push/SMS) for invites, check-in, form due, daily report ready.  
3. **Forms spine completion** — due dates, reminders, legal e-sign, signed PDF stored on child file, provider “needs attention” list.  
4. **Durable child data sync** — one source of truth so staff device + owner + Family Hub Today always match (kill Firebase-only dead ends).  
5. **Daily ops → Family Hub defaults** — share sensible defaults; end-of-day report auto-compile from logs + AI polish.

### Horizon B — Classroom completeness (home + single-site center)

*Goal: Teachers and directors don’t need a whiteboard or second ops app for the room.*

6. **Room mode** — fast attendance, meals, naps, diaper, photo, note; assistant-safe.  
7. **Live ratios / capacity** from classrooms + attendance + staff on duty.  
8. **Server staff ACLs + assigned children** — helpers truly limited; floaters assignable.  
9. **Activity/Lesson → Daily Log one-tap** + weekly family summary from the calendar.  
10. **Enrollment pipeline v1** — inquiry → waitlist stages → Enroll action (child + classroom + packet + FH invite).

### Horizon C — Depth that wins stickiness

*Goal: Become hard to rip out because learning + compliance + money are intertwined.*

11. **Behavior plans** (living plans, not only notes) tied to observations and parent messages.  
12. **Portfolios / learning stories** that assemble photos + observations + AI narrative for conferences.  
13. **Menus → meal logs → CACFP-ready export** (home/center light compliance).  
14. **Staff scheduling / time clock light** (single-site before multi-site).  
15. **Subsidy / attendance-linked billing** (after tuition v1 is solid).  
16. **Door kiosk check-in** (tablet) once attendance + authorized pickup data are clean.

### Horizon D — Deliberately later

- Multi-site enterprise / franchise reporting  
- Payroll integrations (Gusto-class)  
- Deep state licensing automation product  
- Second AI surface / AI Guide as separate brand  
- More admin/analytics consoles for Leah

---

## 6. Suggested sequencing principle

For every candidate feature, ask:

1. Does this remove a reason to keep Brightwheel/Procare/Playground?  
2. Does it reuse Children, Classrooms, Daily Logs, Family Hub, or Documents — or invent a parallel system?  
3. Does it help **home owner first**, then lift to center — matching where LLH already wins?

If it fails (1) or invents a duplicate (2), don’t build it next.

---

## 7. One-page answer

**If I owned a childcare program, what’s still missing?**  
Tuition/payments, reliable parent notifications, legal e-sign enrollment, true multi-device sync, phone-first room ops with ratios/permissions, and a real enrollment pipeline — plus AI that writes *from the day’s logs* instead of only from a blank note.

**What competitors still beat us on:** money, door check-in, parent push, staff scheduling, subsidy/enterprise billing.  
**What we beat them on:** curriculum depth and AI documentation quality.  
**How we win the switch:** keep the curriculum/AI moat; finish Family Hub + billing + forms + sync so providers can cancel the second app.

**Next builds (only):** Horizon A → B → C above. No more polish rounds, no new admin dashboards, until those completeness gaps shrink.
