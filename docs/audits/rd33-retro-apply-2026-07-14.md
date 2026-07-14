# RD-33 retro-apply audit — the four effectful surfaces (2026-07-14)

**Doctrine:** `no-execution-from-stale-state` — every effectful mechanism (fetch, mint, flip, register, any
spend or irreversible write) re-verifies its OWN precondition against LIVE state as its first act. A plan /
manifest / dispatch is a PROPOSAL, never authority for an effect. (Register:
[doctrine-register.mjs](../../fsi-app/.discipline/governance/invariants.mjs), invariant
RD-33-no-execution-from-stale-state; template instance = the fetch seam, PR #328.)

**This audit** closes the named residual (retro-application to mint / flip / register). Method: read each
surface's code and locate the LIVE-state read that gates its effect. Verdict per surface: **satisfied**
(live re-verify present) or **gap** (effect fires off a stale proposal). No numbers asserted — every anchor
is a code line.

Related: [session-log](../ops/session-log.md) · [funded-pass flight-state](../ops/funded-pass-flight-state-2026-07-14.md).

## Surface inventory + verdict

| Surface | Effect | Live precondition (code anchor) | Verdict |
|---|---|---|---|
| **fetch** | paid Browserless fetch | `holdings-gate.mjs` `holdingsPresent` — `generateBrief` reads live snapshot bytes + pool rows and REFUSES to fetch when usable holdings exist (`canonical-pipeline.ts` `holdingsForItem`); `forceRefresh` the only escape; precondition posture recorded on the spend ticket | **satisfied** (mechanical seam, PR #328; `holdings-gate.test.mjs` golden) |
| **mint** | INSERT a live `intelligence_items` row | `mint-item.ts::sourceLinkDecision` resolves the source against the LIVE registry and REJECTS an unregistered url (source-link invariant); `mintItem` idempotency short-circuit re-reads live `intelligence_items` by `source_url` + `legacy_id` and returns the existing row (never dup-inserts, CODE-1); `congruence()` + FAIL-CLOSED live dedup-corpus scan (a read error → empty corpus → refuse) | **satisfied** (live-by-construction; `mint-source-link.npmtest.mjs`) |
| **flip** | flip `provenance_status` quarantined→verified | DB trigger `set_provenance_status` re-runs `validate_item_provenance` over the item's LIVE claim rows on every claim write — the flip is a pure function of live claim state, cannot fire off a stale plan; `groundBriefImpl` also reads `provenance_status` live and skips when already verified (ledger-preserving) | **satisfied** (trigger over live rows; migration 141/171/202) |
| **register** | INSERT a `sources` row / `provisional_sources` candidate | `registerCitedSources` dedups against LIVE `sources` (host match) before any insert, and gates the tier on the deterministic SC-13 `classTierForHost` (a host with no ruled class is worklisted, never minted at a guessed tier) | **satisfied** (live dedup + deterministic tier; `source-growth`) |

## Finding

**No stale-state gap on any of the four surfaces.** Each reads live state and fail-closes before its
effect. The fetch surface needed the explicit mechanical seam because its stale-state failure (the o9
re-fetch — 76KB already held, re-fetched on a manifest's say-so, grounding nothing) had actually occurred;
mint / flip / register were already live-by-construction and their anchors are named above so a future
refactor that removes a live read is reviewable against this record.

The doctrine's named residual is therefore **discharged**: coverage confirmed across all four, no gap to
close.

## Carried debt (out of RD-33 scope — recorded, not fixed here)

- `registerCitedSources` dedups via `ilike('%host%')`, a SUBSTRING match — a host that is a substring of an
  unrelated registered URL is a false-duplicate risk. This is a dedup-PRECISION defect, not a stale-state
  defect (it DOES read live state), so it is out of RD-33's scope. Already flagged in-code as a known defect;
  left for a dedup-precision unit.

## Future strengthening (not built — proportionate-scope note)

A generalized effectful-function fitness (assert every effect site reads live state before mutating) would
mechanize what this audit did by hand. Not built at current scale: the three non-fetch surfaces are
correct-by-construction with named anchors, and a structural assertion over arbitrary effect sites is
false-positive-prone. Revisit if a fourth stale-state incident surfaces on a non-fetch surface.
