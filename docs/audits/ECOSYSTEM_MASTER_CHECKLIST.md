# Little Learner Hub — Ecosystem Master Checklist

**Environment:** Testing site only (`little-learner-hub-testing.onrender.com`)  
**Shell at audit:** `20260803-ecosystem-pass`  
**Date:** 2026-08-03  
**Rule:** Do not merge. Do not deploy production.  
**Final report:** `docs/audits/ECOSYSTEM_FINAL_READINESS_REPORT.md`

Status key:

| Mark | Meaning |
|---|---|
| ✅ | Exists, connected, usable for internal testers |
| 🟡 | Partial — usable with gaps or extra steps |
| 🔴 | Missing, stub, Coming Soon, or disconnected |
| 🧪 | Testing-fence only (`HOME_DAYCARE_HUB_TESTING` / AI Guide) |
| 🎭 | Demo / seed / simulated (not real delivery) |

---

## 1. Core platform

| System | Status | Connected to | Notes |
|---|---|---|---|
| Dashboard | 🟡 | Calendar (default home) | Logged-in Dashboard remaps to Calendar; dashboard tasks page still exists |
| Calendar | ✅ | Lesson plans, classrooms, child birthdays/enrollment | Lesson assign is classroom-scoped, not child-roster |
| Lesson Plans | ✅ | Calendar, Teaching Kit, Free/Pro locks | Pro-gated generation on server |
| Activity Center | ✅ | Curriculum library, lesson linking | Production |
| Child Profiles | ✅ | Daily Logs, Attendance, Observations, Reports, Forms docs, AI pickers | Source of truth: `Profiles` |
| Daily Logs | ✅ | Attendance, meals, naps, diapers, photos, reports, AI suggestions | Marketing pill now Available |
| Attendance | 🟡 | Inside Daily Logs + child tab | No standalone nav; check-in can share to Family Hub |
| Observations | ✅ | Child Profiles, AI helpers, Calendar reminders | Share-with-family optional |
| Parent Messages | 🟡 | Communications + Family Hub thread (testing) | Two systems: care notes vs FH chat; bridge live |
| Incident Reports | 🟡 | AI helper + Daily Logs (Pro form) | Not a standalone product nav |
| Behavior Support | 🟡 | Topic library + AI Behavior Note / Parent Message | Dedicated plan builder postponed |
| Staff Management | 🟡 | Invites, roles, shared program | Classroom filter enforced for linked staff |
| Classrooms | ✅ | Schedule rooms + calendar + child roster | Children assign via `classroomId` |
| Family Hub | 🧪✅ | Households, Today, Photos, Messages, Calendar, Forms acknowledge | Testing-only; durable Postgres on testing |
| Forms Center | 🟡 | Library + Documents + HDH pack + in-app share/ack | Not email/SMS or legal e-sign yet |
| Notifications | ✅ | In-app bell + Family Hub notifications | Push optional |
| Billing | ✅ | Stripe checkout/portal/webhooks | Owner-only; testing often NOT READY |
| AI Tools | ✅ | Documentation Helpers grounded on testing | Lesson AI unlocked when HDH testing fence on |
| Reports | 🟡 | Local snapshot aggregates | Pro-gated; not admin reporting suite |
| Admin | ✅ | Full operator console | Leah-only; blocked for linked staff |

---

## 2. Child workflow — “create once, appear everywhere”

Creating a child writes `Profiles` (`saveChildStore("Profiles")`).

| Destination | Auto? | Status | Extra step required? |
|---|---|---|---|
| Child Profiles | Yes | ✅ | — |
| Daily Logs | Yes | ✅ | — |
| Attendance | Yes | ✅ | — |
| Observations | Yes | ✅ | — |
| Reports (provider) | Yes | ✅ | — |
| AI child pickers | Yes | ✅ | — |
| Forms & Records (Documents) | Yes (picker) | 🟡 | Must assign/add form to file |
| Calendar (birthdays / enrollment) | Yes if dates set | 🟡 | Enrollment convert may omit date |
| Lesson Plans | No roster link | 🔴 | Lessons assigned by classroom/week, not child |
| Classrooms | Yes (`classroomId`) | ✅ | Roster on Classrooms page |
| Family Hub | Partial auto-link | 🟡 | Auto-link when 1 household or parent email matches; else invite |
| Parent Messages (FH thread) | No | 🟡 | Needs household + share/bridge |
| Parent Messages (care notes) | Yes | ✅ | Local Communications |

**Duplicate child sources risk**

| Source | Role | Risk |
|---|---|---|
| `llhChild:{email}:Profiles` | UI source of truth | Primary |
| `programData[programId].child` | Shared program blob | Sync needs Firebase |
| `store.childData[uid]` | Legacy mirror | Rollback path |
| `household.children` | Invite snapshot | Can drift if child renamed/added later |
| Schedule classrooms | Rooms only | Not a child registry |

**Rule for beta:** One operational child record = Profiles. Family Hub and Classrooms are parallel models until roster sync ships.

---

## 3. Staff workflow

| Capability | Status | Notes |
|---|---|---|
| Invite staff | ✅ | `/api/staff/invites` |
| Roles (owner/director/teacher/assistant) | ✅ | Coarse capability matrix |
| Permissions (billing/staff/forms) | 🟡 | Role matrix works; HDH presets testing-only |
| Assigned classrooms | 🟡 | Stored on invite; UI filters children for linked staff |
| Assigned children | 🔴 | No model beyond classroom filter |
| Shared schedules | ✅ | Via program schedule when linked + Firebase |
| Observations / Daily Logs | 🟡 | Filtered when staff has `classroomIds` |
| Messaging | 🟡 | Support Messages ≠ Family Hub |
| AI tools by permission | 🟡 | Usage/plan gated; not role-scoped beyond view hides |
| Admin blocked for staff | ✅ | Linked staff / independent testers |

Unchecked from existing matrix (`SUBSCRIPTION_PERMISSION_TEST_MATRIX.md`):  
“Staff see only assigned classrooms/children”.

---

## 4. Forms — first-class feature scorecard

| Capability | Status | Evidence |
|---|---|---|
| Generate forms with AI | 🟡 | HDH AI draft + Form Builder; local fallback |
| Edit forms | 🟡 | Editable text / contenteditable; not structured builder |
| Save templates | 🟡 | Pack templates + library; no custom program template save |
| Assign forms | 🟡 | Add to child Documents / pack; no due-date parent assign |
| Send forms | 🔴 | Explicitly “not available yet” |
| Receive completed forms | 🟡 | Status Received/Signed; no filled-body intake |
| Parent e-signatures | 🟡 | Acknowledge/sign name (testing FH); not legal e-sign |
| Store in child profiles | ✅ | Documents store + Forms & Records |
| Print forms | ✅ | Print / Save PDF |

---

## 5. AI — real vs weak vs blocked

Live probe on testing (`/api/ai-generate`, 2026-08-03):

| Tool | Backend | Live result | Tester-ready? |
|---|---|---|---|
| observation | REAL | Produced document; sometimes ignores provided child name | 🟡 |
| lesson | REAL | **403 Pro Membership** for Free/test owner | 🟡 (needs Pro/owner access) |
| daily | REAL | Produced report but invented wrong child/date | 🟡 quality |
| parentMessage | REAL | Returned refusal: “can't assist” | 🔴 broken quality |
| activity | REAL | Solid activity doc | ✅ |
| behaviorNote | REAL | Template with `[Child's Name]` placeholders | 🟡 |
| incidentReport | REAL | Asked for more details instead of drafting | 🔴 weak |
| form | REAL | Returned a form-like doc | 🟡 |
| Documentation Helpers UI | REAL | Errors if OpenAI fails (no fake draft) | ✅ |
| Behavior plans product | Coming Soon | Cards only | 🔴 |
| Provider Tools (futureTools) | Local templates | Non-OpenAI generators | 🎭 |
| Family send of AI forms | Stub copy | “not available yet” | 🔴 |

---

## 6. Cross-feature validation checklist (manual)

Use this on the testing site before inviting testers:

- [ ] Create child → appears in Daily Logs child picker same session
- [ ] Check-in → Attendance row; parent Today shows arrival when shared + synced
- [ ] Log meal/nap/diaper with Share on → Family Hub Today (after cloud sync + household)
- [ ] Generate daily report Share on → parent Reports
- [ ] Upload photo Share on → parent Photos
- [ ] Add form pack to child → Documents; parent Forms if household linked
- [ ] Parent acknowledge form → signed status persists after logout/login
- [ ] Parent message ↔ provider (FH thread)
- [ ] Shared Parent Message Communication bridges into FH Messages
- [ ] Staff invite accept → shared Profiles (Firebase path)
- [ ] Staff helper cannot open Hub/Forms when HDH preset helper
- [ ] Staff cannot open Admin
- [ ] Free user does not see Free + Pro badges simultaneously
- [ ] Magic link URL never lands in Marketing Analytics landing pages
- [ ] Lesson plan X closes from library and calendar
- [ ] What’s New shows at least one published note
- [ ] AI Tools does not show false “Needs attention” before load

---

## 7. Ecosystem readiness gates

| Gate | Ready? |
|---|---|
| Leah review of this checklist | pending |
| First 3 internal testers | after Leah OK on testing site |
| Expand beyond 3 | after Forms send + staff classroom filter + AI quality fixes |
| Production | ❌ blocked |
| Merge to `main` | ❌ blocked |
