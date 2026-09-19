// RD-15-no-service-anon-downgrade: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-15-no-service-anon-downgrade',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 4: API contract gaps — a service-role client is fail-closed, never anon-downgraded',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A service-role Supabase client MUST be fail-closed: a missing SUPABASE_SERVICE_ROLE_KEY THROWS (or yields no data) — it NEVER silently downgrades to NEXT_PUBLIC_SUPABASE_ANON_KEY. The downgrade masks service-role misconfiguration in production as RLS-limited reads (empty/wrong data downstream). The canonical getServiceSupabase (src/lib/supabase-service.ts) is the fail-closed home; the `SUPABASE_SERVICE_ROLE_KEY || …ANON_KEY` pattern anywhere in src is forbidden.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'API contract gaps',
    enforcedBy: ['fitness:F19', 'selftest:fsi-app/.discipline/fitness/functions/F19-no-service-anon-downgrade.test.mjs'],
    residual: 'F19 (grep-class, red-then-green: the `SERVICE_ROLE || …ANON_KEY` downgrade in either order, tolerant of the line break it is written across, is RED with file:line) gates the STRUCTURAL guarantee — the anon-downgrade class (SF-1 fixed in the canonical, then re-appeared ad-hoc in coverage-gaps.ts — Ruling 2 C1) cannot recur. coverage-gaps.ts now routes through getServiceSupabase (fail-closed → caught → empty coverage, never WRONG coverage from anon reads). NAMED RESIDUAL: the broad 52-file getServiceClient→getServiceSupabase CONSOLIDATION (hygiene, correctness-neutral where those factories are already service-only) rides the hygiene pass; F19 makes the SAFETY property (no anon downgrade) hold across all of them by gate regardless of the literal consolidation.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
