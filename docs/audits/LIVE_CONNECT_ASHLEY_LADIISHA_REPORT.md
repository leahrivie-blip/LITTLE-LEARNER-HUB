# Live Connect Report — Ashley + Ladiisha

**Date:** 2026-07-17  
**Status:** COMPLETE  
**Backup ID:** `backup_1784330817301_e1637fe3`

## Dry-run findings (before apply)
| Check | Result |
|-------|--------|
| Ashley exists, Active | Yes — Founding + Stripe customer/subscription present |
| Ladiisha exists, Active | Yes — Founding via `internalAccessOverride`, **no** Stripe IDs |
| Blocking conflicts | **None** |
| Info note | Promote Ladiisha `Main Classroom` because Ashley UID schedule was empty |
| Children on either UID | None |
| Duplicate programs | None (`programMembers` was empty) |

## Applied changes
1. Created shared program `prog_c58ca12867729a2e` with Ashley as owner  
2. Promoted Ladiisha’s legacy schedule (`Main Classroom`) into `programData`  
3. Linked Ladiisha as **director** with `linkedProgramOwnerEmail=tclashley@icloud.com` and `programAccessViaOwner=true`  
4. Cleared Ladiisha temporary Founding (`foundingMemberActive=false`, `internalAccessOverride=false`) **after** director access was set  
5. Preserved Ladiisha legacy UID schedule bucket + migration backup  

## Post-apply verification
| Account | plan | role | Founding active | Stripe | programId | access |
|---------|------|------|-----------------|--------|-----------|--------|
| Ashley | Founding | owner | yes | present | shared | billing owner |
| Ladiisha | Free | director | no | none | shared | via owner |

- Shared classrooms: `Main Classroom`  
- Ashley remains in `foundingMembers[]`  
- Ladiisha was never in `foundingMembers[]`  
- Rollback available via `POST /api/admin/program-migration-rollback` with the backup ID  

## Not changed / safe
- Separate Firebase logins / passwords  
- No duplicate child or calendar item merges (no child rows; classroom promoted once)  
- Ashley Stripe subscription untouched  
