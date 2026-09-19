// RD-31-candidate-dwell: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-31-candidate-dwell',
    skill: 'remediation-discipline',
    section: 'Section 2.1: Quarantine Is an Open Investigation (research-or-erase)',
    text: 'No portal_link_candidates row (status=candidate) may sit past DWELL_BOUND_DAYS (14) unless a committed scripts/turns/ledger-verdicts/ledger-verdicts-*.json batch already names its candidate_id, a row the free session-Haiku decider has never been fed is the SAME forbidden permanent-limbo class RD-4 already forbids for quarantined items, applied here to the OTHER half of the intake funnel (D26, docs/plans/defect-fix-plan-2026-09-12.md, part f). D26 root cause: 3,751 discovered candidates stood with 3 ever promoted because the free decider was never fed.',
    anchor: 'Quarantine Is an Open Investigation (research-or-erase)',
    enforcedBy: ['audit:fsi-app/scripts/verify/candidate-dwell-audit.mjs'],
    residual: 'Verifies "was this row ever handed to the decider", never "did its verdict apply cleanly"; run-ledger-consume.mjs own validateVerdictsFile is the schema gate for that. Read-only, 0 Browserless: reads portal_link_candidates plus the committed ledger-verdicts-*.json batches already in the checkout. Self-skips (exit 2) without NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, same convention as every other data-audit-lane entry. Wired into run-data-audit-lane.mjs (HARD) the same commit this invariant lands.',
  };
