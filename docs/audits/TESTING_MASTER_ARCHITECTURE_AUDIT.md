# Little Learner Hub — Testing Master Architecture Audit

**Audience:** Leah (Owner)  
**Scope:** TESTING ENVIRONMENT ONLY — do not merge to production as product work  
**Codebase audited:** `main` @ Teaching Kit era (Aug 2026) + comparison to `origin/testing/full-platform-integration-2026-07`  
**Date:** 2026-08-07  
**Rule for this document:** Audit + roadmap only. No giant rewrite in this pass.

---

## Executive verdict

Little Learner Hub already proves the hard thesis: **curriculum + daily care + Family Hub + forms spine can live in one product.**

What is broken is not “missing every feature.” What is broken is **architecture clarity**:

1. **Owner Admin today is a production SaaS command center**, not a testing-operations console for adding testers, programs, and feature access without a developer.
2. **Two parallel testing architectures exist** and must not be treated as one system.
3. **The live testing spine on `main` (HDH fence)** is the real care/Family Hub path. The July testing branch’s Testing Lab / Director Center / Forms Center / billing simulator is a **parallel fake-org stack that never replaced `main`**.
4. Childcare workflows on the testing site are **usable for home daycare care weeks**, but Owner Admin cannot yet operate testing the way the master vision requires.

**Bottom line:** Stop adding random features. Stabilize one testing spine. Build Owner Admin tester control next. Then connect remaining product loops in order.

---

## The most important architectural finding

### There are two “testing products”

| Spine | Where it lives | What it is | Data model |
|---|---|---|---|
| **A — HDH / Family Hub spine (current)** | `main` behind `HOME_DAYCARE_HUB_TESTING` | Real provider UI + Family Hub + work-mode nav + Admin Testing Center bolted onto production Admin | `programs` / `programData` / `child` Profiles + `familyHouseholds` |
| **B — July Testing Lab spine (parallel)** | `origin/testing/full-platform-integration-2026-07` | Testing Lab, Director Center, Forms Center preview, Today Hub, billing simulator, fake orgs | `organizations` / foundation fixtures / `store.testingLab` |

**Recommendation:** Treat Spine A as the product truth for childcare workflows. Treat Spine B’s Testing Lab ideas (Add External Tester wizard, fake-org fence, feedback inbox, flags, audit, banners) as **design reference to port carefully into Owner Admin on Spine A** — do **not** merge the whole July branch.

---

# CURRENT STATE

## What exists today (testing site with HDH fence ON)

### Strong / usable

| Area | Status | Notes |
|---|---|---|
| Curriculum / Lesson Plans / Teaching Kit | Strong | Production-grade; TK flags default off |
| Child Profiles | Strong | Operational source of truth = `Profiles` |
| Daily Logs (meals/naps/diapers/activities/attendance) | Strong | Care day works; can share to Family Hub |
| Observations + Goals | Partial-strong | Connected loosely, not a closed learning cycle |
| Classrooms + staff invites | Partial-strong | Roles exist; classroom UI filter for staff |
| Family Hub (parent Today, photos, messages, forms ack) | Testing-only strong | Reads shared provider records |
| Work-mode navigation by role | Strong on testing | Owner / Teacher / Assistant / Parent differ |
| Multi-Role Tester Switch View | Strong | Sandboxed; no Admin/billing for testers |
| Admin View As (roles + plans) | Strong | Lives in Admin Testing Center |
| Testing Pro entitlement | Strong on HDH | Unlocks Pro UI without Stripe |
| Independent tester invites | Partial | Via Home Daycare Hub, not Owner Admin Testers page |

### Missing / incomplete vs vision

| Area | Status |
|---|---|
| True Owner Admin tester console | Missing on `main` |
| Create test program wizard (home vs center) from Admin | Missing / hardcoded home daycare on invite accept |
| Per-tester feature flag matrix | Missing |
| Global TESTING banner for all users | Weak / intentionally removed from main shell |
| Family tuition billing | Missing (only LLH membership Stripe) |
| Legal e-sign + email/SMS form delivery | Missing |
| Closed observation → goal → activity → observation loop | Incomplete |
| Server-enforced staff write ACLs | Weak (`canWriteProgramData: true` for all members) |
| Director “needs attention today” dashboard | Partial (Owner Home pulse; not director command surface) |
| One-tap group classroom documentation | Partial |
| Safe scoped reset of one tester/program | Partial (seed demo / reset View As only) |
| Dedicated testing feedback with auto context | Partial (general feedback exists; Testing Lab feedback is on July branch) |

---

# OWNER ADMIN — exactly what you can and cannot manage yourself

**Important distinction (confirmed in code):**

- **Owner Admin** = Leah unlocking Admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ACCESS_CODE` → SaaS/content/ops console.
- **Program Owner / Director** = customer roles inside a childcare program.
- These are **not** the same thing. Admin is correctly blocked for invited staff and independent testers.

## What Owner Admin looks like on `main` today

Admin groups (`app.js` → `adminGroups`):

1. Admin Home  
2. Insights (advisor, funnel, errors, SEO, churn, release center, …)  
3. Marketing  
4. Users  
5. Billing (LLH membership)  
6. Content (lessons, forms library, menus, …)  
7. Messages (member ↔ Leah support messaging)  
8. Website CMS  
9. AI Tools  
10. System Health  
11. Advanced → Full Dashboard (**includes Admin Testing Center**) + feedback/bugs + Teaching Kit settings flags  

This is a **production software command center**, with testing controls nested under Advanced / Testing Center — not a dedicated “Testers / Programs / Flags / Audit” Owner Admin product.

## Section 54 answers (YES / NO / PARTIAL / DEVELOPER-ONLY)

| Question | Answer | Reality today |
|---|---|---|
| Can I add a tester myself? | **PARTIAL** | Yes via **Home Daycare Hub → Invite a tester**, not via a dedicated Owner Admin → Testers page. Requires HDH testing fence + acting as provider. |
| Can I create their program? | **PARTIAL** | Auto-created on invite accept (`ensureProgramForOwner`). No Admin “Create Program” wizard. Hardcoded `home_daycare`. |
| Can I choose home daycare vs center? | **PARTIAL / mostly NO for testers** | Account types exist in signup/settings. Independent tester accept **forces home daycare**. Center setup is not a first-class Admin tester flow on `main`. |
| Can I assign their role? | **PARTIAL** | Independent testers become `owner`. Staff invites can be assistant/teacher/director into *your* program. Multi-Role Tester enables Switch View (sandbox), not true role assignment. |
| Can I enable specific testing features? | **PARTIAL** | Multi-Role Tester flag per user; Teaching Kit site flags in Admin Settings; HDH/Family Hub gated by **env var**, not Admin UI. No per-tester feature matrix. |
| Can I disable tester access? | **YES** | Users → Disable / Re-enable. Also revoke pending invite. |
| Can I resend/recreate an invitation? | **NO** | Create + copy link + revoke only. Workaround: revoke/expire then create again. |
| Can I see whether they activated? | **PARTIAL** | Invite status pending/accepted/revoked; user profile shows `hdhIndependentTester`, last login. No tester dashboard. |
| Can I see what they see? | **YES** | Admin Testing Center View As + Users “View site as this user” impersonation + Multi-Role Switch View. |
| Can I preview their role? | **YES** | Owner / Director / Teacher / Assistant / Parent + plan sandbox Free/Trial/Pro/Founding. |
| Can I access Family Hub side safely? | **PARTIAL** | View As Parent + Family Hub invite tools. Not one-click “preview parent of program X.” |
| Can I reset their test data? | **PARTIAL** | Seed demo children / Family Hub seed / Reset View As. No safe “reset this tester’s program only” with confirmation + audit on `main`. |
| Can I see their feedback? | **PARTIAL** | General Admin Feedback / bugs / feature requests. Not a testing-feedback inbox with page/role/flag context (that exists on July Testing Lab). |
| Can I see errors they encounter? | **PARTIAL** | Insights Error Center + System Health exist, but not tester-linked friendly error cards. |
| Can I search all testers? | **PARTIAL** | Users search works; no dedicated tester filter/cohort UI. |
| Can I search test programs? | **NO** (as a first-class Admin Programs console) | Programs exist in store; no Owner Admin Programs search/detail. |
| Can I identify test data? | **PARTIAL** | `hdhIndependentTester`, invite metadata, test-account-guard email patterns. No universal TEST badge on every record. |
| Can I tell TESTING from PRODUCTION instantly? | **PARTIAL** | Body class `hdh-testing` + Testing Center copy. Sticky global “TESTING ENVIRONMENT” chrome was intentionally removed from the main shell. July branch had clearer banners. |

### What already works well for Leah without a developer

- Invite independent testers (HDH UI) and copy invite links  
- Revoke invites; disable accounts; issue temp passwords  
- Enable Multi-Role Tester  
- View As roles / impersonate a user  
- Seed demo children / open Family Hub invites  
- Review feedback/bugs; see errors at platform level  
- Manage Teaching Kit feature flags  
- Manage LLH membership plans for users  

### What still forces Cursor / database / scripts

- Creating a **center** test program with director + classrooms + teachers in one guided flow  
- Per-tester feature enablement matrix (Family Hub / Forms / Billing / experimental)  
- Dedicated tester cohort management  
- Safe scoped program reset with audit  
- Clear testing-only feedback workflow with auto context  
- Global feature-flag console (testing vs production distinction)  
- Searching programs / children / families as Owner Admin troubleshooting  

---

# TESTER WORKFLOW — exact path today (`main` + HDH)

```
Leah on testing host (HOME_DAYCARE_HUB_TESTING=true)
  → Home Daycare Hub → Invite a tester (email + optional child name)
  → POST /api/home-daycare-hub/tester-invites
  → Email (if configured) and/or copy ?testerInvite=TOKEN
       ↓
Tester opens link → peek invite → signup/login as invited email → accept
       ↓
Server creates:
  • users[email]: role=owner, accountType=home_daycare,
    hdhIndependentTester=true, Testing Pro entitlement path
  • programs[prog_*] + starter child in programData
  • NO Admin access
       ↓
Tester uses provider tools (Children, Daily Logs, Classroom, Messages → Leah)
Optional: Family Hub household invite for parent side
Optional: Staff invite into Leah’s program (shared data) — different path
Optional: Admin enables Multi-Role Tester → header Switch View
```

**Gaps vs desired Add Tester wizard**

- No Program Type choice (home/center/single)  
- No testing cohort / feature access checklist  
- No “add to existing test program” Admin path for independent testers  
- No dedicated status lifecycle UI (Invited → Activated → Active → Disabled → Testing Complete)  
- Invitation resend missing  

---

# USER TYPES — now vs needed

| Type | Exists? | Experience today | Needed change |
|---|---|---|---|
| Home Daycare Owner | Yes | Best-supported path on HDH testing | Keep as default simple path |
| Center Owner / Director | Partial | Account type + roles exist; center depth incomplete | Stronger classroom/staff/director attention surfaces |
| Teacher | Yes | Work-mode Today + classroom filter | Phone-first care loop polish |
| Assistant | Yes | Slimmer nav; server write ACL too open | Backend permission enforcement |
| Family / Parent | Yes (Family Hub session, not provider role) | Invite/magic link; Today/messages/forms ack | Complete delivery + e-sign later |
| Owner Admin (Leah) | Yes but wrong shape for testing ops | Production SaaS Admin + bolted Testing Center | Dedicated testing ops navigation |

---

# NAVIGATION

## What each role sees now (work-mode, HDH testing ON)

| Role | Nav | Landing |
|---|---|---|
| Owner / Director | Home, Children, Classroom, Families, Business, Settings | Owner Home pulse |
| Teacher | Today, My Children, Classroom, Families, More | Teacher Today |
| Assistant | Today, Children, Classroom, Messages, More | Today |
| Parent | Family Hub only | Family Hub Today |
| Owner Admin | Separate Admin shell (not customer nav) | Admin Home / Full Dashboard |

Legacy nav (Calendar, Lessons, Daily Logs, AI, …) still exists when HDH testing is off / non-work-mode.

## What should change (recommendation — do not implement blindly)

**Do not** dump every feature into one sidebar.

Recommended simplification after Owner Admin Phase 2:

**Provider (home daycare / teacher-first):**

- TODAY  
- CHILDREN  
- CLASSROOM / DOCUMENTATION  
- FAMILIES (messages + Family Hub tools)  
- CURRICULUM (lesson plans / planner)  
- MANAGEMENT (Forms, Billing when ready, Staff, Reports) — role-gated  
- SETTINGS  

**Owner Admin (separate product nav):**

- Dashboard (ENVIRONMENT: TESTING)  
- Testers  
- Programs  
- Users  
- Feature Flags  
- Feedback  
- Errors / QA  
- Audit Log  
- System Status  
- (Existing Content / Website / Marketing kept, but secondary on testing hosts)

Home daycare and teachers should see fewer items than directors. That principle is already started in work-mode — preserve it.

---

# SYSTEM CONNECTION MAP

```
PROGRAM (programs[programId])
  ├── STAFF (programMembers + invites + role + classroomIds)
  ├── CLASSROOMS (schedule.classrooms + child.classroomId)
  ├── CHILDREN (Profiles in programData.child / llhChild local)
  │     ├── Attendance / Meals / Naps / Diapers / ActivityLogs
  │     ├── Observations / Goals / SupportPlans
  │     ├── Reports / Photos / Documents (forms)
  │     ├── Communications (care notes)
  │     └── Timeline (aggregate)
  ├── GUARDIANS / HOUSEHOLDS (familyHouseholds) ── Family Hub session
  │     ├── Family Hub Today (shared care facts)
  │     ├── Family Hub Messages
  │     └── Forms acknowledge
  ├── SCHEDULE / CALENDAR (lessons by classroom/week — not by child)
  └── BILLING
        ├── LLH membership Stripe (software subscription) ✅
        └── Family tuition / invoices / payments ❌ missing
```

### Connection quality

| Link | Status |
|---|---|
| Child → Daily Logs / Attendance / Observations | Connected |
| Child → Classroom roster | Connected via `classroomId` |
| Child → Family Hub | Connected when household exists + `shareWithFamily` |
| Child → Forms / Documents | Connected after assign/pack |
| Child → Lesson Plans | **Weak** — lessons are classroom/week, not child roster |
| Staff → Classroom filter | UI connected; **server ACL weak** |
| Guardian → Billing | **Broken / missing** (tuition product absent) |
| Observation → Goal → Activity → next Observation | **Partial** |
| Activity Center → Daily Log “we did this” | **Weak** |
| Platform Messages ↔ Family Hub Messages | **Two systems** (bridged in places; easy to confuse) |

---

# BROKEN CONNECTIONS

1. **Child without Family Hub household** — sharing flags do nothing for parents until invite.  
2. **Lessons not tied to enrolled children** — classroom schedule only.  
3. **Activity planned ≠ activity documented** — requires re-entry.  
4. **Staff helper restrictions mostly frontend** — `canWriteProgramData: true` for all members (`server/program-ownership.js`).  
5. **Forms status lifecycle incomplete** — no full Draft→Sent→Viewed→Needs Signature→Completed→Expired product; acknowledge ≠ legal e-sign.  
6. **Tuition billing loop absent** — Family Hub cannot show real invoices/payments.  
7. **Owner Admin ↔ Testers** — tester creation lives in provider HDH UI, not Admin Testers.  
8. **July Testing Lab ↔ main HDH** — duplicate nouns, different models; cannot “just merge.”  
9. **Platform Messages vs Family Hub** — same word “Messages,” different jobs.  
10. **Multi-device sync** — still fragile without reliable authenticated cloud path for all child stores.

---

# DUPLICATION

| Concept | Multiple copies | Risk |
|---|---|---|
| Child identity | Profiles ↔ `programData.child` ↔ legacy `childData[uid]` ↔ household snapshot | Drift on rename/archive |
| Program model | `programs` on main ↔ `organizations` foundation on July branch | Architecture fork |
| Today / ops home | Owner Home ↔ Teacher Today ↔ Daily Logs ↔ July Today Hub | Roadmap confusion |
| Forms | Forms Library ↔ HDH pack ↔ Documents ↔ July Forms Center | “Where do I go?” |
| Messaging | Support Messages ↔ Communications ↔ Family Hub threads | Provider confusion |
| Goals | Profile text fields ↔ Goals store ↔ derived cards | Incomplete cycle |
| Permissions | Role matrix ↔ HDH visibility presets ↔ open server writes | False sense of security |
| Admin testing tools | Admin Testing Center (main) ↔ Testing Lab (July) | Leah cannot know which is “real” |

**Rule going forward:** One operational child = Profiles. One program model = `programs`/`programData` on main. Port Testing Lab UX ideas; do not dual-run organization foundations without a migration plan.

---

# UNFINISHED FEATURES (looks built, not complete)

| Feature | Looks like | Actually |
|---|---|---|
| Forms Center | Packs, docs, parent ack | Not legal e-sign / email send / structured parent fill |
| Family Hub | Parent app | Care share works; tuition/billing/calendar completeness incomplete |
| Behavior Support | Library + AI notes | No living plan with tracking |
| Director Center | Nav / tools | Not a true “needs attention” command surface on main |
| Billing | Stripe + Admin Billing | Software subscription only — not family tuition |
| Reports | Snapshot aggregates | Not ops/finance KPIs |
| Observation→Goal cycle | Suggestions exist | Not automatic closed loop |
| Staff management | Invites + roles | Not training/cert expiry product |
| Owner Admin Testing Center | Role preview + seed | Not Add Tester / Programs / Flags / Audit console |
| July Testing Lab | Full console screenshots | Not on the live `main`-based testing spine |

---

# CONFUSING FEATURES (working but hard for normal users)

1. **Where to add testers** (HDH invite) vs **where to View As** (Admin Testing Center) vs **Multi-Role Switch View** (tester header). Three mental models.  
2. **Messages** meaning support chat vs Family Hub parent chat.  
3. **Forms Library vs Forms & Records vs HDH pack.**  
4. **Testing Pro** (automatic unlock) vs real Stripe Pro.  
5. **Owner Admin** packed with marketing/SEO/content while tester ops are buried under Advanced.  
6. **Work-mode vs legacy nav** depending on fence/login/role.  
7. Historical docs referring to July Director Center as if it were live on the same host as HDH Family Hub.

---

# DATABASE / STORE CONCERNS

### On `main`

- Single large store (`programs`, `programData`, `users`, `familyHouseholds`, `messages`, `siteContent`, …).  
- Child keys: Profiles, Observations, Goals, Attendance, Meals, Naps, Diapers, ActivityLogs, Photos, Documents, Communications, Reports, SupportPlans, Differentiations, MealPresets.  
- Tester-specific: `hdhTesterInvites`, `hdhIndependentTester`, `testerRoleSwitches`, `multiRoleTester`.  
- Membership audit exists; **full admin action audit does not**.  

### Risks

1. Dual-writing child data (local + program blob + legacy) without ironclad sync rules.  
2. Household child snapshots can drift from Profiles.  
3. Accidental enabling of `HOME_DAYCARE_HUB_TESTING` on production would expose Family Hub / Testing Pro.  
4. Shared Stripe live keys on testing service could charge real money (fence does not force test mode).  
5. July foundation `organizations` model must not be introduced as a second source of truth without migration.

### Testing branch extras (not on main)

`store.testingLab` (audit, notes, checklist, previews), fake organizations, testing feedback threads, expansion feature flags, billing simulator fixtures.

---

# PERMISSION CONCERNS

| Issue | Severity | Notes |
|---|---|---|
| `canWriteProgramData: true` for all program members | **High** | Assistants can mutate full child/schedule payloads server-side |
| HDH helper presets frontend-only | **High** | Only meaningful when fence on; not real security |
| Testing Pro for every signed-in HDH user | **Critical if fence leaks to prod** | Fine on testing; catastrophic on production |
| Teachers vs forms capability mismatch | Medium | Role matrix vs HDH lead presets can disagree |
| Parent security is invite-token based | Expected | Not RBAC; must stay invite-scoped |
| Admin unlock correctly blocked for testers | Good | Keep |

---

# TESTING SAFETY

### What protects testing today

| Control | Status |
|---|---|
| `HOME_DAYCARE_HUB_TESTING` env fence | Strong for FH/HDH APIs (404 when off) |
| Separate testing Render host (Dashboard) | Documented; **not** declared as second service in `render.yaml` |
| `test-account-guard.js` | Rejects ephemeral QA emails on Postgres |
| Family Hub durability checks | Refuses ephemeral `/tmp` stores unless explicitly allowed |
| Checkout simulation when Stripe unset | Safe locally |
| SMS simulated on Family Hub invites | Safe |
| Independent testers blocked from Admin | Good |

### Remaining dangers

1. **No Blueprint-enforced separation** of testing vs production services in `render.yaml` (single prod service defined).  
2. **Stripe mode not automatically forced to test** by the HDH fence.  
3. **Email keys on testing** can still send real mail if configured.  
4. **Global TESTING chrome is weak** after sticky tester UI was removed from main shell.  
5. **No giant delete button** is good — but also no safe scoped reset with confirmation/audit.  
6. **July branch APIs** were designed with fake-only guards; do not enable them on a host sharing production DB.

**Policy reminder:** Never put live billing, production customer data, or production curriculum wipe tools on the testing Owner Admin path.

---

# OWNER ADMIN RECOMMENDATIONS

Build a **Testing Ops** area inside Owner Admin on the **HDH/`main` spine**. Reuse Testing Lab UX patterns from the July branch; do not merge the July data model wholesale.

### Target Owner Admin (testing host)

1. **Dashboard** — large `ENVIRONMENT: TESTING` banner; tester/program/family/form/message counts; recent admin activity; open feedback; recent errors.  
2. **Testers** — Add Tester wizard; statuses; detail page; enable/disable; copy invite / regenerate; feature access; notes; View As Tester; audit.  
3. **Programs** — search test programs; type; staff/children counts; features; open detail.  
4. **Users** — keep existing user tools; add tester/program filters.  
5. **Feature Flags** — Global testing vs per-account; never imply production is changed.  
6. **Feedback** — testing feedback with page/role/programType/flag context.  
7. **Errors / QA** — human-readable cards + technical detail drawer.  
8. **Audit Log** — tester created, disabled, impersonated, flags changed, data reset.  
9. **Test Data tools** — create sample home daycare / center; scoped reset with typed confirmation.  
10. Keep existing Content / Website / Marketing, but de-emphasize them on testing hosts.

### Add Tester wizard (minimum fields)

- Name, Email  
- Program: create new **or** join existing test program  
- Program type: Home Daycare / Center / Single Provider  
- Role: Owner / Director / Teacher / Assistant  
- Testing focus chips: Family Hub / Forms / Billing / Director / Teacher Workflow / Full Platform  
- Notes  
- Actions: Create → Copy Invite Link / Generate Test Login (testing-only)

### View As rules

- Banner: `OWNER ADMIN — VIEWING AS [TESTER]`  
- Always-visible Exit  
- Server-authorized; audited  
- Never expose passwords  
- Never become permanent auth  

---

# ROADMAP (safest order)

Adjusted slightly from the requested order for architecture reality: **Owner Admin must come early**, but **safety + single spine decision is first**. Daily ops already work better than Owner Admin — so Phase 2 is the highest leverage owner-pain fix.

## PHASE 1 — SAFETY + ARCHITECTURE (do first)

**Goal:** One testing spine; no production bleed; clear environment identity.

- Confirm testing Render service isolation (DB, Stripe test keys, email sandbox/off).  
- Declare testing vs production separation in docs/runbooks (and Blueprint if/when a second service is managed).  
- Persist obvious `TESTING ENVIRONMENT` indicator in Owner Admin always; light non-annoying indicator for testers.  
- **Decision recorded:** Spine A (`main` HDH) is product truth; Spine B Testing Lab is UX reference only.  
- Inventory/forbid accidental dual child models and July org imports without migration.  
- Permission spike: plan server ACL for assistant/teacher writes (implement in Phase 4 if needed for safety sooner).  

**Exit criteria:** Leah can tell testing from production instantly; no path to live charges/emails/data wipe from testing ops.

## PHASE 2 — OWNER ADMIN / TESTER CONTROL (highest owner leverage)

**Goal:** Leah runs testing without Cursor/database.

- Testers list + Add Tester wizard  
- Create/join test program; home vs center  
- Invite copy link / regenerate; activation status  
- Disable/archive (no delete-by-default)  
- Tester detail + feature access toggles  
- View As Tester with banner + audit  
- Feature Flags (global testing vs per tester)  
- Programs search/detail (overview first)  
- Testing feedback inbox (reuse/adapt July ideas on main store)  
- Scoped reset with confirmation + audit  

**Exit criteria:** Leah can add a home daycare tester and a center tester, enable Family Hub for one of them, copy invite, see activation, View As, and disable — without a developer.

## PHASE 3 — NAVIGATION + ROLE EXPERIENCES

**Goal:** Each role sees only what they need.

- Keep work-mode role asymmetry (already started).  
- Collapse confusing duplicates (Messages labeling; Forms entry points).  
- Owner Admin gets its own testing ops nav (not buried under Advanced).  
- Home daycare path stays short; center path adds classrooms/staff without forcing home daycares through center setup.  

## PHASE 4 — CHILD / STAFF / FAMILY DATA CONNECTIONS

**Goal:** One source of truth.

- Harden Profiles as sole child identity; fix household snapshot drift.  
- Server-enforce classroom/staff write permissions.  
- Ensure Add Child appears everywhere appropriate (classroom, daily, forms, Family Hub invite path).  
- Guardian ↔ child ↔ Family Hub ↔ messages single graph.  

## PHASE 5 — DAILY OPERATIONS

**Goal:** Teachers run the day in minutes.

- Strengthen Today (who’s here, plan, attention, incomplete reports).  
- Group documentation with per-child exceptions.  
- One-tap “logged planned activity.”  
- Classroom Assistant: draft from free text → provider reviews before save (no silent AI writes).  

## PHASE 6 — FAMILY HUB

**Goal:** Provider workflow creates what families see.

- Complete invite → activate → Today → messages → forms path.  
- Owner Admin preview of specific family experience.  
- Clear share defaults; less toggle hunting.  
- Safe email/SMS later — preview/copy links until sandbox exists.  

## PHASE 7 — FORMS

**Goal:** Real document workflows.

- Status model: Draft / Sent / Viewed / Needs Signature / Completed / Expired / Needs Attention  
- Attach completed forms to child or staff  
- Parent/staff completion paths  
- Legal e-sign only when intentionally built  

## PHASE 8 — BILLING (family tuition)

**Goal:** Safe test billing connected to family/child.

- Test-mode / simulator only on testing  
- Invoice ↔ family ↔ guardian ↔ child ↔ Family Hub  
- Owner Admin clearly labels TEST PAYMENT / NO REAL MONEY  
- Do not touch production Stripe customers  

## PHASE 9 — AI CONNECTIONS

**Goal:** Save provider time; never silent record changes.

- Grounded drafts for daily docs, observations, goals, classroom assistant  
- Always review-before-save  
- Testing uses mocks/limits; no surprise production AI bills  

## PHASE 10 — QA + POLISH

- Mobile, a11y, performance, empty/loading states  
- Permission regression matrix  
- Workflow completeness tests (not just page existence)  
- Scenario checklist: new home daycare, new center, add child, invite family, send form, daily report, observation, invoice (test), etc.  

---

# WHAT NOT TO DO NEXT

- Do not merge `testing/full-platform-integration-2026-07` wholesale into main.  
- Do not rebuild Teaching Kit / curriculum as part of Owner Admin work.  
- Do not add more disconnected pages (another Forms Center, another Today, another messaging system).  
- Do not create a second Child or Family model.  
- Do not enable live Stripe charges or real family email blasts from testing.  
- Do not put a prominent DELETE EVERYTHING control anywhere.  
- Do not ask Cursor to invent one-off testers in the database once Phase 2 ships.

---

# DEFINITION OF “COMPLETE” (adopt as working rule)

A feature is complete only when the **workflow** works:

Example — Add Child is complete when:

1. Director/owner adds child  
2. Child appears in correct classroom  
3. Child appears in daily workflow  
4. Child profile works  
5. Guardian can be connected  
6. Forms can attach  
7. Family Hub can connect  
8. Permissions work (server + UI)  
9. Refresh does not lose data  
10. Mobile works  
11. No silent errors  

Page existence ≠ complete.

---

# NORTH STAR CHECK (use on every PR)

> Does this make running a childcare program easier — or make Leah operate testing without a developer?

If neither, reconsider.

---

# APPENDIX A — Key code evidence

| Area | Location |
|---|---|
| HDH fence | `server/index.js` (`HOME_DAYCARE_HUB_TESTING`, `requireHomeDaycareHubTesting`) |
| Program ownership / open writes | `server/program-ownership.js` (`canWriteProgramData: true`) |
| Tester invites | `/api/home-daycare-hub/tester-invites*` in `server/index.js` |
| Family Hub | `server/family-hub-lib.js` + `/api/family-hub/*` |
| Admin groups / Testing Center | `app.js` (`adminGroups`, `#adminTestingCenter`) |
| Multi-role tester | `scripts/multi-role-tester.js` |
| Test account guard | `server/test-account-guard.js` |
| Admin auth | `POST /api/admin/login`, `server/admin-session-store.js` |
| July Testing Lab (reference only) | `origin/testing/...` → `server/testing-lab-api.js`, `testing-lab-ui.js`, `scripts/testing-lab-data-model.js` |

# APPENDIX B — Prior audits reused

- `docs/audits/ECOSYSTEM_MASTER_CHECKLIST.md`  
- `docs/audits/FEATURE_COMPLETENESS_ROADMAP.md`  
- `docs/audits/MISSING_CONNECTIONS_AUDIT.md`  
- `docs/audits/PROVIDER_WEEK_SIMULATION_REPORT.md`  
- `docs/audits/WORKFLOW_INTEGRATION_REPORT.md`  
- `docs/audits/NAV_ROLE_EXPERIENCE_REPORT.md`  
- `docs/audits/MULTI_ROLE_TESTER_REPORT.md`  
- `docs/audits/ADMIN_COMMAND_CENTER_AUDIT.md`  
- `docs/audits/FAMILY_HUB_TESTING_READINESS_REMEDIATION.md`  

---

**Next approved step after this report:** Phase 1 safety checklist confirmation, then Phase 2 Owner Admin Testers console on the HDH/`main` spine — still testing-only, no production merge of experimental stacks.
