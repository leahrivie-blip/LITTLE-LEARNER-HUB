# Family tuition billing (testing simulator)

**Phase:** 17  
**Status:** Testing preview only — no real money  
**Report:** `docs/PHASE_17_PRICING_FAMILY_BILLING_SIMULATOR_COMPLETION_REPORT.md`

## Scope

Provider-to-family tuition billing simulator for childcare centers in Director Center **Billing** and Family Hub **Billing**.

## Money rules

- Integer cents only (`amountCents`, `balanceCents`, etc.)
- Append-only ledger; corrections are new adjustment entries
- Idempotent recurring invoice generation and simulated payments

## Family visibility

Financially responsible guardians may see balance, open invoices, due dates, their payment history, credits, authorized subsidy/copay breakdown, printable statement placeholder, simulated receipt, autopay preference placeholder, and the testing banner.

They must not see other payers’ private info, other households, internal collection notes, provider-wide reports, payment credentials, or restricted subsidy notes.

There is **no** Pay button connected to a real processor.

## Permissions

See `docs/OVERNIGHT_DECISIONS_AND_BLOCKERS.md` (Phase 17 notes) and `docs/PHASE_17_PRICING_FAMILY_BILLING_SIMULATOR_COMPLETION_REPORT.md`.

## Stripe

Untouched. Fake invoices/transactions only.
