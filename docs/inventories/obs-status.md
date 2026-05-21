# OBS Status Inventory

**Generated 2026-05-21** (Layer 4 cross-skill consistency dispatch). Indexes every OBS entry across sprint followups with state.

Count: 62 OBS entries.

## Entries

| OBS | Title | State | Source line |
|---|---|---|---|
| OBS-1 | Phase 5 sequencing constraint | Open | docs/sprint-1/followups.md:9 |
| OBS-2 | 2-letter and ISO-3166-2 pass-through soft validation gap | Open | docs/sprint-1/followups.md:22 |
| OBS-3 | ICAO literal-string fragility (`'icao member states (193)'`) | Open | docs/sprint-1/followups.md:38 |
| OBS-4 | `jurisdiction_iso` normalization routes through the same trigger as `jurisdictio | Open | docs/sprint-1/followups.md:54 |
| OBS-5 | Trigger pollution on UPDATEs creates ingest_rejections rows for non-ingest event | Open | docs/sprint-1/followups.md:69 |
| OBS-6 | `item_supersessions.severity` value: 'replacement' chosen (CHECK constraint reve | Open | docs/sprint-1/followups.md:91 |
| OBS-7 | Norway Fjords instrument_type pending counsel review | Open | docs/sprint-1/followups.md:107 |
| OBS-8 | OBS-2 broader audit deferred to Sprint 1 follow-up dispatch | Open | docs/sprint-1/followups.md:129 |
| OBS-9 | Classifier feedback loop Sprint 2 pre-implementation decisions | Open | docs/sprint-1/followups.md:141 |
| OBS-10 | Spot-check drift event rate monitoring post-Phase-7 | Open | docs/sprint-1/followups.md:159 |
| OBS-11 | Phase 5 design § 6.1 rollback procedure missing trigger-bracket | Open | docs/sprint-1/followups.md:173 |
| OBS-12 | Per-row script pattern unsuitable for backfill scale; use CTE bulk SQL going for | Open | docs/sprint-1/followups.md:191 |
| OBS-13 | Six rows with all-rejected jurisdictions have no PJR routing path | Open | docs/sprint-1/followups.md:211 |
| OBS-14 | Triage UI lacks inline source metadata; every triage decision is a multi-tab wor | Open | docs/sprint-1/followups.md:244 |
| OBS-15 | Briefs cite journal homepages without article-level source context | Open | docs/sprint-1/followups.md:267 |
| OBS-16 | Carryforward from earlier phases (placeholder) | Open | docs/sprint-1/followups.md:289 |
| OBS-17 | `/admin` route gates on workspace role but renders platform-wide data | Open | docs/sprint-1/followups.md:295 |
| OBS-18 | `/market` "Watch this week" alerts SideCard is non-interactive | Open | docs/sprint-1/followups.md:335 |
| OBS-19 | `/operations` region-level "Coming soon Phase D" banner mis-attributes wiring ga | Open | docs/sprint-1/followups.md:355 |
| OBS-20 | `/market` EmptyState exposes internal worker-language to end users | Open | docs/sprint-1/followups.md:376 |
| OBS-21 | Migration 078 gap in `supabase_migrations.schema_migrations` | Open | docs/sprint-1/followups.md:393 |
| OBS-22 | Ingest scheduler idle since pause-OFF | Open | docs/sprint-1/followups.md:410 |
| OBS-23 | `/admin` audit log tab is a reachable ComingSoonBanner placeholder | Open | docs/sprint-1/followups.md:427 |
| OBS-24 | Trigger `_normalize_jurisdictions` does not derive `jurisdiction_iso` from canon | Open | docs/sprint-1/followups.md:444 |
| OBS-25 | 25-migration schema ledger drift (CLEARED via Schema Reconciliation Stage 1 Buil | Open | docs/sprint-1/followups.md:462 |
| OBS-26 | Category-aware routing RPCs orphaned; intelligence pages share unfiltered payloa | Open | docs/sprint-1/followups.md:481 |
| OBS-27 | Intelligence Assistant zero platform skill loading at query time (was Assistant  | Open | docs/sprint-1/followups.md:502 |
| OBS-28 | Intelligence Assistant citation surfacing structurally impossible (was Assistant | Open | docs/sprint-1/followups.md:520 |
| OBS-29 | Operations is a content build, NOT a separate decision-engine UI (was REC-OBS-H) | Open | docs/sprint-1/followups.md:538 |
| OBS-30 | Migration 063 column shadowing on `sources.tier` + `sources.jurisdictions` | Open | docs/sprint-1/followups.md:557 |
| OBS-31 | Sprint 1 docs contain anti-pattern framings the platform-intent skill was create | Open | docs/sprint-1/followups.md:574 |
| OBS-32 | Community sidebar placement contradicts co-equal surface model | Open | docs/sprint-1/followups.md:592 |
| OBS-33 | Community chrome divergence on entry ("← Back to Caro's Ledge" reflow) | Open | docs/sprint-1/followups.md:610 |
| OBS-34 | Region taxonomy fork between Community and intelligence surfaces | Open | docs/sprint-1/followups.md:626 |
| OBS-35 | Community cohort gap; all vendors art-logistics-specific | Open | docs/sprint-1/followups.md:643 |
| OBS-36 | Regulations taxonomy bleed (industry coalitions and initiatives surfacing under  | Open | docs/sprint-1/followups.md:660 |
| OBS-37 | Intelligence Assistant inline-interaction redesign (Option B per operator decisi | Open | docs/sprint-1/followups.md:676 |
| OBS-38 | 26 SECURITY DEFINER functions in operator domain (privilege-escalation surface) | Open | docs/sprint-1/followups.md:692 |
| OBS-39 | Map mode toggle "Facility" scope drift per skill Section 4 | Open | docs/sprint-1/followups.md:708 |
| OBS-40 | Migration 070 file deletion; RPCs intact via 071/073 CREATE OR REPLACE | Open | docs/sprint-1/followups.md:724 |
| OBS-41 | Dashboard regulation-centric; does not reflect five-surface model | Open | docs/sprint-1/followups.md:740 |
| OBS-42 | `item_supersessions` joined `intelligence_items` rows have missing or test-quali | Open | docs/sprint-1/followups.md:757 |
| OBS-43 | `/admin` audit log tab placeholder post-Tier-2 state | Open | docs/sprint-1/followups.md:773 |
| OBS-44 | Tier 1 Assistant decision-engine prompt constraint (Implemented) | Open | docs/sprint-1/followups.md:790 |
| OBS-45 | Tier 2 UI hygiene fixes batch (Implemented) | Open | docs/sprint-1/followups.md:807 |
| OBS-46 | Onboarding sector destination fix (Implemented) | Open | docs/sprint-1/followups.md:833 |
| OBS-47 | `recurring_spot_check_log` phantom finding (Cleared) | Open | docs/sprint-1/followups.md:850 |
| OBS-50 | Build 6 admin-gating sweep methodology gap | Open | docs/sprint-1/followups.md:869 |
| OBS-51 | Sample-scale validation insufficient for batch-scale guarantees | Implemented (discipline note; future enforcement via dispatc | docs/sprint-1/followups.md:927 |
| OBS-52 | Methodology classifier prompt refinement (deferred investigation) | Open (deferred investigation; not blocking) | docs/sprint-1/followups.md:972 |
| OBS-53 | Worktree cleanup script junction-aware fix | Open (small bounded fix; bundle with next cleanup-script tou | docs/sprint-1/followups.md:992 |
| OBS-54 | Skill load discipline drift across worktrees (3-axis audit P0 finding) | Resolved 2026-05-20 (worktree syncs pending in commit; class | docs/sprint-1/followups.md:1030 |
| OBS-55 | Plan-skill aspirational status (writing-plans + executing-plans + verification-b | Resolved as discipline rescope 2026-05-20 (hybrid framing fo | docs/sprint-1/followups.md:1062 |
| OBS-56 | Plugin replication drift risk (expo triplet, vercel version duplication) | Documented (no functional change required; out of stack) | docs/sprint-1/followups.md:1088 |
| OBS-57 | sprint-followups OBS+DP output not surfacing in commit artifacts | Resolved as discipline addition 2026-05-20 (Dispatch-artifac | docs/sprint-1/followups.md:1114 |
| OBS-58 | Worktree cleanup script step-3 (config-registry sweep) automation | Open (queued for next worktree-cleanup-script touch) | docs/sprint-1/followups.md:1142 |
| OBS-59 | REPO_ROOT hardcoded-path class issue + content-check layer + Vercel inventory co | Closed (bundled response landed in this commit) | docs/sprint-1/followups.md:1180 |
| OBS-60 | Phase 1.5 consumer migration closure | Closed (landed in this commit) | docs/sprint-1/followups.md:1225 |
| OBS-61 | scripts/tmp/ rule 012 exemption represents convention not enforcement | Open (documentation hygiene; not urgent) | docs/sprint-1/followups.md:1258 |
| OBS-62 | Phase 1.5 architectural-decision-in-docstring gap (OPENED AND CLOSED 2026-05-20  | Closed via class fix + instance fix + recognition-signal cod | docs/sprint-1/followups.md:1292 |
| OBS-63 | Phase 1.5 + cold-start intelligence_items inserts use F4 override pending produc | Open (product decision deferred; fitness-allow overrides lan | docs/sprint-1/followups.md:1322 |
| OBS-64 | Sprint Architecture verification surface gap (build-compilation not gated) — clo | Closed (F9 fitness function lands in this commit + 2 type fi | docs/sprint-1/followups.md:1363 |

## Maintenance trigger

Per the 11th binding rule (Inventory-artifact emission): any commit that adds, reopens, or closes an OBS entry MUST update this inventory + emit `Inventory-emission:` line. Use the regeneration script (`docs/inventories/obs-status.md` is regenerated mechanically; the prose state field comes from `**State**:` lines in `docs/sprint-N/followups.md`).

## Source files

- `docs/sprint-1/followups.md` (canonical; OBS-1 through OBS-N)
- Future: `docs/sprint-2/followups.md`, `docs/sprint-3/followups.md`
