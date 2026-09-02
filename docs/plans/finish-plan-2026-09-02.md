# Finish plan — the site and the data, to done (2026-09-02, evening)

Written after the reconciliation of the 2026-08-31 build plan and the 2026-09-01 system review §10
against the ledger and the live database (Addendum 84 postscript 13). Everything below is either
**partial** or **not done** in that reconciliation; nothing complete is repeated here. Execution model
is the one that landed the last three trains: **Sonnet executor lanes in worktrees with disjoint write
sets, local CI-equivalent green before handoff; the coordinator designs lanes, gates output, lands
through the browser (bundle → web upload → Codespace → PR → squash), dispatches the runtimes, applies
what only the coordinator may apply, and keeps memory.** Standing rulings apply verbatim: $0 and no LLM
on the population path; no standing schedules during build, every runtime by explicit dispatch;
everything already in the system runs through the newest harness and flywheel once; one writer per
shared dataset; no claims ahead of evidence; record-grade items may appear on customer surfaces.

## 0. Rulings taken today that this plan executes

1. Off-vertical record items: the five flagged verdicts (TEN-T 2024/1679, aerodynamic devices 2020/349,
   the two CCNR Rhine positions, UK authorised weight) are **in vertical**; the screen is corrected
   (two rule flips, six reviewed verdicts) and the remaining off-vertical record items are archived
   reversibly by the runtime; ambiguous ones are listed for a ruling, never archived.
2. "Automate vs. hire" wording retired on the customer surface (done, #530).
3. All site data runs through the newest flywheel and harness once (§3, coordinator dispatches).

## 1. Rulings still open (each gates one lane; nothing else waits on them)

| # | Decision | Gates | Recommendation |
|---|---|---|---|
| R-A | The 1,676 census rows the screen calls off-vertical: archive (reversible) or park (leave `would_mint`, gate withholds) | HYG-2 | park — the gate already withholds; archiving census rows buys nothing and costs a reversal path |
| R-B | The 10 ambiguous live record items (VAT derogations, PDO name, sampling methods, coal aid, customs codes) | POP-EXHAUST | archive as off-vertical |
| R-C | W1 register: wire 8 / delete 8 / hold 6 / keep 3 | HYG-2 | accept as delivered |
| R-D | SERIES_ITEM_MAP: attach the six oil-bulletin series to published_price_statistics via new record items | PROD-APPLY | yes, as record-grade items |
| R-E | origin_class backfill mapping (docs/plans/wo19-origin-class-backfill-mapping.md) | HYG-2 | accept |
| R-F | EIA_API_KEY repository secret | PROD-APPLY (EIA step only) | operator creates it; everything else runs without it |
| R-G | Spec-09 domain tables: sequencing after corridor identity, or defer | SPEC-09 | after corridor identity, this plan's Wave 3 |
| R-H | Community core scope (spec's seven differentiators) | COMMUNITY | build all seven, topics seeded first |

## 2. Lanes (Sonnet), by wave — disjoint write sets

Every lane: full-read rule on every file touched; named-file staging; suite + fitness + tsc green in
the worktree; `git log -1` confirmation in the report; basis on every claim; corrections recorded. No
lane writes `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or `docs/INDEX.md` — the coordinator does.

### Wave 1 — closes the partial lanes and the structural debt (launch together)

**WSEQ — one write sequence for both mint tiers.** Write set: `fsi-app/src/lib/intake/write-item.ts`
(new), `fsi-app/src/lib/agent/canonical-pipeline.ts` (call sites only), `fsi-app/scripts/mint/apply-mint-batch.mjs`
(call sites only), `fsi-app/scripts/mint/validate-mint-payload.mjs` + `payload-schema.json` (one kit
check), tests. Build: the guarded write sequence (item → searches → sections → gate A → claims →
citations, provenance read back from the row) as ONE module both tiers call; a kit-level check that a
record payload carries its screen verdict (`screen: { verdict, provenance, basis }`) and refuses to
validate one that lacks it or carries anything but `on_vertical`, so a harness artifact shows the class
of defect population runs #9–#11 had. F28: mint governing files change → marker, planned run named.

**MAINT — the runtime for coordinator-only applies.** Write set: `.github/workflows/maintenance.yml`
(new, dispatch-only, one `step` choice input), `fsi-app/scripts/maintenance/**` (new thin wrappers only),
`docs/runbooks/MAINTENANCE-RUNBOOK.md`. Steps, each dry/apply: `community-topics-seed`, `tier-opinions`
(find and run the upstream that never ran; report if it does not exist), `w1-dispositions` (wire-8 /
delete-8 execution from the register, gated on R-C), `origin-class-backfill` (gated on R-E),
`census-off-vertical` (archive or park per R-A). Same secrets/artifact/deliver shape as `producers.yml`.

**R1 — the review queues, as ratification digests.** Write set: `docs/ratifications/2026-09/**` (new),
`fsi-app/scripts/review/**` (new, read-only scripts that build digests). Build, at the decision's unit
(rules, not rows; sized for a human; the ratification-digest standard): 927 provisional sources → keep /
suspend rules; 331 canonical candidates → accept / reject rules; 1,457 portal links → link / drop
rules; 91 gap dispositions. Each digest names the apply script and the MAINT step that executes it.

**F2 — monitoring restart, the inaccessible 215.** Write set: `fsi-app/scripts/sources/inaccessible-triage.mjs`
(new), `.github/workflows/source-monitoring.yml` (one step), tests. Build: run the acquisition ladder
(`primary-fallback.mjs`) over the 215 inaccessible sources from the runner, write a ladder dossier per
source (roadblock → bounded alternative → same-floor qualification), never a write-off without evidence;
the surviving suspensions go to R1's digest.

**PROD-FIX — DESNZ air/sea fixture + price-statistics refresh.** Write set:
`fsi-app/scripts/producers/regional/fixtures/desnz-*.json`, `fsi-app/scripts/producers/market/refresh-published-price-statistics.mjs`,
tests. Build: extend the DESNZ conversion-factor fixture with the air and sea rows from the published
table (fetched by the runner from gov.uk, values cited to sheet/row), and make the price-statistics
refresh consume SERIES_ITEM_MAP per R-D.

**GATES-1 — the acceptance gates that make gaps self-report.** Write set:
`fsi-app/.discipline/fitness/functions/F33-surface-acceptance.mjs` (+ test),
`fsi-app/src/__tests__/smoke/*.spec.mjs` (Playwright, inside the existing rendering guard),
`fsi-app/.discipline/governance/invariants.mjs` (entries only). Build: surface-acceptance as a fitness
function (every customer surface named in the specs has a route, a data path, and a rendering-guard
spec, or a named exemption); SM smoke specs for watchlist, personal archive, list order, notification
bell + prefs against the live site; W2.F verification-audit report generator.

**HYG-2 — the register, the taxonomy, the ledger weight.** Write set: `fsi-app/src/lib/sources/source-type-taxonomy.mjs`
(the STOPGAP), `fsi-app/src/components/profile/**` (AuthProvider sector mis-seed), `fsi-app/.discipline/fitness/functions/F25-*`
(allowlist shrink after W1), `docs/PROGRAM-BOARD.md` (ONE coordinator-approved contradiction pass,
U5 rows). Gated on R-C / R-E for the W1 and origin_class executions (MAINT runs them).

### Wave 2 — customer value the specs promised (launch when Wave 1 lands)

**OBLIG — the Regulations obligation register (spec-01's core).** Write set: one migration
(`obligations` table keyed to `intelligence_items` + `item_forward_events`, `binding_position` used),
`fsi-app/src/lib/obligations/**`, `fsi-app/src/components/regulations/ObligationRegister*.tsx`,
`fsi-app/src/app/regulations/**` (register section only), tests. Data path: forward events (already
extracted, 901+) become register rows with jurisdiction / mode / binding position / due date.

**CORR — corridor identity rows + the Market Intel differentiators.** Write set:
`fsi-app/scripts/entities/seed-corridors.mjs` (ADR-024 scheme: UN/LOCODE pair + mode), one migration if
the entity spine needs a corridor kind, `fsi-app/src/lib/market/carbon-cost-per-feu.mjs`,
`fsi-app/src/components/market/CarbonCostOverlay.tsx`, `fsi-app/src/app/market/**` (overlay block
only), tests. Lead-time chart stays ruled out (no data source) and is named as such on the surface.

**DASH — dashboard five-surface rebalance + research credibility chips.** Write set:
`fsi-app/src/app/page.tsx`, `fsi-app/src/components/dashboard/**`, `fsi-app/src/components/research/CredibilityChip*.tsx`,
`fsi-app/src/app/research/**` (chip placement only), tests.

**RSRCH — a data path for Research.** Write set: `fsi-app/scripts/turns/research-sweep.mjs` (new, a
source-sweep family subject over the research-source registry: think tanks, journals, analytical press),
`fsi-app/src/lib/intake/record-facts-research.mjs` (research-grade record profile: finding, method,
key figure when the source states one), `.github/workflows/source-sweep.yml` (one subject), tests.
$0, no LLM; `NO KEY FIGURE YET` becomes a real key figure when the source carries one.

**AXIS — 5-axis classification phases 2/3.** Write set: `fsi-app/src/lib/classification/**`,
`fsi-app/scripts/classification/**`, tests. Deterministic, vocab-SoT-bound, proposals into
`integrity_flags` for ratification (the TAG pattern), never silent.

### Wave 3 — the two programs (launch when Wave 2 lands; each is its own train)

**COMMUNITY — the seven differentiators.** Peer-org context on posts, cross-group topic discovery,
peer-org directory, trusted-peer DM, cross-surface "peers are discussing this", plus the two the spec
implies (topic follow, digest). Gated on R-H and on MAINT's topics seed having run.

**SPEC-09 — the domain tables.** The ten tables incl. surcharge audit / FuelEU pooling arbitrage,
sequenced after CORR (they key on corridor identity). Gated on R-G.

## 3. Coordinator dispatch sequence (parallel to Wave 1; nothing here is lane work)

1. `population-turn` apply (limit 50): archives the off-vertical record items, exports the first
   screened slice. Then `population-turn` apply at limit 200 until the on-vertical pool is exhausted
   (~1,729 rows less 122 minted ≈ 1,600 → 8–9 dispatches, ~20 min each; the adaptive chunker handles
   the write cost). Read every artifact: `minted_verified`, `apply_failed`, reconcile counts.
2. `corpus-turn` apply with `since = 1970-01-01`: every live item through the newest discovery,
   extraction and analysis once (the ruling). Read: edges, events, themes against the live tables.
3. `change-detection` apply; `propagation-drain` apply with backfill + seed (after the corpus turn, so
   derived values see the refreshed graph); `source-sweep` Federal Register apply + one feed subject.
4. `producers` apply: `ecb-fx`, `eurostat-lc-lci-lev`, BLS hourly, oil-bulletin history backfill,
   `refresh-published-price-statistics` (after R-D); EIA when R-F lands. Then `propagation-drain` again:
   automate-vs-hire (capacity investment) values > 0 once EU wage + energy facts exist.
5. `ledger-consume` plan (the paid classifier, dispatch-only; secret name aligned first).
6. `maintenance` steps as their rulings land (R-A, R-C, R-E); TAG ratification applied through it.
7. After each wave: `corpus-turn` apply again over the new items; board + addendum at every landing.

## 4. Gates on the whole plan

Suite, npm-deps, fitness (including the new F33), meta-gate, C3/C5, tsc, discipline engine on the
range — green on every train. F28 markers for every governing-file change, discharged by the run that
supersedes them. Every runtime artifact read against the live table it claims to have changed before
the next dispatch. No item on this plan is closed by a lane report; it is closed by the coordinator
reading the evidence.

## 5. What this plan does not do

Nothing is deferred by choice. Two items stay ruled out with their reason on the surface: EEX EUA (no
licence-clear free source) and the Market Intel lead-time chart (no data source). The brief-grade
upgrade of record items (the paid path) stays dispatch-only under the build-mode ruling.
