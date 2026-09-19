// SC-15-source-role-at-birth: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-15-source-role-at-birth',
    skill: 'source-credibility-model',
    section: 'Section 5: Source Discovery Loop (role is assigned at registration, not later)',
    text: 'Every INSERT/UPSERT into sources sets source_role at the point of creation via classifySourceRole(name, url) — deterministic, name+URL only, no fetch, no LLM. classify-source-role.ts declared this contract in its own header ("a source is never created with a NULL role + placeholder content-type") and NOTHING enforced it: it held for the three admin onboarding routes by convention and was false on every automated path (intake mint chokepoint, W2.F verification auto-approval, citation source-growth, scripts registerSource). 1,719 of 2,549 rows were born role-less, and a triage then read "no role" as inertness and demoted 869 live regulators (SEC, eCFR, ESMA, NYS DEC, China MEE, Australia CER) to provisional — gated out of every scrape/AI/index job. Role is an identity property fixed at birth; a backfill that may never run is not the enforcement point.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'roles and tiers are credibility differentiation within a surface',
    enforcedBy: [
      'fitness:F22',
      'selftest:fsi-app/.discipline/fitness/functions/F22-source-role-at-birth.test.mjs',
    ],
    residual: 'F22 (grep-class, red-then-green: unwiring the intake mint chokepoint makes fsi-app/src/lib/intake/apply-staged-update.ts RED, restoring it returns the live scan to 0 violations; a sources .update() followed by an insert on a DIFFERENT table is GREEN — that was a real false positive in the first draft of this check). Granularity is file-level, not same-window: the inserted row is frequently assembled above the call (a newSource literal, a spread of proposed_changes), so demanding the classifier inside the 4-line window would produce false REDs. Named consequence: a file that classifies ONE sources insert and not a second would pass; no file currently contains two, and review holds that gap. LEGACY_ALLOWLIST is EMPTY since 2026-08-11: the 16 grandfathered one-shot region-population scripts were deleted in the operator-ruled dead-code sweep (the record of what ran lives in git history), and the rows they created are repaired by scripts/source-role-cleanup.mjs. A roleless sources INSERT anywhere under src/ or scripts/ is now RED with no exception.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
