# Missing Connections Audit

**Purpose:** Every place one feature *should* talk to another but doesn’t yet.  
These integration gaps make the product feel unfinished even when individual screens work.

**Environment:** Testing site / branch `cursor/family-hub-testing-readiness-d3df`  
**Date:** 2026-08-03

Severity:

| Level | Meaning |
|---|---|
| P0 | Breaks trust or security before any testers |
| P1 | Blocks “complete childcare day” or staff trust |
| P2 | Feels unfinished; fix before expanding beta |
| P3 | Nice-to-have / post-beta |

---

## A. Child → everywhere

| # | From | Should connect to | Gap | Severity |
|---|---|---|---|---|
| C1 | Create child in Profiles | Classrooms roster | **Fixed (ecosystem pass):** `classroomId` select + Classrooms roster counts. | ✅ |
| C2 | Create child | Family Hub household | **Fixed (partial):** auto-link via PATCH children when 1 household or parent email matches. | 🟡 |
| C3 | Create child | Lesson plan assignment | Lessons assign to classroom/week, never auto-scope to enrolled children. | P2 |
| C4 | Create child | Calendar events beyond birthday | No auto “first day”, classroom events, or form due dates on calendar. | P2 |
| C5 | Rename/archive child | Family Hub `household.children` snapshot | Snapshot can show stale name; archived child may still be linked until revoke. | P2 |
| C6 | Enrollment lead → child | `enrollmentDate` + Calendar anniversary | Convert path often omits enrollmentDate until “Mark enrolled”. | P2 |
| C7 | Local Profiles (no Firebase) | Staff / second device / Family Hub live feed | `queueChildDataCloudSave` no-ops without Firebase → multi-login and parent Today can miss live logs. | P1 |
| C8 | Duplicate registries | Single child identity | Profiles vs program child blob vs household snapshot vs schedule optional `childId` — must stay reconciled manually. | P1 |

---

## B. Daily operations → Family Hub

| # | From | Should connect to | Gap | Severity |
|---|---|---|---|---|
| D1 | Attendance Absent | Parent Today | Intentionally private today; no “Absent today” family notice. | P3 |
| D2 | Observations (many save paths) | Parent Today | Only when `shareWithFamily === true`; some paths historically defaulted off (quick action now on). | P2 |
| D3 | Child tab legacy forms | Share with Family | Nap/communication legacy forms often omit share flag → provider-only. | P2 |
| D4 | Photo quick action | Real photo | Creates placeholder caption (“add image from Photos tab”) — dead-end until Photos tab upload. | P2 |
| D5 | Communications (Parent Message) | Family Hub Messages | Bridge exists for shared notes with body, but empty drafts don’t send; two UIs still exist. | P1 |
| D6 | Provider Daily Logs | Parent without household | Shared flags do nothing until Family Hub invite exists. | P1 |
| D7 | End-of-day report | Auto push + notification | Report appears if shared+synced; no guaranteed “report ready” notification every day. | P2 |

---

## C. Forms ecosystem

| # | From | Should connect to | Gap | Severity |
|---|---|---|---|---|
| F1 | AI form draft | Send to parent | **Fixed (in-app):** Share with Family Hub + provider-notifications; still no email/SMS. | 🟡 |
| F2 | Assign form to child | Parent Forms inbox + due date | Assign + share/notify works; due dates/reminders still light. | 🟡 |
| F3 | Parent acknowledge | Admin reporting / provider dashboard badge | Signed status on Documents; no admin form-completion report; weak provider “needs attention” surface. | P2 |
| F4 | Forms Library | Program templates | Cannot save customized form as reusable program template. | P2 |
| F5 | Edit form | Structured fields | Printable/fill-in text, not field schema editor. | P2 |
| F6 | Parent e-sign | Legal signature + PDF | Acknowledge stores signer name/timestamp only. | P1 |
| F7 | Completed form | Child profile packet history | Status updates yes; filled body/PDF return path missing. | P1 |
| F8 | Forms nav | Discoverability | “Forms & Enrollment” nav hidden; Forms Settings vs HDH pack vs Library fragmented. | P2 |
| F9 | Invite document snapshot | Acknowledge by id | Snapshot historically dropped ids; relies on live Documents for signing. | P2 |

---

## D. Staff & classrooms

| # | From | Should connect to | Gap | Severity |
|---|---|---|---|---|
| S1 | Staff `classroomIds` | Child list / Daily Logs / Observations | **Fixed (UI):** linked staff with `classroomIds` filtered in `getActiveChildren`. | ✅ |
| S2 | Assigned children | Any surface | No assigned-children model. | P1 |
| S3 | HDH helper/lead presets | Production staff | Only enforced when `HOME_DAYCARE_HUB_TESTING`; production uses coarse role matrix. | P1 |
| S4 | Teacher/assistant role | Forms capability | `roleAllowsCapability("forms")` false even if HDH lead preset enables forms_records. | P2 |
| S5 | Staff schedule | Own shift calendar | No staff shift schedule product; only program lesson calendar. | P2 |
| S6 | Staff messaging | Family Hub / parents | No staff→parent messaging permission model; FH is household-scoped. | P2 |
| S7 | Server write ACL | Helper restrictions | `canWriteProgramData: true` for all members — helpers can write everything server-side. | P1 |
| S8 | Local invite fallback | Real membership | Without backend accept, invite stays local pending — no shared data. | P2 |

---

## E. AI ↔ product

| # | From | Should connect to | Gap | Severity |
|---|---|---|---|---|
| A1 | Documentation Helpers input | Model output | **Fixed (prompts):** grounded child/date/classroom/notes client+server; never-refuse guidance. Re-verify live model behavior after deploy. | 🟡 |
| A2 | Lesson AI | Free/testing owners | **Fixed on testing fence:** Pro gate skipped when `HOME_DAYCARE_HUB_TESTING`. | ✅ |
| A3 | Behavior Note AI | Behavior plans | Notes + Support library live; dedicated plans product postponed. | 🟡 |
| A4 | AI form | Assign/send/sign pipeline | Draft → save → share/notify → parent acknowledge live; legal e-sign still out. | 🟡 |
| A5 | AI Guide | Documentation Helpers | Parallel surfaces; testers may not know which is canonical. | P3 |
| A6 | Offline `generate*` templates | Doc Helpers failure | Doc Helpers show error (good); HDH forms fall back to local templates (can feel “fake AI”). | P3 |
| A7 | Provider Tools / futureTools | OpenAI | Local non-AI generators — should be labeled clearly, not as AI. | P2 |

---

## F. Calendar / lessons / activities

| # | From | Should connect to | Gap | Severity |
|---|---|---|---|---|
| L1 | Calendar lesson assign | Child attendance / daily logs | No “who was present for this lesson” link. | P3 |
| L2 | Activity Center | Daily Logs activity log | Manual re-entry; no “log this activity for child” one-tap. | P2 |
| L3 | Teaching Kit | Family Hub | Classroom prep stays provider-side (OK) — no family weekly summary auto-post. | P3 |
| L4 | Classroom event | Family Hub Calendar | Only when type/share flags family-facing. Easy to create provider-only events by mistake. | P2 |

---

## G. Messaging & notifications

| # | From | Should connect to | Gap | Severity |
|---|---|---|---|---|
| M1 | Platform “Messages” | Parent Family Hub | Completely different system (Leah/support). Label confusion risk. | P1 |
| M2 | Notification bell | Family Hub notifications | Separate stores; parent mode uses FH notifications. | P2 |
| M3 | Email/SMS delivery | Invites / forms / reports | Testing: `emailDeliveryReady: false`, SMS simulated — manual copy links. | 🎭 P1 for “real” ops |
| M4 | Billing events | In-app notifications | Exists for some paths; not audited end-to-end on testing. | P3 |

---

## H. Admin / reporting / billing

| # | From | Should connect to | Gap | Severity |
|---|---|---|---|---|
| R1 | Child forms completion | Admin reporting | No admin form-completion dashboard. | P2 |
| R2 | Daily Logs volume | Admin feature usage | Event-level only; not operational childcare KPIs. | P3 |
| R3 | Membership state | UI badge + access + admin | Improved (P1 pass); still dual sources (`llhPlan` vs account vs server). | P2 |
| R4 | Marketing Analytics | Secret URLs | Redaction shipped; household list still returns `magicUrl` to provider (intentional copy, watch logs). | P2 |
| R5 | Launch readiness | Testing secrets | `launchReady: false` expected without full Stripe/email — do not treat as product broken. | — |

---

## I. UX / product integrity (feels unfinished)

| # | Issue | Severity |
|---|---|---|
| U1 | Homepage Daily operations “In Development” | ✅ Fixed → Available |
| U2 | Director Center Coming Soon shell | ✅ Routes to live Staff/Classrooms/Children/Calendar |
| U3 | Family Hub Settings Coming Soon badge | ✅ Removed; helpful copy |
| U4 | Behavior Support Coming Soon cards | ✅ Replaced with live AI actions + library |
| U5 | Nested interactive controls on lesson/activity cards (a11y) | P2 |
| U6 | Photo quick action placeholder | ✅ Opens Photos tab |
| U7 | Forms experience split across Library / HDH / Documents / Settings | 🟡 Improved share path; still multi-surface |

---

## Recommended connection build order (ecosystem, not features)

1. **Child roster identity** — Profiles ↔ Classrooms (`classroomId`) ↔ Family Hub household membership sync when child added/removed.  
2. **Cloud sync path for testing** — ensure provider logs reach Family Hub without Firebase-only dead ends (or document Firebase as required for multi-party).  
3. **Forms spine** — AI draft → edit → assign → notify parent → acknowledge/e-sign → store → provider/admin status.  
4. **Staff assignment enforcement** — filter children/logs by `classroomIds`; server write ACLs for helpers.  
5. **AI input fidelity** — force childName/date/note into every tool; fail closed instead of inventing/refusing.  
6. **Unify messaging labels** — “Message Leah” vs “Message family” so testers never confuse systems.

---

## Connection map (target state)

```text
Profiles (child identity)
  ├─ Classrooms.roster[]
  ├─ Attendance / Daily Logs / Observations / Photos / Documents
  ├─ Calendar (child + classroom events)
  ├─ Lesson assignment context (optional per child)
  ├─ Family Hub households[] (live membership, not snapshot-only)
  │    ├─ Parent Today / Reports / Photos / Forms / Messages / Calendar
  │    └─ Notifications
  ├─ AI tools (always receive child context)
  └─ Admin/provider reports (completion + engagement)

Staff
  ├─ role + classroomIds + (optional) childIds
  ├─ filtered Profiles / Daily Logs / Observations
  ├─ AI + messaging per permission
  └─ no Admin / no Billing (non-owners)
```
