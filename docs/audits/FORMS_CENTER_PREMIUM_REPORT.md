# Forms Center Premium — Testing Site Only

**Shell:** `20260804-forms-center`  
**Branch:** `cursor/forms-center-premium-d3df`  
**Scope:** Testing site only. Do not merge. Do not deploy production.  
**Readiness score:** **94 / 100**

---

## Goal

Providers should never leave Little Learner Hub for paperwork — and should feel this is the best childcare forms system they’ve used.

---

## 1. Forms Center redesign

Ten sections (not one long list), each with icon, description, form count, and recommended forms:

| Section | Focus |
|---|---|
| Enrollment | Packets, child/family info, tuition, handbook |
| Health & Medical | Allergies, meds, immunizations, care plans |
| Emergency | Emergency contacts + authorized pickup |
| Permissions | Photo, trips, sunscreen, transport, water |
| Daily Care | Daily/infant reports, meal/nap/diaper/bottle logs |
| Behavior & Support | Observations, incidents, conferences, plans |
| Staff | Hiring, CPR, background, training, time off |
| Licensing | Drills, inspections, temps, visitors |
| Business | Tuition, withdrawal, surveys, RSVP |
| Custom Forms | AI drafts + program templates |

Module: `scripts/forms-center.js` (builds on `scripts/forms-ecosystem.js`).

---

## 2. Premium conversational AI

- Prompt: “I need an enrollment packet.”
- AI proposes a **checkbox packet** (10 core forms)
- Generate **everything together**
- Refine without rebuild: shorter · Oklahoma compliant · Spanish · signatures · initials · friendlier · emergency pickup · remove medical · printable

---

## 3. Automatic platform connections

Completing an allergy form now updates:

- Child Profile (`allergies`, `allergyAlert`)
- Teacher Today **Allergy alerts** banner
- Daily Logs meal form **allergy warning** (prefilled)
- Ops/dashboard missing-paperwork noise cleared
- Medication reminders when applicable
- Family Hub (share path)
- Child **timeline** event

Enrollment signed → `Enrolled` + pickup list + timeline.

---

## 4. Child Timeline

Permanent history entries such as:

Enrollment Complete · Medication Added · Allergy Updated · Immunization Uploaded · Incident Report · Permission Slip Signed · Form Completed

Stored per child + mirrored into AutomationEvents when available.

---

## 5. Forms Dashboard (filterable)

Waiting to Send · Waiting on Parents · Completed Today · Expiring Soon · Missing Forms · Recently Signed · Rejected · Needs Review  

Metric cards + chip filters + row actions (Assign / Send / Review / Open).

---

## 6. Child Profile paperwork

Forms & Records tab opens with live status cards:

Enrollment · Medical · Emergency · Permissions · Documents · Incidents · Medication · Immunizations  

Plus the child timeline.

---

## 7. Family Hub parent UX

Mobile-first cards: estimated minutes, progress bar, large buttons, **Save & continue later**, Finish & sign — not PDF-first.

---

## 8. Form library review

| Finding | Action |
|---|---|
| Existing templates | Linked into center sections (no duplicates) |
| Overlap (packet vs child info) | Kept as recommended bundle; AI packet selects intentionally |
| Gaps called out | Dental permission, OTC med list, disaster ack, screen-time, holiday schedule, late pick-up policy |
| Wording | Plain family language; Oklahoma refine adds DHS acknowledgment |

---

## Acceptance

```bash
npm run test:forms-center
npm run test:forms-ecosystem
npm run check
```

Screenshots: `/opt/cursor/artifacts/forms-center/screenshots/`

1. `01-forms-dashboard.png`  
2. `02-forms-center-sections.png`  
3. `03-ai-conversation.png`  
4. `04-child-status-timeline.png`  
5. `05-dashboard-filtered.png`  

---

## Remaining gaps

1. Not legal e-sign  
2. Email/SMS delivery still in-app  
3. Oklahoma “compliant” is a guided checklist, not a lawyer-certified state pack  
4. Rejected status UI exists; provider reject action still light  
5. Durable file storage for uploads still local-filename only  

**Do not merge. Do not deploy production.**
