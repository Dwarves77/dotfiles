# WO-20 — Assumption register: corrected spec-from-repo (2026-08-30)

**Status: DRAFT, spec-from-repo pass.** Written per the vault gap named in
`docs/plans/connection-redesign-and-build-scope-2026-08-29.md` §4 ("Vault gap, named") and executed
under that scope's §5 executor contract and §6a wave-2 lane model. The lost v1 WO-20 text (never
committed, lived only in chat) is **not** reconstructed here — this document is derived fresh from
the repository and the live database (project `kwrsbpiseruzbfwjpvsp`), against worktree commit
`36896813`. Every claim below is labelled `[FACT]` (file+line or live query, this session),
`[INFERENCE]` (a reasoned conclusion from FACTs, not itself directly observed), or `[UNCONFIRMED]`
(stated but not verified this session) per CLAUDE.md standing rule 14.

Vault landing path when ratified: this file, at its current path.

---

## 0. Rule 0.15 — confirmed greenfield

Master execution plan v2 Appendix A already asserted "confirmed ABSENT: any … assumption-register …
table" `[PLAN-STATED, 2026-08-18]`. Re-verified live this session, independently:

```sql
-- 1. name-pattern sweep over every public table
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND (
  table_name ILIKE '%assum%' OR table_name ILIKE '%parameter%' OR table_name ILIKE '%constant%'
  OR table_name ILIKE '%config%' OR table_name ILIKE '%weight%' OR table_name ILIKE '%threshold%'
  OR table_name ILIKE '%register%' OR table_name ILIKE '%tuning%' OR table_name ILIKE '%default%'
);
-- → 0 rows

-- 2. full table enumeration (84 tables), read in full, none is a plausible alias
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
-- → 84 rows, enumerated and read; closest neighbours inspected directly:
```

Two tables surfaced by the full sweep as plausible-sounding neighbours and were read column-by-column
to rule out: `[FACT]`

- `promotion_policy` (18 cols: `authority, status, budget_envelope_usd, spent_usd, batch_size,
  audit_sample_size, audit_min_accuracy, priority_jurisdictions[], …`) — a **per-run operating policy**
  for a specific promotion batch (spend caps, sampling), not a registry of modelling constants used
  across derivations. Different object.
- `system_state` (5 cols: `id:boolean, global_processing_paused, scrape_cadence, scrape_start_date`) —
  a **singleton operational toggle** row, not a register of named, versioned values.

**Verdict: WO-20 is confirmed greenfield. No STOP condition triggered — proceeding with the spec.**

---

## 1. Purpose

This product derives numbers and classifications from parameters nobody stores: a connection score
is `Σ (tuned weight × idf(tag))`; an `urgency_score` is a hand-picked integer looked up from a
priority word; a bias tag auto-applies, queues for review, or is discarded based on a confidence
cutoff written as prose inside an LLM prompt. Every one of these is a **modelling assumption** —
not a regulatory fact (owned by the DB per CLAUDE.md rule 1), not a licensed external number (the
`emission_factors`/envelope precedent, migration 258/267), but a **choice this product made about
how to compute something**, currently expressed as a bare literal in source with, at best, a code
comment or an ADR as its only record of why. Section 2 catalogues nine such constants live in the
repo today, several already shown by their own history to drift silently (ADR-007's ratified
per-dimension thresholds are not the thresholds the current prompt text states — §2, row 8).

**The assumption register exists to make a modelling constant a first-class, queryable, versioned
record — instead of a fact only `grep` can find** — so that (a) an operator reviewing "why does the
connection scorer weight `shared_source` at 0.4" gets an answer with a citation and a date rather
than an inline comment buried in `discover.mjs`, (b) a retune (like ADR-007's) has somewhere to land
that the code that embodies it can be checked against, and (c) the next constant someone hardcodes
has a place to be *registered*, not just written. It is deliberately **not** a second envelope for
externally-sourced numeric facts (that is what WO-12/emission_factors already is) — it is the
missing register for the numbers *this product itself* decided, not the numbers the world published.

---

## 2. Evidence: the assumptions that exist today

All rows `[FACT]`, current worktree (`36896813`). "Provenance recorded?" answers literally: is there
*any* structured, queryable record connecting this value to why it was chosen — not counting the
inline code comment itself, which is not queryable, diffable against a DB row, or attributable to a
ruling with a date.

| # | Constant | File : line | Current value | What it drives | Provenance recorded today? |
|---|---|---|---|---|---|
| 1 | `W.shared_source` | `src/lib/connections/discover.mjs:84` | `0.4` | Connection-scorer weight: same-source signal contribution to every pairwise edge score | Comment only ("tuned against the live corpus 2026-08-09", no session/ADR cited) |
| 2 | `W.shared_scenario` | `discover.mjs:84` | `0.3` | Base per-tag weight for shared `operational_scenario_tags`, before the ADR-019 idf multiplier | Comment only, same line |
| 3 | `W.shared_compliance_object` | `discover.mjs:84` | `0.18` | Per-tag weight for shared non-role compliance-object tags | Comment only |
| 4 | `W.shared_jurisdiction_topic` | `discover.mjs:84` | `0.2` | Weight when jurisdiction AND topic both overlap | Comment only |
| 5 | `PER_TAG_CAP` | `discover.mjs:85` | `3` | Caps how many shared tags of one signal type can contribute to one edge's score | Comment only |
| 6 | idf discount coefficient + clamp bounds | `discover.mjs:55` (`clamp(1 - 0.25 * Math.log2(freq/refFreq), 0.25, 1)`) | coefficient `0.25`; clamp floor `0.25`, ceiling `1.0` | Every `shared_scenario` tag's actual per-pair weight (constants 2 and 6 compose: `W.shared_scenario * idf(tag)`) | **ADR-019** (`docs/decisions/ADR-019-inverse-frequency-scenario-weighting.md`) — the one row in this table with a real ADR citation, still not a queryable DB record |
| 7 | `minScore` floor | `src/lib/connections/pair-view.mjs:83` (`assemblePairs(..., { minScore = 0.3, ... })`) | `0.3` | The discovery floor: which scored pairs ever become a stored edge / render at all | Comment cross-references ADR-021's anti-scope ruling that the floor stays, but the literal `0.3` itself is a bare default parameter, not a DB value |
| 8 | Bias-tag confidence cutoffs | `src/app/api/admin/canonical-sources/recommend-classification/route.ts:124` and `.../sources/recommend-classification/route.ts` (equivalent line) | `>=0.80` auto-apply / `0.65–0.79` operator review / `<0.65` discard — **stated as prose inside the LLM prompt string**, describing what "the downstream pipeline" does | Nothing in this repo currently reads `source_bias_tags.confidence` and branches on it — repo-wide grep (`src/app/api`, `src/components/admin`, `scripts/`) finds `bias_tags`/`biasTags` referenced ONLY in these two prompt-generating route files; no insert/gate code was found. **ADR-007** ratified a *different*, per-dimension threshold set (funding 0.75 / methodology 0.80 / stakeholder 0.75) implemented in `scripts/q4-bias-batch-assign.mjs`, a file that **no longer exists in the repo** (confirmed absent by `find`). The current uniform 0.80/0.65 values are neither ADR-007's ratified numbers nor traceable to any enforcing code today — an ADR and the code it was written for have drifted apart with nothing to reconcile them, which is exactly the failure mode this register is FOR |
| 9 | `PRIORITY_TO_URGENCY_SCORE` / `URGENCY_TIER_TO_SCORE` | `scripts/lib/urgency.mjs:8-22` | `LOW:3 MODERATE:5 HIGH:7 CRITICAL:9` / `informational:2 stable:4 elevated:6 watch:8` | Every `intelligence_items.urgency_score` written via the community-promote path and the cold-start backfill path (the two F4-era insert sites) | **ADR-008** (`docs/decisions/ADR-008-urgency-score-default.md`) — ratified, current, matches the code exactly. The one assumption in this table where the ADR and the code fully agree today |
| 10 | Pedigree floors per factor tier | `src/lib/contracts/factor-tier.mjs:41,47,54,61,68` | `carrier_primary:1 verified_operator_avg:2 programme_lane_avg:2 modal_default:3 proxy_estimate:4` | The best pedigree score a tier of `emission_factors` row may claim (a modal default can never present as primary data) | Extensive code comment (lines 32-38); no ADR; **forward-looking only** — `emission_factors` carries 0 live rows `[FACT, Appendix A / re-confirmed]`, so this assumption governs no live output yet |

**Count: 10 catalogued constants (rows 1-5 and 6-8 are 3 further sub-parameters within row 6's
formula, for 13 individual numeric literals total) spanning 3 files, 0 of which have a DB row, 2 of
which have an ADR, 1 of which (row 8) shows the ADR and the code already disagreeing.**

**What this table is not:** it is not exhaustive of every numeric literal in the codebase (a
threshold buried in a one-off script or a UI pixel value is not a modelling assumption). The
selection criterion, applied consistently: a constant that participates in computing or classifying
a value the product treats as meaningful output (a score, a classification, a derived field) —
not a display constant, not a rate-limit, not a UI magic number. `IMPACT_LABELS`/`LEVEL_LABEL_BY_SCORE`
in `src/components/resource/ImpactScores.tsx` were read and excluded: they are a *display* mapping
from an already-stored 0-3 score to a label/color, not a constant that PRODUCES the score.

---

## 3. Proposed schema

Table: **`assumption_register`**. Envelope-carrying via `renderEnvelopeDDL()`
(`src/lib/contracts/provenance-envelope.mjs`) for the columns the envelope already defines — never a
hand-written CHECK duplicating `origin_class`/`derivation`, per the 258→267 precedent this repo
already enforces byte-for-byte (`contracts-provenance-envelope.test.mjs`).

**Natural key: `assumption_key text UNIQUE NOT NULL`**, dot-namespaced
(`<subsystem>.<mechanism>.<parameter>`, e.g. `connections.scorer.weight.shared_source`,
`connections.scorer.idf.discount_coefficient`, `urgency.priority-to-score.high`). Not a surrogate
UUID as the *lookup* key, because the register's whole job is to be joinable against source: a future
drift-guard (§4, minimum reader) greps the codebase for a constant's logical name and looks it up by
that same string. A UUID would make that join require a second table just to remember which UUID
means what; the dot-path IS the memorable, greppable identity, exactly the role
`assumption_key` plays and `uq_intelligence_items_canonical_key_verified_live`'s key plays for
instrument identity (migration 200) — a stable string key a reader can construct from first
principles, not a database-assigned one.

```sql
-- >>> hand-written, table-specific (not part of the envelope) <<<
CREATE TABLE public.assumption_register (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_key      text NOT NULL UNIQUE,   -- dot-namespaced natural key, see above
  subsystem           text NOT NULL,          -- first key segment, denormalized for filtering (§2's "File" grouping)
  label               text NOT NULL,          -- short human label, e.g. "Shared-source signal weight"
  rationale           text NOT NULL,          -- why this value; the durable form of today's inline code comment
  code_location        text NOT NULL,          -- file:line where the literal is DEFINED today (§2 col 2) — the drift-detectable pointer
  governing_decision  text,                   -- ADR id / session-log ruling citation, e.g. "ADR-019"; NULL where none exists (rows 1-5, 7, 10 above)
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','retired')),
  superseded_by       uuid REFERENCES public.assumption_register(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- >>> GENERATED by src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL('assumption_register', {
--       columns: ['value_numeric','unit','derivation','origin_class','source_key','source_ref',
--                 'n_observations','method_version','as_at_date']
--     }) — ALTER TABLE ADD COLUMN IF NOT EXISTS, splice AFTER the CREATE TABLE above, same migration,
--     same transaction. Byte-identical column/CHECK/COMMENT text to every other envelope extension. <<<
```

Every column justified against §2:

- **`value_numeric`** — the constant's current value (rows 1-10 are all numeric today).
- **`unit`** — e.g. `"weight [0,1]"`, `"confidence threshold"`, `"pedigree rank (1=best)"` — needed
  because a bare `0.3` means nothing without knowing it's a weight vs. a floor vs. a coefficient (rows
  1 vs. 7 are both `0.3` and mean entirely different things — §2 rows 2 and 7).
- **`derivation`** — how the value was arrived at (envelope's 9-value vocabulary). Rows 1-5, 7, 10 are
  `modelled` (hand-tuned, no formal method); row 6 is `calculated` (derived to hit two named anchor
  points, per ADR-019's own text); row 9 is `calculated` (a deliberate midpoint-of-quartile mapping,
  per ADR-008). Distinguishing these matters: a `modelled` constant is a candidate for re-tuning
  against fresh data, a `calculated` one is a candidate for re-deriving if its anchor assumptions
  change.
- **`origin_class`** — all 10 rows are `modelled` (spec 00 §3.6: "Modelled estimate") — none of these
  values came from an external community/partner/verified/official source; every one is this product's
  own tuning. Included because the 7-value vocabulary is already the standing home (migration 258/267)
  and a register of internally-modelled values is exactly the class `modelled` exists to name.
- **`source_key` / `source_ref`** — nullable, populated only if a future assumption traces to a
  licensed external calibration dataset (none of the current 10 do — all NULL at seed time). Included
  for schema completeness with the envelope precedent, not because today's rows need it; excluding it
  would mean re-adding it the first time an assumption DOES trace to one, which is exactly the
  orphaned-field risk the envelope module's header warns against.
- **`n_observations`** — row 8's ADR-007 history is the direct justification: *"tuned with
  sample-scale validation (20 sources); at full-batch scale (798 sources), the methodology dimension
  over-flagged."* A retune's sample size is exactly what this column is for (envelope comment: "Sample
  size behind an aggregated figure… governs significant-figure rounding"). Applies to any future
  assumption whose value came from measuring a batch.
- **`method_version`** — lets a later re-tune of, say, the idf coefficient be told apart from a data
  change in the underlying corpus (envelope comment, verbatim rationale already applies).
- **`as_at_date`** — when this row's value was last confirmed to match the live constant at
  `code_location` (the register-specific reading of the envelope's generic "when the source asserted
  this value" — same column, same CHECK-free date type, no override needed).

**Excluded envelope columns, justified:** `currency` (none of the 10 rows are monetary rates) and
`reference_period` (none are period aggregates — a scorer weight is not "Q2's scorer weight"). Per
`renderEnvelopeDDL`'s own contract, passing a narrower `columns` list is exactly how a caller opts out
of envelope columns that don't fit — no schema is forced to carry all eleven.

---

## 4. Consumers

**No code in this repo can read this table today** — it does not exist, and nothing was written
against a table that doesn't exist. Naming that plainly, per this WO's own instructions, so the table
is never populated-but-invisible (the WO-18 failure mode this repo already names for the same reason
`emission_factors` ships with a mandated first `/admin` reader before any seeder runs).

**Minimum first reader, concretely specified — a new `/admin` section, same pattern WO-18 already
commits to for `emission_factors`:**

- `src/app/admin/page.tsx` already server-fetches several soft-failing panels in one `Promise.all`
  (`fetchMtdSpend`, `fetchErrorGroups`, lines ~23-62) and hands them to `AdminDashboard`. Add
  `fetchAssumptionRegister()` in the same file, same soft-fail shape (`try { … } catch { return []; }`,
  so a not-yet-migrated environment renders an empty panel, never a 500), selecting
  `assumption_key, label, value_numeric, unit, derivation, origin_class, governing_decision,
  code_location, status, as_at_date` ordered by `subsystem, assumption_key`.
- `src/components/admin/AdminDashboard.tsx` gains one new read-only panel/tab ("Assumptions") listing
  the rows in a table, grouped by `subsystem`, showing `governing_decision` as a link-style badge where
  present and a visible "no ruling on record" badge where NULL (rows 1-5, 7, 10 today) — the same
  honesty-over-flattery posture `ImpactScores.tsx`'s "No scored dimensions yet" empty state already
  uses elsewhere in this admin surface.

**This is a read-only display consumer, deliberately not a runtime one.** `discover.mjs`'s own header
states its design constraint explicitly: *"PURE, no DB, no LLM."* Making the connections scorer read
`W.shared_source` from this table at score time would violate that constraint and turn a pure,
synchronously-testable function into one with an I/O dependency — a different, larger, unscoped change
this WO does not make (§6). The register's job in v1 is to be the durable, queryable RECORD of a
constant's value and rationale, checkable against the literal in code by a human or a future drift
script — not to become the runtime source of truth the code loads from. That upgrade, if ever wanted,
is its own future WO with its own ADR (the same "propose, don't silently widen" discipline ADR-021
already models for the connection-classes work).

**Second-order consumer, named but explicitly NOT built by this WO:** a drift-check script
(`scripts/verify/assumption-register-drift.mjs`, following the shape of the existing
`vocab-drift-guard.test.mjs` / `execution-wiring.mjs` family) that re-reads each `code_location`,
extracts the literal, and fails if it no longer matches `value_numeric` — the mechanical enforcement
that makes "the register might silently drift from the code" (this WO's own opening risk) provably
false rather than merely asserted. Named here as the natural next WO, not scoped into this one
(§6 anti-scope).

---

## 5. Migration + backfill plan

**Two-track policy (CLAUDE.md standing rule 3), unchanged: schema DDL applies via the sanctioned lane
BEFORE dependent code commits; the coordinator applies it, never an executor.**

1. **Generator.** `scripts/gen/migration-269-assumption-register.mjs`, mirroring
   `scripts/gen/migration-267-origin-class-and-envelope.mjs` exactly: imports `renderEnvelopeDDL` from
   `provenance-envelope.mjs`, splices its output between `>>> GENERATED <<<` markers into the migration
   file below the hand-written `CREATE TABLE`. Re-run with `node scripts/gen/migration-269-…mjs`;
   committing the regenerated diff is how the envelope-column set ships, per the existing convention.
2. **Migration file.** `supabase/migrations/269_assumption_register.sql` (COORDINATOR CORRECTION 2026-08-30: the
   spec-from-repo pass read the tree at commit 36896813 and correctly found 267 as the highest
   on-disk file, but WO-16 claimed 268 for `market_series` in the same wave; 269 is the next free
   number as landed). Structure: hand-written
   `CREATE TABLE public.assumption_register (...)` (the table-specific columns from §3) immediately
   followed by the GENERATED `ALTER TABLE public.assumption_register ADD COLUMN IF NOT EXISTS …` block
   for the envelope subset — the same two-block shape migration 267 already proved works for adding
   envelope columns in the same file as other DDL, adapted here to a brand-new table rather than an
   existing one. A post-apply `DO $$ … RAISE EXCEPTION …$$` block asserting the expected column count
   exists, matching 267's own post-check pattern verbatim.
3. **No backfill in this migration.** Schema-only, additive, zero rows — safe to apply as soon as
   reviewed, per the same reasoning migration 267's header gives for its own schema-only status.
4. **Backfill (separate, later, ratified pass — not this document's job to author):** 10 rows,
   one per §2 entry, populating `assumption_key/label/rationale/code_location/governing_decision/
   value_numeric/unit/derivation/origin_class`. Because every value and its justification are already
   fully determined by §2 — a mechanical transcription, not a judgment call — this backfill does NOT
   need the ⛔ operator-ratification WO-19's item_type→origin_class mapping required (that mapping
   involved genuine classification judgment across 1,062 rows with ambiguous cases; this is a literal
   10-row transcription of values already sitting in reviewed source). It still runs as its own
   guarded-path pass with a rule-015 snapshot, per standard practice — just not gated on a ⛔ open
   ruling, because none of the values in §2 are contested (§7 below names what actually IS open).
5. **Applied by the coordinator only**, per this document's own hard rules and CLAUDE.md rule 3 — no
   executor, including whichever lane eventually builds §4's admin panel or §5's drift script, runs
   `apply_migration` or equivalent.

---

## 6. Gates and anti-scope

**This WO does NOT:**

- Change `discover.mjs`, `pair-view.mjs`, `urgency.mjs`, `factor-tier.mjs`, or the two
  `recommend-classification` routes. Every constant in §2 stays exactly where it is, in code, as the
  live value the product runs on. The register is a parallel RECORD, not a replacement source of truth
  — see §4's explicit reasoning against a runtime read path.
- Resolve row 8's ADR-007/code drift. That is a real, separate finding (an ADR whose ratified numbers
  the current code does not implement, and whose implementing script no longer exists) — flagged here
  because building the register is what surfaced it, but reconciling it is its own decision (§7 Q1).
- Build the drift-check script named in §4. Named as the natural next step, explicitly out of scope.
- Seed `emission_factors` or touch `factor-tier.mjs`'s pedigree floors (WO-18's job, unstarted,
  0 live rows) — row 10 is catalogued because the constant exists in code today, not because this WO
  does anything with it.
- Widen the `origin_class` or `derivation` vocabularies. All 10 rows fit the live 7-value/9-value sets
  exactly (§3) — no CHECK-widening ruling is needed, unlike WO-28's `derogates_under` case.
- Apply any migration. Per this document's own hard rules, the DDL in §5 is a specification for the
  coordinator to apply, not an action this document or its author takes.

**Gates before this WO's own migration/backfill land** (standard, per the scope doc's §5 executor
contract): the canonical suite (`sh fsi-app/.discipline/run-test-suite.sh`) green, including
`contracts-provenance-envelope.test.mjs` regenerating migration 269 byte-for-byte the same way it
already does for 267 and 268; `tsc` clean; fitness functions 21/0; memory-gate files in the same PR as the
eventual code (this document is not that PR).

---

## 7. Open rulings

Kept short — most of what a template asks "should a human decide" is already settled by §2's evidence
or by precedent this repo has already ratified (the envelope shape, the two-track policy, the
natural-key convention). Two genuine open questions:

1. **Does the ADR-007 / current-code drift on bias-tag thresholds (§2 row 8) get reconciled as part of
   registering it, or registered as-is with the disagreement flagged?**
   *Recommendation: register the CURRENT code value (0.80/0.65, `governing_decision = NULL` — honestly
   marking "no ratified decision governs this value today" rather than citing ADR-007 for numbers it
   doesn't state) and separately flag row 8 as a `rule-13` "flag is a commitment" item for either a new
   ADR ratifying 0.80/0.65 or a code fix restoring ADR-007's numbers.*
   Tradeoff: citing ADR-007 anyway would be more complete-looking but would misrepresent an ADR as
   currently governing a value it does not — the exact "confidently wrong" failure rule 14 exists to
   prevent applied to this table itself.

2. **Does `subsystem` (§3) get its own CHECK-constrained vocabulary, or stay free text?**
   *Recommendation: free text for v1 — only 3 subsystems exist today (`connections-scorer`, `urgency`,
   `emission-factors`, plus `bias-classification` once row 8 is registered = 4), too small a
   population to justify a fourth managed vocabulary alongside `origin_class`/`derivation`/`ORIGIN_CLASS`
   this repo already maintains. Revisit if the register passes ~15-20 distinct subsystems (informal
   threshold, not a hard rule) and drift between free-text spellings becomes a real filtering problem.*
   Tradeoff: a CHECK now would prevent a future typo'd subsystem silently fragmenting the admin panel's
   grouping, at the cost of a vocabulary-widening ceremony for a 4-value set that doesn't yet need one.
