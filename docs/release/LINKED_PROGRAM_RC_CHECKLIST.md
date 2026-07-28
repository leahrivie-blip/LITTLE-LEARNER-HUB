# Linked Program Role Repair — Release Candidate Checklist

## Pre-deploy (production data safety)

### 1. Full production database backup (required before merge)

Production uses Render Managed PostgreSQL. **Take a manual snapshot before deploying:**

1. Open [Render Dashboard](https://dashboard.render.com) → **PostgreSQL** → Little Learner Hub production database.
2. **Backups** → **Create manual backup** (or confirm today's automatic backup completed).
3. Record backup ID and timestamp in the deploy notes.

**Rollback:** Restore from snapshot in Render Dashboard → Backups → Restore. Re-deploy the previous git SHA on the web service if application code must also roll back.

### 2. Application rollback

- Previous stable SHA on `main`: record before merge.
- After merge, Render auto-deploys from `main`. To roll back: revert the merge commit or redeploy a prior successful deploy from Render **Events**.

### 3. Repair idempotency

- `reconcileLinkedProgramMember()` is safe to run repeatedly.
- Audit entries are written **only when** `role` or `programId` actually changes for a linked member.
- After the first repair, subsequent logins/profile syncs do not duplicate audits or mutate stored roles.

### 4. Audit trail

Automatic repairs append to `store.roleReconciliationAudit[]` with:

- `email`, `userId` (firebaseUid), `programId`
- `previousRole`, `newRole`, `reason`, `createdAt`

Server log line: `[role-reconciliation-audit]` JSON.

## Post-deploy verification (Tiffany / Shadaisha)

1. **Tiffany** (`tclashley@icloud.com`) — sign in at https://littlelearnershubbyleah.com; confirm owner billing + shared program data.
2. **Shadaisha** (`ladiisha01@gmail.com`) — sign in separately; confirm role shows **Director**, shared children/calendar visible, no billing access.
3. Check admin/store audit for `roleReconciliationAudit` entry for Shadaisha (`owner` → `director`) on first login after deploy.

## Regression gate

```bash
npm run test:release-candidate-regression
npm run test:release
```
