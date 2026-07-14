# Future Onboarding & Pricing Rebuild

**Status:** Planning only — **not part of the current role/sidebar rebuild**  
**Related foundation:** Phase 1 account type + user role (`scripts/account-access.js`, PR work on account access)  
**Date:** July 14, 2026

This document saves product direction for a **future onboarding and pricing project**.  
Do not implement signup flows, plan SKUs, or navigation restrictions from this doc until that project starts.

---

## Relationship to current Phase 1

Phase 1 already separates:

| Concept | Current values | Purpose |
|---------|----------------|---------|
| **Account Type** | `home_daycare` \| `center` | What kind of program |
| **User Role** | `owner` \| `director` \| `teacher` \| `assistant` | What this person can do |

Future work may add:

| Concept | Future value | Purpose |
|---------|--------------|---------|
| **Account Type** | `curriculum_only` | Lesson-plan / activity membership |
| **Onboarding intent** | signup answers below | Personalize first-run experience |
| **Plan SKUs** | Home Daycare Pro / Center Pro / Curriculum | Pricing tiers (separate from role) |

Founder / existing paid access remains governed by membership rules (`membership-access.js`). New account types must **not** revoke Founder access.

---

## New user onboarding flow

When a new user creates an account, ask:

**“What best describes you?”**

- ○ Home Daycare Owner  
- ○ Childcare Center Owner  
- ○ Director  
- ○ Teacher  
- ○ Assistant Teacher  
- ○ Just Here for Lesson Plans & Activities  

This selection should configure the account experience automatically (account type, default role, recommended nav).

### Suggested mapping (future)

| Onboarding choice | Account type | Default role |
|-------------------|--------------|--------------|
| Home Daycare Owner | `home_daycare` | `owner` |
| Childcare Center Owner | `center` | `owner` |
| Director | `center` (or ask program type) | `director` |
| Teacher | ask Home vs Center | `teacher` |
| Assistant Teacher | ask Home vs Center | `assistant` |
| Just Here for Lesson Plans & Activities | `curriculum_only` | `owner` (self) |

---

## Account type selection (product)

### Home Daycare

- Full core platform access  
- Ability to add staff  
- Calendar  
- Lesson Plans  
- Daily Logs  
- Child Profiles  
- Documentation Helpers  
- Forms  

### Center

- Everything in Home Daycare  
- Multiple Classrooms  
- Families  
- Enrollment  
- Advanced Staff Management  

### Lesson Plan Membership (`curriculum_only`)

For users who only want curriculum.

**Access:**

- Lesson Plan Library  
- Activity Library  
- Curriculum Planner  
- Calendar Downloads  
- Lesson Plan Downloads  

**No:**

- Daily Logs  
- Child Profiles  
- Forms  
- Staff Management  

---

## Founder protection (required)

All existing users should be grandfathered.

- Existing **Founder Members** keep access to everything currently included.  
- Do **not** force existing founders into a restricted plan (including Curriculum Only).  
- When existing users log in after launch, optionally display:

> “Tell us about your program so we can personalize your experience.”

Allow them to select:

- Home Daycare  
- Center  
- Curriculum Only  

This should customize **navigation and recommendations**.  
It should **NOT** remove access from Founder Members.

Implementation note for that future project: personalization preference ≠ entitlement. Store onboarding answers separately from billing entitlements when needed.

---

## Future pricing direction

Pricing amounts are **TBD** where noted. Do not hardcode final prices in product UI until confirmed.

### Free

- Limited access  
- Trial experience  

### Home Daycare Pro

- **$19.99–$24.99/month** (final pricing TBD)  
- Includes: Calendar, Lesson Plans, Daily Logs, Child Profiles, Documentation Helpers, Forms, Staff support  

### Center Pro

- **$30/month**  
- Includes: Everything in Home Daycare, Multiple Classrooms, Families, Enrollment, Center Management Tools, Staff Management  

### Curriculum Membership

- Lower-cost option  
- For providers who only want: Lesson Plans, Activities, Curriculum Downloads, Weekly Calendars  

---

## Goal

- Let users tell Little Learner Hub why they are here  
- Customize the platform around their needs  
- Protect Founder Members  
- Create a future pricing structure that scales from curriculum-only users to full childcare centers  

---

## Out of scope for current rebuild

Do **not** do these in the role/sidebar/Daily Logs simplification pass:

- Signup onboarding questionnaire UI  
- New Stripe products / price IDs for Center Pro or Curriculum  
- Forcing account-type selection that reduces Founder entitlements  
- Hiding Daily Logs / Child Profiles for existing founders based on a new “Curriculum Only” choice  

When the future project starts, extend `scripts/account-access.js` (`FUTURE_ACCOUNT_TYPES.CURRICULUM_ONLY`) and membership plan keys together, with explicit grandfathering tests.
