# Audit-Ruled Corpus Remediation — Close Report (2026-07-15)

Session: audit-ruled corpus repair executing the dispositions of
[ground-truth-verification-2026-07-15](./ground-truth-verification-2026-07-15.md). Every mutation guarded,
snapshotted (`fsi-app/scripts/_snapshots/`), attributed; $0 unit (no grounding spend, no Browserless);
findings-before-fixes; VERIFIED briefs mutated only under explicit operator ruling.

Scripts: `fsi-app/scripts/remediation/task{1..7}*.mjs`. Verification: the production gate
`validate_item_provenance` used read-only as the oracle throughout (not proxies).

---

## Three-state per defect class (INSTANCE fixed / CLASS addressed / RECURRENCE routed)

| Defect class | INSTANCE (this corpus) | CLASS (mechanism) | RECURRENCE (routed) |
|---|---|---|---|
| **Instrument conflation** (ISO 14083) | 16 false claims removed; brief withdrawn behind hold-notice; quarantined + re-ground queued (Task 1) | `defect-signature-scan.mjs` (S-CONFLATE/S-NUMERIC) + golden, positive control fires on ISO | wired into Wave-2 close gate; permanent wiring = ADR-014 |
| **Dead-citation** (S1) | 727 facts re-pointed off the dead EUR-Lex row to specific instrument sources at true tier; dead row suspended (Task 3) | nothing-generic sourcing rule; specific-instrument resolver | `generic-source-at-ground` (5 items) → hardening |
| **Null-source** (S2) | 671 facts: 11 re-point + 123 re-stamp + 257 relabel→ANALYSIS + 280 hold-to-find; 1 LOW item recovered to verified (Task 4) | floor-first re-attribution from captured pool; host pattern-classifier (tier never guessed) | `null-source-at-ground`, `authority-floor-not-enforced-at-mint` → hardening |
| **Dedup** (D1, EP-11) | ReFuelEU Aviation twin: summary-sourced null-key copy archived `duplicate_instrument`; enacted-text canonical kept (Task 5) | canonical-instrument-key uniqueness (migration 200 + EP-11 audit) | already mechanized (EP-11) |
| **Q1 padding** | 126 exact-duplicate + 6 normalized-identical FACT restatements removed, best-grounded copy kept, zero slot-emptying (Task 6) | exact + normalized-identical (not fuzzy) dedup; substantively-varied kept | fuzzy near-dup left to regen (text-similarity destroys legit claims) |
| **Q2 informal-source** | no residual: null-source informal-digest facts dispositioned by Task 4; GRI hit is legitimate standard-own-body grounding | Task 4 host-classifier + gate authority floor | — |
| **Q3 content-fit** | Fraunhofer IML + SEI org-descriptions reclassified-to-source + archived; WRI + Fraunhofer Overview kept (real findings) (Task 6) | content-driven (entity-identity-not-title); uncertainty → hold not dispose | — |
| **Q4 tier-machinery-as-fact** | 33 ledger claims deleted; `(Tier N)` stripped from all 63 verified briefs (full_brief + sections, 2 passes), 0 leaks; 1 LOW item honestly quarantined (Task 6) | targeted parenthetical strip, Type description preserved | **`tier-machinery-in-customer-prose`** → hardening (template + parser emit tier) |
| **Hold #11** (Green Building) | malformed citation URL fixed at $0 (criterion 2 → 0); floor failures held (Task 7) | three-state hold with documented next-action | **`standard-own-body-exemption-unwired`** → hardening |

---

## Recurrence declarations → hardening dispatch

Routed to the hardening unit by name (do not re-derive; these are the class fixes):

1. **generic-source-at-ground** (5 items) — mint must bind a fact to its specific instrument, never a generic/portal row.
2. **null-source-at-ground** — mint must never persist a FACT with a null source.
3. **authority-floor-not-enforced-at-mint** — the per-type floor must bite at mint, not only at the gate.
4. **inherited-tier-over-certification** — a constant/inherited tier masquerading as a resolved tier (fake-cert class).
5. **tier-machinery-in-customer-prose** (NEW, Task 6) — the §15 Sources template emits "Type (inline Tier)" and `extract-regulation-sections.parseSourcesList` expects it; a pipeline change, so the template fix is not done in this $0 unit. 63 verified briefs leaked the tier (40 of them customer-visible; 41 tier stamps carried Task-3-corrected over-certification).
6. **archive-provenance-flip-guard-collision** (NEW, Task 6) — `archivePatch` sets `provenance_status='unverified'` on archive, but the set_provenance_status trigger re-validates content as verified and tries to flip it back, tripping the row-43 provenance-binding guard (reconciler cred broken). `reclassifyToSource`/`archiveRows` are currently unusable on verified items; worked around via Task-5-style direct archive (leaves verified+archived, out of customer view). Reconcile archivePatch vs the guard.
7. **standard-own-body-exemption-unwired** (NEW, Task 7) — the standard-own-body authority-floor exemption needs `institution_id` linkage (single-institutions-table, unbuilt); until then a standard's own authoring-body facts fail the tier-2 default floor. Also carries the LEED/BREEAM conflation (item split) for the coverage-floor unit.
8. **chrome-capture-adapter** (operator relay 2026-07-15, BUILD-PHASE) — Chrome browser capture as a registered fetch mechanism in the acquisition path, slotted after programmatic-fetch exhaustion and before any paid acquire; output through the standard capture-and-mint chokepoint with full attribution + RD-22, never direct-to-DB; declared expiry per the build-era cleanup clause. Purpose: zero the paid-acquire/metered-capture cost lines for the build-phase backfill. Not built this session; acquisition path untouched.

**Point 4 (production promotion gate slot blind-spot) — INVESTIGATED, CLEARED.** The gate does NOT share the slot-emptying blind spot my Task-4 projection proxy had: Criterion 5 counts only FACT/GAP for required-slot coverage (ANALYSIS never satisfies a slot), and Criterion 3 fails a null-tier FACT on any armed floor (empirically, zero floor-armed items are verified holding a null FACT). The gap was in the proxy tool only; nothing routes to hardening on this. (The proxy-tool gap itself is the named finding.)

---

## Priced re-ground queue (input to the coverage-floor unit)

Honest holds accumulated by the sweeps — research-or-erase work with owners, not limbo:

- **ISO 14083** (Task 1) — re-ground as voluntary standard + CountEmissions EU as separate proposal, no conflation.
- **af277afd** "IEA Global EV Outlook - Access Verification" (Task 6) — stub; methodology_limits slot had only a tier-as-fact filler; recover or archive.
- **hold #11** Green Building (Task 7) — pending standard-own-body exemption wiring; possible LEED/BREEAM split.
- **19 quarantined reg items** (Task 4) — null-source facts relabeled/held; find the primaries.
- **280 hold-to-find null-source facts** (Task 4) — ambiguous/uncaptured hosts; classify hosts then re-point/re-ground (aggregated integrity_flag names the hosts).

---

## Residual accuracy frame (Task 9, sizing only — no verification)

Verified customer surface: **196 items / 4,192 facts** (56 CRITICAL/HIGH, 59 reg-family). The ground-truth
unit sampled 27 items (~738 facts; ~3% fact-weighted accuracy defect, one systematic falsehood = ISO, now
corrected). **Residual unverified-by-ground-truth ≈ 169 items / ~3,450 facts** — the standing input to the
ADR-014 wave-acceptance lane (N=10%, floor 3). The dominant defect (provenance) has been swept corpus-wide;
the residual is accuracy-sampling exposure, not a known-defect backlog.

---

## Governance state

- **ADR-014** ratified → `accepted`, N=10/floor-3 locked. Mechanical lane wired + proven; live L2/L3 pass +
  QA-1 invariant + wave-close gate + DoD three-state check are NAMED deferrals (spend-gated live layer +
  acceptance-record schema) → hardening. A half-wired invariant would break the meta-gate; not shipped.
- **Recurrence standard** held: zero false claims at customer, enforced by mint gates, wave acceptance, and
  hold discipline — not by hope. The fake-cert rule held under pressure to close (Task 7: refused both
  dishonest $0 "fixes" — tier inflation and false relabel — and held the item honestly instead).
