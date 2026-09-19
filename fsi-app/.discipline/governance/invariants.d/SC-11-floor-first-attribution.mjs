// SC-11-floor-first-attribution: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-11-floor-first-attribution',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier — floor-first span re-attribution (the attribution half of the moat)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'When a FACT\'s verbatim span sits in BOTH a floor-qualifying source and a sub-floor corroborator, grounding attributes it to the floor-qualifying source (best-tier-first) so it grounds AT the floor, not the echo; NEVER forced — a span absent from every floor source keeps its honest attribution (walls/relabels/GAP) and is never stamped to a floor source it is not in; a FACT still resolving to an unregistered host is surfaced as one host-aggregated integrity_flag.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Floor-first span re-attribution (the attribution half of the moat)',
    enforcedBy: ['selftest:fsi-app/src/lib/agent/floor-attribution.test.mjs', 'selftest:fsi-app/src/lib/agent/null-tier-flag.test.mjs', 'audit:fsi-app/scripts/verify/unregistered-span-host-audit.mjs'],
    residual: 'The selftests prove the PURE decisions red-then-green: floor-attribution.test.mjs shows a span present in BOTH a floor source and a sub-floor corroborator re-homes to the floor source (RED under the legacy single-URL attribution → fact_below_authority_floor; GREEN under reattributeToFloor) and 4c never-forced (span absent from every floor source → null, no floor stamp); null-tier-flag.test.mjs proves the host-aggregate merge is idempotent per item (re-ground overwrites, never double-counts). The WIRING (groundBrief calls reattributeToFloor at the resolveSpan site over the SAME paginated fail-closed resolver it stamps with; surfaceNullTierHosts upserts the per-host flag) lives in canonical-pipeline.ts — integration residual, not separately unit-asserted. The 4a/4d PROMPT disciplines (synthesis floor-source-span preference; grounding original-language span) ride system-prompt.ts + the grounding extractor prompt (reference-layer, not mechanized). Span-attribution unit, Lane-#4 residual, 2026-07-03.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
