---
id: ADR-024
title: Four propagation-engine judgement calls, ruled now so the spine can be built; progressive re-keying, not a big-bang rewrite
status: accepted
date: 2026-09-02
scope: fsi-app entity spine + propagation engine (docs/specs/08-flywheel-design.md) — Lane DP-SPINE's build (entities/entity_identifiers/entity_scope, migration 282/283) and every later lane's build on top of it (DP-ENGINE §2-5, DP-SURF's EstimatedFigure)
supersedes: nothing; this RULES on spec 08 §8's four open questions and adds the progressive-re-keying decision the spec's §1.3 argued for but did not formally record
related: docs/specs/08-flywheel-design.md (§1 entity spine, §1.3 progressive re-keying, §3.2-3.3 decay/floor, §8 open questions), docs/specs/00-foundation-the-spine.md, migration 282/283, migration 258 (`cl_corridor_id()`, the finer-grained corridor key this ADR does NOT touch), ADR-018/020/021 (identity-vs-grouping doctrine this ADR extends to the whole spine), F30 (docs/plans/system-completion-plan-2026-09-02.md §2's falsification-test-in-measurable-form)
---

# ADR-024 — Decision propagation: four rulings, plus progressive re-keying

## Context

`docs/specs/08-flywheel-design.md` §8 named four open questions and, for each, a "current lean" —
a design that was ready to build except for four product judgements the spec's own author declined to
make unilaterally: drain granularity, whether an estimate may ever back a customer decision, the
numeric confidence floors that gate analysis/calculation/filing, and how fine-grained a corridor's
identity should be. Left open, these four questions block everything downstream: DP-ENGINE's
`admissibleFor()` cannot be written without `FLOOR`, DP-SURF's `EstimatedFigure` cannot render without
knowing whether it ever names a decision, and this lane's own `entities` table cannot mint a
`kind='corridor'` id without a seed formula.

The operator's ruling on how to close this (`docs/plans/system-completion-plan-2026-09-02.md` §2,
Lane DP-SPINE): **"if you decide that it needs to be done, we do it."** The four leans the spec author
already wrote were not guesses — each carries its own stated reasoning (§8, quoted per-decision below)
— and re-litigating them in a second lane's judgement would not improve them, only delay the three
lanes waiting on a settled answer. This ADR ratifies the spec's own leans as rulings, records the
reasoning that makes each defensible rather than arbitrary, and — the one thing a "current lean" cannot
do on its own — commits each to a named, importable constant so no downstream lane re-derives or
silently disagrees with it.

A fifth, related question was never posed as an open question because the spec's §1.3 already answered
it in prose ("Not yet built: the `entities` table itself") without formalizing the answer as a decision
a later lane could point to: **how does a codebase with hundreds of live text-keyed call sites
(`.eq("canonical_instrument_key", ...)`, `.contains("jurisdiction_iso", ...)`, ad-hoc
`new URL(url).host`) migrate onto an FK-backed entity spine without either (a) a coordinated big-bang
rewrite of every call site in one commit, which no lane in this train has the write-set breadth to
attempt safely, or (b) silently drifting into a permanent two-key system where the old key rots un-audited
next to the new one?** This ADR rules on that too, because migration 282/283 cannot ship a schema-only
half without an answer to what enforces the other half.

## Decision

### 1. Drain granularity: BATCH, to a quiescent point

> "Batching is cheaper and gives one coherent reader notice instead of five; per-event gives lower
> latency once armed. Current lean: batch, because the reader notice is the product and five notices is
> noise." — spec §8.1

**Ruling: batch.** `DRAIN_MODE = "batch"` (`src/lib/entities/decisions.mjs`). The product being built
is the reader's notice that something changed, not the write's own commit latency — a customer reading
"3 values updated" once is better served than the same customer reading "1 value updated" three times
in the time it takes to refresh the page. DP-ENGINE's drain implementation (spec §2.2's governed drain)
is the consumer of this constant.

### 2. Estimates back a customer-visible RANGE, never a decision, break-even given equal billing

> "Should `estimated_values` ever back a customer-visible *decision*, or only a customer-visible
> *range*? Current lean: range only, with the break-even value given equal billing to the point
> estimate, so the reader decides rather than the model." — spec §8.2

**Ruling: range only.** `ESTIMATE_DISPLAY = "range"` (`src/lib/entities/decisions.mjs`). A modelled
estimate is, by §4's own isolation design, structurally barred from ever reaching a `filing`-use
computation (Layer 2's type barrier, Layer 3's DB constraint) — an estimate that also silently drove a
*decision* rendering would reintroduce, at the presentation layer, exactly the customer-facing risk the
storage-layer isolation exists to prevent. Equal-billing for the break-even value is not a display nicety:
it is the mechanism that keeps the model from making the call by omission (a break-even value rendered
in fine print while the point estimate is bolded IS the model deciding, just less honestly). DP-SURF's
`EstimatedFigure` component is the consumer.

### 3. Confidence floors per use: `FLOOR = { analysis: 0.50, calculation: 0.75, filing: 0.90 }`

> "§3.3 references `FLOOR[use]` but the numbers are unset. These are product judgements with commercial
> consequences and should not be picked by whoever writes the code." — spec §8.3

**Ruling:** `FLOOR = Object.freeze({ analysis: 0.50, calculation: 0.75, filing: 0.90 })`
(`src/lib/entities/decisions.mjs`), consumed by `admissibleFor()` (spec §3.3, DP-ENGINE's build) via
`effective_confidence(base, asserted_at, half_life_days, now)` (spec §3.2's exact SQL, reproduced
below). The three numbers are monotonically increasing with what is at stake if the reader is
wrong — a screen the reader merely *reads* (`analysis`) tolerates more residual uncertainty than a
number that *feeds a computation* (`calculation`), which in turn tolerates more than a number a
*regulatory filing states as fact* (`filing`) — and each is worked against the spec's own half-life
table (§3.2) below so the choice is checked against real decay curves, not picked in the abstract:

  `effective_confidence = base * 0.5 ^ (age_days / half_life_days)` — so the age at which a class
  decays *below* a given floor `f` (starting from `base = 1.0`) is `age = half_life_days * ln(f) / ln(0.5)`:

  | Class (spec §3.2 half-life) | Crosses `filing` (0.90) | Crosses `calculation` (0.75) | Crosses `analysis` (0.50) |
  |---|---|---|---|
  | Verified editorial, 730 d | **≈111.0 d** | ≈302.7 d | 730 d (exact) |
  | Community-contributed, 365 d | ≈55.5 d | ≈151.3 d | 365 d (exact) |
  | Market signal (unconfirmed), 30 d | ≈4.6 d | **≈12.4 d** | 30 d (exact) |

  Two rows read as the floors doing real work, not standing at round numbers by coincidence: a
  **verified-editorial** fact stays admissible for `filing` (the strictest use) for roughly three and a
  half months on its own decay curve alone, before `admissibleFor()`'s hard barrier (community is
  refused for `calculation`/`filing` unconditionally, at *any* corroboration level — §3.3's own
  non-overridable rule, unaffected by these floors) even enters the picture; a **market-signal**
  data point clears the `calculation` floor for only about twelve days from assertion — matching §3.2's
  own characterization ("a four-week-old unconfirmed rumour is noise") almost exactly, since the
  30-day half-life was chosen for the class independently of this ADR's floor numbers and the two land
  in the same neighbourhood anyway. The floors are overridable by editing the named constant (per the
  plan's own framing of this ruling: "coordinator-set, each overridable by editing the named constant")
  — this ADR fixes today's starting point, not a permanent commercial commitment.

### 4. Corridor identity: UN/LOCODE port-pair + mode

> "Port-pair, or Xeneta-style clustering by price correlation rather than geography? Correlation
> clustering is more useful analytically and much harder to explain to a customer. Currently
> port-pair." — spec §8.4

**Ruling: port-pair + mode.** `CORRIDOR_ID_SCHEME` (`src/lib/entities/decisions.mjs`): seed format
`"ORIGIN-DEST:mode"` (UN/LOCODE codes upper-cased, mode canonicalized through
`src/lib/contracts/vocabularies.mjs`'s `normaliseMode()` — `ocean` is canonical, `sea`/`maritime` are
input aliases never stored, migration 263), hashed `sha256`, 16 hex characters, prefixed
`cl:corridor:`. A customer can be shown "Shanghai–Rotterdam, ocean" and immediately understand what the
number describes; "cluster 14" cannot be explained without exposing the correlation model, and a
clustering-based identity would also be *unstable* under a model retrain in a way a fixed geographic
pair is not — an entity's id changing when nothing about the shipment changed violates spec §1.3's own
"IDs are never reused" property. Price-correlation clustering remains available as a later, additive
*analysis* over corridor entities (a `entity_scope` relation, or a derived grouping table) — it is not
foreclosed, only kept out of the identity layer, where instability is much more expensive.

**This ADR does NOT touch `migration 258`'s `cl_corridor_id()`.** That function hashes a *finer*
key — origin/dest/mode/leg_ordinal/routing_key/via[] — for `emission_factors.corridor_id`, where
factor accuracy genuinely depends on the specific routing leg, not just the endpoints. The two schemes
are deliberately different granularities for different purposes and are meant to coexist:
`entities` (`kind='corridor'`) is the coarse, customer-facing, cross-surface-joinable identity;
`emission_factors.corridor_id` stays exactly as migration 258 left it, per the governing plan's own
instruction ("`corridor_entity_id` stays text per migration 258; do not touch"). A future lane MAY add
an `entity_scope` row expressing "this fine-grained factor corridor is scoped under this coarse entity
corridor" without either scheme changing shape.

### 5. Progressive re-keying, not a big-bang rewrite — and what holds the line

Migration 282 builds the spine with zero rows and zero readers. Migration 283 adds nullable FK columns
(`intelligence_items.instrument_entity_id`, `sources.organisation_entity_id`) beside — never replacing —
the text keys they read from (`canonical_instrument_key`, `sources.url`), plus `entity_refs` for the
multi-valued `jurisdiction_iso` case (spec §1.3's "no text entity references anywhere" cannot be reached
by rewriting one table in one migration; the corpus has hundreds of call sites across every surface this
train's lanes do not all have write access to in one commit).

**Decision: build the FK-backed replacement additively, migrate call sites over time, and enforce that
the count of remaining text-keyed call sites never *silently grows*.** `F30-entity-spine.mjs`
(`fsi-app/.discipline/fitness/functions/F30-entity-spine.mjs`) is the mechanism: it counts five named
text-keyed reference-site patterns across `fsi-app/src` (`.eq`/`.contains` on `jurisdiction_iso`, `.eq`
on `canonical_instrument_key`, `.eq` on `source_url`, ad-hoc `new URL(...).host`/`.hostname` outside
`entity-id.mjs`'s `hostFromUrl()`) against a committed baseline, and fails CI only when a pattern's
count *rises* — a new site is a regression; a migrated-away site passes and is reported as an
improvement, never required in the same commit as an unrelated change. **This is a deliberately
narrower measurement than the plan doc's own framing** (`docs/plans/system-completion-plan-2026-09-02.md`
§2 describes F30 as counting "text-keyed rows whose FK column is still null per table" — a live-data,
DB-credentialed measure). This lane built the filesystem-only variant instead, for the same reason
F23/F24/F25 (the codebase's other coverage/liveness/migration-home ratchets) are all filesystem-only:
a fitness function runs in the pre-push hook and in CI with no database credential, by design (see
those three functions' own headers), and a DB-row-based F30 could not run there at all. The two
framings converge on the same claim — "the text-keyed path is being abandoned, not merely
supplemented" — measured from the two different vantage points (call sites vs. unlinked rows) available
to a lane with, respectively, filesystem-only and live-DB access; a live-DB companion measure remains
open for whichever lane first has both a credential and a reason to add it.

**No big-bang rewrite.** Rejected explicitly (see Alternatives) as unsafe to attempt from any one
lane's write set and unnecessary given the ratchet above: the FK-backed and text-keyed paths can coexist
indefinitely without drift, because F30 is what prevents the coexistence from silently becoming
permanent neglect of the migration rather than a managed, in-progress one.

## Consequences

- DP-ENGINE and DP-SURF import `FLOOR`, `DRAIN_MODE`, `ESTIMATE_DISPLAY`, and `CORRIDOR_ID_SCHEME` from
  `fsi-app/src/lib/entities/decisions.mjs` rather than re-deriving or re-debating any of the four
  numbers/strings this ADR rules on.
- `migration 282`/`283` and `scripts/entities/backfill-entities.mjs` (this lane) populate the spine and
  its progressive FK columns for jurisdiction, instrument, and organisation identity from data already
  live in the corpus; GLEIF LEI backfill is explicitly NOT built (no table in this schema carries an LEI
  value on an organisation today — a finding, named in `backfill-entities.mjs`'s header for the lane
  that adds one).
- F30 is live in the fitness manifest (24 functions) and its baseline (measured 2026-09-02: `source_url_eq`
  2, `url_host_derivation` 13, the other three patterns 0) names two pre-existing text-keyed sites outside
  this lane's write set as a defect found, not fixed here — see this lane's REPORT.
- Every future producer/consumer of a jurisdiction, instrument, corridor, or organisation identity mints
  or resolves it through `src/lib/entities/entity-id.mjs`'s `entityId(kind, seed)` and validates external
  identifiers through `crosswalk.mjs`'s `VALIDATORS` — one seed function and one validator set per scheme,
  never a second, drift-prone reimplementation at a call site (the same "one canonical function" property
  spec §1.3 states for surface-URL derivation, extended here to entity identity).

## Alternatives rejected

- **Per-event drain.** Lower latency, but "the reader notice is the product" (spec §8.1) — five
  notices in the time one coherent notice would do is worse product, not a faster one.
- **Letting `estimated_values` back a customer decision directly.** Would reintroduce, in the
  presentation layer, exactly the statutory/estimate contamination risk §4's storage-layer isolation
  (physical tables, type barrier, DB constraint, component gate) exists to prevent — a decision made
  from an estimate is a decision made from a model's guess wearing a fact's clothing.
- **Xeneta-style price-correlation corridor clustering as the identity layer.** More analytically
  useful, much harder to explain to a customer, and unstable under model retrain in a way that violates
  "IDs are never reused" (spec §1.3). Kept available as an additive analysis layer, not the identity.
- **A big-bang rewrite of every text-keyed call site in one commit.** No lane in this train has write
  access to every surface that reads `canonical_instrument_key`/`jurisdiction_iso`/`sources.url` today;
  attempting it from one lane's narrow write set would either silently miss sites (the exact defect this
  ADR's ratchet exists to catch mechanically instead of by inspection) or require a write-set expansion
  this lane was not given.
- **A `pg_cron` job that eagerly backfills the spine on a schedule.** Rejected on the same grounds
  `F24-db-object-migration-home.mjs`'s `CRON_SANCTIONED` allowlist states for every other candidate: a
  schedule inside the database is a clock no repo file records and no workflow list shows. The backfill
  is a guarded, `--dry`-by-default script a human or a reviewed workflow runs, same posture as every
  other guarded write path in this codebase (`scripts/lib/db.mjs`).
- **Recording corridor identity through a pre-existing `corridors` table instead of `entities`.** No
  such table exists in this schema (confirmed: `grep` across `fsi-app/supabase/migrations/*.sql` for a
  `CREATE TABLE.*corridor` finds only `migration 258`'s `emission_factors.corridor_id` column, not a
  standalone corridor table) — inventing one would duplicate `entities`' own class-table-inheritance
  design (spec §1.1) for exactly the kind it already models, and would need its own crosswalk, RLS, and
  merge/retire lifecycle that `entity_identifiers`/`entities.status` already provide for every kind.

## 2026-09-02 AMENDMENT — `statutory_computations`/`estimated_values` PK shape corrected; regions minted into the spine (Lane DP-SURF, coordinator follow-up)

**Context.** Migration 286 (Lane DP-ENGINE, same day) transcribed spec §4's `CREATE TABLE` blocks for
`statutory_computations`/`estimated_values` byte-faithfully, including making `entity_id` the PRIMARY KEY
of each table — spec §4's own literal DDL. Running `scripts/propagation/seed-derived-values.mjs` (Lane
DP-SURF's build, same commit as this amendment) against that shape surfaced a real defect the spec text
did not anticipate: **an `entity_id` PRIMARY KEY permits at most ONE row per entity, ever, across every
formula/model and every scenario** — a single jurisdiction entity that is the subject of a FuelEU
statutory computation would collide with itself on a second formula version, and a single entity seeded
under more than one named what-if scenario would collide with itself outright. The seed's own
automate-vs-hire path produced zero writable rows for this reason alone, independent of the BLS/Eurostat
region-disjointness gap named in this ADR's own §5 area and closed by this same follow-up's task 3
(`fsi-app/scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs`).

**Ruling: `entity_id` is corrected to what it always semantically was — the SUBJECT of a computation/
estimate (a required FK), not a uniqueness key — and each table gets its own surrogate PK.** Migration 286
is amended IN PLACE (unapplied at the time of this ruling, so no live-row migration was needed):
`statutory_computations.computation_id uuid PRIMARY KEY DEFAULT gen_random_uuid()` and
`estimated_values.estimate_id uuid PRIMARY KEY DEFAULT gen_random_uuid()` replace `entity_id` as each
table's PK; `entity_id` stays `NOT NULL REFERENCES entities(entity_id)` on both, now a plain FK. A new
`scenario_key text NOT NULL DEFAULT 'default'` column plus `UNIQUE (entity_id, formula_id, formula_version,
scenario_key)` / `UNIQUE (entity_id, model_id, model_version, scenario_key)` constraints replace the old
PK's uniqueness guarantee at the granularity that actually matters — one row per entity per formula/model
version per named scenario, `'default'` for the ordinary case. Every `CHECK` constraint from spec §4's
byte-faithful transcription is UNCHANGED; `assert_statutory_purity()`'s logic is unchanged (it never read
`entity_id` as a uniqueness key); the outbox trigger's PK-column argument
(`emit_propagation_event(...)`, migration 284) moves from `'entity_id'` to `'computation_id'`/
`'estimate_id'` since that argument names the triggering table's ACTUAL primary key column. `drain.ts`'s
`PK_COLUMN` map (`src/lib/propagation/drain.ts`, used by `resolveInputs()` to look up an `InputRef`-named
row) is corrected the same way, for the same reason, as a latent-correctness fix (no live `InputRef` cites
either table today — both are terminal outputs by spec §4's own design, never a derivation input). See
migration 286's own header for the full technical rationale and `scripts/propagation/
seed-derived-values.mjs`'s header/tests for the seed-side consequences.

**This is a correction of a spec transcription error surfaced by first real use, not a re-litigation of
spec §4's isolation design** — the four-layer isolation (physical tables, TS type barrier, DB trigger,
render-component gate) this ADR's decision 2 and spec §4 both describe is entirely unaffected: an
estimate still cannot reach a statutory computation as an input, a statutory computation is still
terminal, and `ESTIMATE_DISPLAY="range"` still governs the presentation layer. Only the PK/uniqueness
shape — a schema detail the isolation design does not depend on — changes.

**Regions minted into the entity spine, on demand, from the seed's own write path.** Migration 283
already legalized `entity_refs.ref_table = 'regions'` (Lane DP-SPINE, same day) but no code ever wrote a
region's `entity_refs` row — regions were named as multi-valued-jurisdiction-capable in that migration's
own header but were never in DP-SPINE's progressive-re-keying backfill scope (`scripts/entities/
backfill-entities.mjs` walks `intelligence_items`/`sources`, not `regions`). `seed-derived-values.mjs`'s
`resolveRegionEntityId` (Lane DP-SURF, this amendment) closes that gap the same way DP-SPINE's backfill
would: resolve a region's jurisdiction entity through `entity_refs` (`ref_table='regions'`,
`role='jurisdiction'`), and when absent, MINT it — `entityId('jurisdiction', iso)` for each of the
region's `iso_codes`, writing `entities`/`entity_identifiers`/`entity_refs` rows through
`scripts/lib/db.mjs`'s guarded write path (rule 015: cite required, prior-state snapshotted) — by
importing and reusing `backfill-entities.mjs`'s own exported `planJurisdictionEntities`/
`planJurisdictionRefs` pure planning functions directly, never a second hand-rolled implementation of the
same mint. This keeps the two producers (a future whole-corpus DP-SPINE backfill run, and this seed's
on-demand per-region mint) structurally unable to disagree about which entity a region's iso code
resolves to — `entityId()` is deterministic, and both call the same planning functions. `--dry` mode never
writes (a pure preview of the id that would be minted); only `--apply` mints for real. Consequence: this
ADR's §5 consequences list is extended — `seed-derived-values.mjs` is now also a (narrow, on-demand,
single-role) writer into the entity spine, alongside `backfill-entities.mjs`'s whole-corpus sweep,
resolving through the identical `entity_refs`/`entityId()` mechanism rather than a parallel one.
