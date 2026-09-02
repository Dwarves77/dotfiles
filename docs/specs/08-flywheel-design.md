# The flywheel design: how five surfaces compound instead of coexisting

Status: DESIGN for external review, 2026-08-12. **Self-contained**: readable without the rest of the
repo. Companion documents are `07-page-walkthrough.md` (the screens) and `00-foundation-the-spine.md`
(the vocabulary rationale), but nothing here depends on them.

Product context in one paragraph: Caro's Ledge is a freight sustainability intelligence platform. Its
readers are freight forwarders (art logistics, live events, luxury goods, automotive, humanitarian
cargo), expanding to general forwarding across air, road, ocean and rail. It has five customer surfaces:
**Regulations** (what binds me, when, what it costs), **Market Intel** (comparative and numerical
signal), **Research** (horizon assessments), **Operations** (jurisdictional cost and feasibility), and
**Community** (verified-identity peer exchange). Stack is Next.js on Vercel over Supabase Postgres.

**The failure mode this design exists to prevent:** five surfaces that each look intelligent, share a
navigation bar, and silently disagree. That is what we have today. A change on one surface does not move
anything on another, counts and rows are classified by two different populations on every page, and
~17 UI fields are bound to producers that do not exist.

---

## 0. The two loops, and which one this document specifies

There are two distinct compounding loops. Conflating them is a common design error.

**Loop A, discovery compounding** (already specified in `docs/plans/recursive-compounding-discovery-2026-08-10.md`):
corpus grows → edges cluster into themes → cluster *shape* reveals a gap → gap becomes a discovery
target → finding it adds nodes → re-cluster. The system's current knowledge tells it where to look next.

**Loop B, decision propagation** (this document): a fact changes on one surface → every derived value
that depends on it is invalidated → recomputed → the reader is told which of *their* decisions moved.

Loop A makes the corpus grow. **Loop B is what makes it one product.** Without Loop B, a Research
finding that a factor was revised does not change the Operations payback that used that factor, and the
reader has to notice the connection themselves, which they will not.

---

## 1. Unified entity spine

### 1.1 The design

**Class-table inheritance over a single identity table.** One `entities` row per real-world thing,
carrying the permanent primary key and the crosswalk; one per-type attribute table carrying the
type-specific columns. Every other table in the system references `entities.entity_id`, never a text
name.

```sql
CREATE TYPE entity_kind AS ENUM (
  'corridor','node','jurisdiction','organisation','asset',
  'instrument','obligation','method','technology','signpost','person'
);

CREATE TABLE entities (
  entity_id      text PRIMARY KEY,              -- 'cl:corridor:7f3a9c21', permanent, NEVER reused
  kind           entity_kind NOT NULL,
  canonical_name text        NOT NULL,
  status         text        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','merged','retired')),
  merged_into    text        REFERENCES entities(entity_id),  -- tombstone target, never a hard delete
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT id_matches_kind CHECK (entity_id LIKE 'cl:' || kind::text || ':%'),
  CONSTRAINT merged_has_target CHECK ((status = 'merged') = (merged_into IS NOT NULL))
);

-- Crosswalk to published identifier standards. ADOPT, never invent: this is what makes our data
-- joinable to the customer's TMS and to the free datasets, most of which are keyed on these.
CREATE TABLE entity_identifiers (
  entity_id  text NOT NULL REFERENCES entities(entity_id),
  scheme     text NOT NULL,   -- 'LEI','IMO_SHIP','IMO_COMPANY','UNLOCODE','IATA','ICAO','ISO3166_2',
                              -- 'NUTS','CELEX','ELI','ROR','ORCID','EORI','SCAC','ISO6346'
  value      text NOT NULL,
  scheme_version text,        -- NUTS is versioned; pin it or comparisons silently break
  asserted_by text NOT NULL,  -- provenance on the ALIAS, not just the entity
  asserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, scheme, value)
);
CREATE UNIQUE INDEX one_entity_per_identifier
  ON entity_identifiers (scheme, value, coalesce(scheme_version,''));
```

### 1.2 The four kinds the review asked about

**Corridor.** No standard exists, and it is the atomic unit of freight, so we mint it. The ID is a
**deterministic content hash**, which matters: two independent ingest paths produce the same corridor ID
with zero coordination, so there is no merge step and no drift.

```sql
CREATE TABLE corridors (
  entity_id     text PRIMARY KEY REFERENCES entities(entity_id),
  origin_node   text NOT NULL REFERENCES entities(entity_id),
  dest_node     text NOT NULL REFERENCES entities(entity_id),
  mode          text NOT NULL CHECK (mode IN ('air','road','ocean','rail','multimodal')),
  leg_ordinal   smallint,        -- NULL for a whole corridor; set for a leg within a chain
  UNIQUE (origin_node, dest_node, mode, leg_ordinal)
);
-- entity_id = 'cl:corridor:' || left(sha256(origin||'|'||mode||'|'||dest||'|'||coalesce(leg,'')),16)
```

**Asset.** Keyed on the IMO ship number, which is genuinely permanent: unchanged across flag, owner,
name and type change for the life of the hull. MMSI is mutable and is therefore an *attribute*, never a
key. This is the field that lets us join EMSA THETIS-MRV verified per-ship emissions to a carrier.

**Obligation.** An obligation is a **first-class entity, not a child row of an instrument.** This is the
single most consequential modelling choice in section 1. It is what lets a signpost fire against an
obligation, a corridor be scoped to an obligation, and an obligation be versioned independently of the
document that contains it. If obligations were rows under instruments, we could only ever say "this
document changed", never "this duty changed".

```sql
CREATE TABLE obligations (
  entity_id        text PRIMARY KEY REFERENCES entities(entity_id),
  instrument_id    text NOT NULL REFERENCES entities(entity_id),
  pinpoint         text NOT NULL,        -- 'Art. 7(2)(b)' — the provision, not the document
  eli_uri          text,                 -- carries point-in-time + version natively for EU law
  as_at_date       date NOT NULL,        -- which version of the text we assessed
  binding_position text NOT NULL CHECK (binding_position IN
                     ('direct_duty','carrier_passthrough','customer_contract','monitoring_only')),
  duty_holder_class text NOT NULL,
  -- Four dates, never one. Conflating them is a whole class of product failure.
  entry_into_force date, date_of_application date,
  first_deadline   date, enforcement_start date,
  obligation_version int NOT NULL DEFAULT 1,
  supersedes       text REFERENCES entities(entity_id)
);
```

**Signpost.** A machine-observable predicate whose firing changes a Research assessment's state. Making
it an entity is what closes Loop B on the Research surface without a human in the path.

```sql
CREATE TABLE signposts (
  entity_id     text PRIMARY KEY REFERENCES entities(entity_id),
  assessment_id text NOT NULL REFERENCES entities(entity_id),
  watches       text NOT NULL REFERENCES entities(entity_id),  -- the entity to observe
  predicate     jsonb NOT NULL,   -- {op:'date_passed', field:'first_deadline'} |
                                  -- {op:'threshold', metric:'eua_eur_t', gte:100} |
                                  -- {op:'count_gte', relation:'implements', n:3}
  direction     text NOT NULL CHECK (direction IN ('confirms','refutes','delays')),
  fired_at      timestamptz,
  CONSTRAINT predicate_is_evaluable CHECK (predicate ? 'op')
);
```

**Scoping.** The join table that makes any entity addressable from any surface. This is the mechanism
behind "one corridor, five answers":

```sql
CREATE TABLE entity_scope (
  subject_id text NOT NULL REFERENCES entities(entity_id),
  scope_id   text NOT NULL REFERENCES entities(entity_id),
  relation   text NOT NULL,   -- closed vocabulary, each with a declared inverse
  confidence numeric(3,2),
  attributed_to text NOT NULL,   -- 'editor:jl' | 'rule:corridor-jurisdiction-v3' | 'model:xref-v2'
  PRIMARY KEY (subject_id, scope_id, relation)
);
```

### 1.3 Why drift becomes impossible rather than discouraged

Four mechanical properties, each with an enforcement point:

1. **No text entity references anywhere.** Enforced by a fitness function that fails CI on a query
   filtering on a name column where an `entity_id` FK exists.
2. **IDs are never reused.** `status='retired'` plus a tombstone; deletes are forbidden by RLS.
3. **Merges preserve inbound links.** `merged_into` resolves at read time, so an old ID 301s rather
   than 404s.
4. **One canonical URL per entity.** Already shipped: `canonicalSurfaceForItem()` derives the surface
   from `(item_type, domain)` and is consumed by *both* the outbound link builder and the inbound route
   guard, so a link and a guard cannot disagree by construction.

**Already shipped** (PR #450, #451): the surface classifier as single source of truth, route admission
guards on all four detail routes, and the six shared vocabularies as frozen enums. **Not yet built:**
the `entities` table itself. v1 scope is narrow — corridor, jurisdiction, organisation, instrument,
obligation — because those five carry every cross-surface join in Loop B.

---

## 2. Event-driven propagation engine

### 2.1 The binding constraint, stated first

This project runs under a hard operator constraint: **nothing armed.** No cron, no `schedule:` block,
nothing enabled in the Actions UI, and no path that falls back to spend. That is not a limitation to
design around, it is a requirement to design *for*, and it rules out the obvious answers:

- **`pg_cron`** — this is arming. Excluded.
- **Bare `LISTEN`/`NOTIFY`** — not durable. A listener that is disconnected when `NOTIFY` fires loses
  the event permanently, and `NOTIFY` has an 8 kB payload cap. Unusable as the system of record.
- **External queue (SQS, Kafka, Inngest)** — spend, and a second system of record for causality.
- **Recompute inside the trigger** — the classic mistake. Cascading recompute in a `AFTER UPDATE`
  trigger serialises unrelated writes, holds locks across a dependency fan-out, and deadlocks under
  concurrent ingest.

### 2.2 The design: transactional outbox + invalidation DAG + governed drain

Three parts. The important idea is that propagation **invalidates, it does not compute**. Marking is
O(dependents) and lock-light; computing is deferred to a governed step.

**Part 1, the outbox.** A Postgres trigger writes the event in the *same transaction* as the change, so
an event cannot be lost and cannot exist for a write that rolled back.

```sql
CREATE TABLE propagation_events (
  event_id     bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  subject_id   text NOT NULL REFERENCES entities(entity_id),
  event_type   text NOT NULL,   -- 'value_revised' | 'obligation_amended' | 'signpost_fired'
                                -- | 'factor_superseded' | 'confidence_decayed' | 'source_frozen'
  payload      jsonb NOT NULL,
  drained_at   timestamptz,     -- NULL = pending. The queue depth IS the visible flywheel tension.
  drain_run_id uuid
);
CREATE INDEX pending_events ON propagation_events (occurred_at) WHERE drained_at IS NULL;
```

```sql
CREATE OR REPLACE FUNCTION emit_propagation_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only emit when a MATERIAL field moved. Emitting on every UPDATE makes the outbox a write-amplifier
  -- and the queue depth meaningless.
  IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    INSERT INTO propagation_events (subject_id, event_type, payload)
    VALUES (NEW.entity_id, TG_ARGV[0],
            jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)));
  END IF;
  RETURN NEW;
END $$;
```

**Part 2, the invalidation DAG.** The dependency graph is **derived from the provenance chain, not
hand-maintained** — that is what stops it going stale. Every derived value already records what it was
computed from (W3C PROV `wasDerivedFrom`); those edges *are* the graph.

```sql
CREATE TABLE derivation_edges (
  derived_id   text NOT NULL REFERENCES entities(entity_id),
  input_id     text NOT NULL REFERENCES entities(entity_id),
  method_id    text NOT NULL REFERENCES entities(entity_id),
  method_version int NOT NULL,
  PRIMARY KEY (derived_id, input_id, method_id)
);

-- Must be a DAG. A cycle here means a value depends on itself and the drain would not terminate.
CREATE OR REPLACE FUNCTION assert_acyclic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE reach(id, depth) AS (
      SELECT NEW.derived_id, 0
      UNION ALL
      SELECT e.derived_id, r.depth + 1
      FROM derivation_edges e JOIN reach r ON e.input_id = r.id
      WHERE r.depth < 32                       -- hard depth cap: cheap protection against a deep chain
    ) SELECT 1 FROM reach WHERE id = NEW.input_id
  ) THEN RAISE EXCEPTION 'derivation cycle: % -> %', NEW.input_id, NEW.derived_id;
  END IF;
  RETURN NEW;
END $$;
```

Invalidation is one recursive statement, marking the transitive closure stale:

```sql
WITH RECURSIVE affected(id) AS (
  SELECT subject_id FROM propagation_events WHERE drained_at IS NULL
  UNION                                       -- UNION not UNION ALL: dedupes a diamond fan-out
  SELECT e.derived_id FROM derivation_edges e JOIN affected a ON e.input_id = a.id
)
UPDATE derived_values d
   SET admissibility = 'stale', stale_since = now()
  FROM affected a WHERE d.entity_id = a.id;
```

**Part 3, the governed drain.** Recomputation happens in **one** place, invoked by a signed caller,
never by the clock. This reuses a pattern already live in the repo: a single pipeline entry point, one
chokepoint, a frozen two-name allowlist of authorised callers, enforced by a fitness function that fails
CI on any raw `fetch(` in a transport module.

```
runPropagationDrain(caller)
  ├─ assertAuthorisedCaller(caller)        -- frozen allowlist; not an env var
  ├─ claim pending events (SKIP LOCKED)    -- concurrency-safe, no double-compute
  ├─ topologically sort the stale set       -- inputs before dependents, so one pass suffices
  ├─ for each: recompute via its declared method_id + method_version
  │            └─ writes a NEW derived_values row; the prior row is retained
  ├─ emit reader notices for portfolio hits
  └─ mark events drained, write a run record
```

**Live invalidation to the browser** rides Supabase Realtime (Postgres logical replication, free tier)
on `derived_values`, so an open page greys a figure the moment it goes stale. Realtime is used for *UI
freshness only* and is never the causality mechanism, because a websocket drop must not lose an event.

### 2.3 The worked example the review is really asking about

> A Research assessment revises the emission factor it relied on. What automatically moves?

```
1. WRITE      factor cl:method:glec-road-eu v3.1 superseded by v3.2
              trigger fires in-transaction → propagation_events row

2. INVALIDATE recursive closure marks stale:
              ├─ Operations: 4 automate-vs-hire results that used the factor
              │              (their npv, payback, breakeven_wage all derived from it)
              ├─ Market Intel: carbon-cost-per-FEU on 11 corridors
              ├─ Regulations: CountEmissions EU applicability note (method-dependent)
              └─ Research: 2 assessments citing the factor → confidence recomputed

3. DRAIN      operator-fired. Topological order: factor → corridor carbon cost →
              corridor rate decomposition → regional payback → assessment confidence.
              Each writes a new row; old rows retained for the audit trail.

4. NOTIFY     reader-facing, portfolio-scoped, and this is the part that makes it a product:
              "A factor used in your 14 Mar filed report was revised.
               Rotterdam–Milan payback moves 3.4y → 3.9y. Break-even wage
               €38.10 → €41.20. Recalculation notice, with both versions."
```

Step 4 is the flywheel's actual output. A system that recomputes silently has an accurate database. A
system that tells you *which of your decisions moved* has a product.

### 2.4 What is honest about this today

The engine is **designed to be armed and is deliberately not armed.** Events accumulate durably; the
queue depth is visible; draining is an operator action. When the arming decision is taken, the scheduled
caller invokes the *same* `runPropagationDrain` the manual button does, with zero manual-only branch, so
"manual" reduces to a button that does what the clock will do. That property is worth more than
automation: it means arming is a configuration change, not a rewrite.

---

## 3. State machine and decay rules

### 3.1 Two orthogonal axes, never merged

Collapsing these is the standard error. **Lifecycle** describes what the evidence has done.
**Admissibility** describes what a consumer may do with it. They are independent: a `strengthening`
signal is still inadmissible in a financial output.

```
LIFECYCLE   emerging → strengthening → corroborated → verified
                    ↘ stalled ↘ falsified ↘ superseded ↘ obsolete

ADMISSIBILITY  display_only → analysis_ok → calculation_ok → filing_ok
```

Transitions are event-driven, never time-driven, so nothing needs a sweep job:

| From | To | Trigger |
|---|---|---|
| emerging | strengthening | second **independent** corroborating origin |
| strengthening | corroborated | ≥3 independent origins, ≥2 jurisdictions |
| corroborated | verified | editor traces to primary source **and** attaches a PROV chain |
| any | falsified | a higher-authority source contradicts, or a signpost fires `refutes` |
| verified | superseded | successor entity created; tombstone, never delete |
| any | obsolete | horizon band computes to `UNRESOLVED-DECAY` |

### 3.2 Decay is computed, never stored

Storing a decayed score requires a sweep to keep it true, and a sweep is arming. So decay is a **pure
function of age evaluated at read time**, which is always correct and needs no scheduler.

```sql
CREATE OR REPLACE FUNCTION effective_confidence(
  base numeric, asserted_at timestamptz, half_life_days int, now_ts timestamptz
) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT round(base * power(0.5, extract(epoch from (now_ts - asserted_at))
                                 / (half_life_days * 86400.0)), 3);
$$;
```

Half-lives are per class, and the short ones are short on purpose:

| Class | Half-life | Why |
|---|---|---|
| Statutory text | ∞ (no decay) | It is true until amended. Decay would be nonsense |
| Verified editorial | 730 d | Slow drift in interpretation |
| Community-contributed | **365 d** | Gartner halves peer-review weight every 12 months. A corroborated 2024 SAF premium is not evidence about 2026 |
| Market signal, unconfirmed | **30 d** | A four-week-old unconfirmed rumour is noise |
| Modelled estimate | tied to input freshness | Inherits, never independent |

**Freshness is derived, not asserted** — already shipped and under test. Computed from an as-of triple
(`event_date`, `source_published_at`, `ingested_at`, three genuinely different facts) against a declared
cadence:

```
current  ≤ 1 period   ·  ageing ≤ 2  ·  stale ≤ 4  ·  frozen > 4  ·  unknown (no cadence)
```

`frozen` is the state that matters and the one everyone omits: the source has **stopped publishing**,
which is categorically different from late. Our own `regional_data_facts` table is frozen today — its
only writer is a hand-run one-shot on the dead-code manifest — and without this state the surface
renders a dead feed as merely pending.

### 3.3 The pollution barrier

One gate function. Every consumer calls it; nothing reads `derived_values` directly.

```ts
export function admissibleFor(v: Value, use: Use, now: Date): Verdict {
  if (v.lifecycle === 'falsified' || v.lifecycle === 'obsolete') return refuse('lifecycle');
  if (v.admissibility === 'stale')                               return refuse('pending recompute');

  // Hard, non-overridable floors. Community NEVER reaches a number a customer files.
  if (use === 'filing' || use === 'calculation') {
    if (v.origin_class === 'community' || v.origin_class === 'community-corroborated')
      return refuse('community is never admissible in a calculation, at any corroboration level');
    if (v.obs_status && isMissing(v.obs_status)) return refuse('missing is not zero');
  }
  if (use === 'filing' && !isContractable(v.derivation)) return refuse('non-contractable derivation');

  const eff = effectiveConfidence(v, now);
  if (use !== 'display' && eff < FLOOR[use]) return refuse(`decayed below floor (${eff})`);
  return { ok: true, effectiveConfidence: eff, mustLabel: v.origin_class };
}
```

Two enforcement points beyond code review: a fitness function fails CI on any direct read of
`derived_values` outside the gate module, and RLS denies `SELECT` on the raw table to the application
role, granting it only on a view that has already applied the gate.

**Aggregates propagate to the weakest constituent.** Already shipped and tested: one `modelled` input
makes an aggregate non-contractable, one `community` input makes it non-citable, one `frozen` input makes
the aggregate read frozen. Order-independent, and an unknown constituent fails to the weakest rather
than being skipped.

---

## 4. Formula versus estimate isolation

A `derivation` label is necessary and **not sufficient**, because a label can be forgotten. Isolation
here is enforced at four independent layers, so a single mistake at any one layer is caught by another.

### Layer 1, separate physical tables

Not one table with a flag. **Different tables cannot be conflated by omission.**

```sql
-- Statutory: a published formula, published constants, an auditable input set.
CREATE TABLE statutory_computations (
  entity_id       text PRIMARY KEY REFERENCES entities(entity_id),
  obligation_id   text NOT NULL REFERENCES entities(entity_id),
  formula_id      text NOT NULL,          -- 'fueleu_annex_iv_penalty'
  formula_version text NOT NULL,
  statute_citation text NOT NULL,         -- the provision the formula comes FROM
  unit_price      numeric,                -- e.g. 2400.00
  unit_price_unit text,                   -- 'EUR/t_VLSFOe'
  inputs          jsonb NOT NULL,
  result          numeric NOT NULL,
  result_unit     text NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT statutory_needs_citation CHECK (length(statute_citation) > 0),
  CONSTRAINT statutory_never_null_result CHECK (result IS NOT NULL)
);

-- Estimates: model output, scenario bands, projections. Range-native, and a point estimate is the
-- exception rather than the default.
CREATE TABLE estimated_values (
  entity_id     text PRIMARY KEY REFERENCES entities(entity_id),
  model_id      text NOT NULL,
  model_version text NOT NULL,
  point         numeric,
  low           numeric, high numeric,
  distribution  jsonb,
  pedigree      jsonb NOT NULL,          -- ecoinvent 5-axis; the assurance vocabulary
  CONSTRAINT estimate_has_uncertainty CHECK (low IS NOT NULL OR distribution IS NOT NULL),
  CONSTRAINT estimate_range_ordered   CHECK (low IS NULL OR high IS NULL OR low <= high),
  CONSTRAINT estimate_brackets_point
    CHECK (point IS NULL OR low IS NULL OR (point BETWEEN low AND high))
);
```

### Layer 2, a type-level barrier

Mixing becomes a **compile error**, not a runtime check:

```ts
type Contractable  = 'observed' | 'transacted_index' | 'assessed' | 'calculated';
type NonContractable = 'interpolated' | 'modelled' | 'estimated';

type StatutoryInput = { derivation: Contractable; value: number; unit: string;
                        citation: string; asOf: AsOfTriple };

// Accepts ONLY contractable inputs. Passing a modelled value does not type-check.
export function computeStatutory<F extends FormulaId>(
  formula: F, inputs: Record<InputKeyOf<F>, StatutoryInput>
): StatutoryResult { /* pure; no I/O; no defaulting; throws on a missing key */ }
```

### Layer 3, a database constraint on the derivation graph

A statutory result may not transitively depend on an estimate. The DAG already records the dependency,
so the check is a query:

```sql
CREATE OR REPLACE FUNCTION assert_statutory_purity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE inputs(id) AS (
      SELECT input_id FROM derivation_edges WHERE derived_id = NEW.entity_id
      UNION SELECT e.input_id FROM derivation_edges e JOIN inputs i ON e.derived_id = i.id
    )
    SELECT 1 FROM inputs JOIN estimated_values ev ON ev.entity_id = inputs.id
  ) THEN
    RAISE EXCEPTION 'statutory computation % depends on an estimate', NEW.entity_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER statutory_purity BEFORE INSERT OR UPDATE ON statutory_computations
  FOR EACH ROW EXECUTE FUNCTION assert_statutory_purity();
```

### Layer 4, separate render components and one gate

`<StatutoryFigure>` accepts only a `statutory_computations` row and always renders formula, citation,
unit price and version. `<EstimatedFigure>` accepts only an `estimated_values` row and **always renders a
range**; it has no point-only mode. A fitness function fails CI if either component's prop type is
widened, or if they appear inside the same visual slot component.

**Worked contrast:**

```
FuelEU Maritime penalty          STATUTORY
€2,400 / t VLSFOe · Annex IV · balance = (target − actual) × Σ energy MJ
2025 target 91.16 × 0.98 = 89.34 gCO2e/MJ · formula v1 · inputs: 3 observed

Diesel-parity crossover          ESTIMATE
2029–2034 (70% interval) · Wright's-law fit, Monte Carlo n=10,000
pedigree 2/2/3/2/3 · NOT contractable · not admissible in a filing
```

And the mandatory refusal state, because a forecasting method that cannot decline is a liability: for
technologies with no deployment history (ammonia bunkering, liquid-hydrogen air cargo) the system emits
**"not forecastable"** plus the conditional structure and its signposts, rather than a fitted number.
SAF availability is a refinery-capacity problem, not a learning-curve problem, and Wright's law applied
to it would produce a confidently wrong date.

---

## 5. Antitrust and anonymisation safeguards

Community is a room shared by direct competitors, so this is designed first and enforced at write time.
**k ≥ 5 is the floor, not the defence** — the interesting attacks defeat it.

### 5.1 Write-time gates on sensitive fields

Defensible-exchange criteria from current US practice: historical only, aggregated across ≥5
participants with none contributing >25%, anonymised, and administered by a neutral third party. We are
that third party.

```sql
CREATE TABLE sensitive_field_policy (
  field_key       text PRIMARY KEY,   -- 'rate_per_feu','wage_per_hour','capacity_teu','saf_premium_pct'
  min_contributors int NOT NULL DEFAULT 5,
  max_share_pct   numeric NOT NULL DEFAULT 25.0,
  min_lag_days    int NOT NULL DEFAULT 90,
  forward_looking_allowed boolean NOT NULL DEFAULT false,  -- forward pricing: never
  bucket_scheme   text NOT NULL                            -- publish buckets, never raw values
);
```

The publish path **refuses**, it does not flag, because a re-disaggregable dataset cannot be
un-published:

```sql
CREATE OR REPLACE FUNCTION publish_aggregate(p_field text, p_cohort jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE pol sensitive_field_policy; n int; orgs int; top numeric; newest date;
BEGIN
  SELECT * INTO pol FROM sensitive_field_policy WHERE field_key = p_field;
  IF NOT FOUND THEN RAISE EXCEPTION 'field % not in policy: refusing by default', p_field; END IF;

  SELECT count(*), count(DISTINCT org_id), max(observed_on),
         max(share) FROM (
    SELECT org_id, observed_on,
           count(*) OVER (PARTITION BY org_id)::numeric * 100 / count(*) OVER () AS share
      FROM contributions WHERE field_key = p_field AND cohort @> p_cohort
  ) s INTO n, orgs, newest, top;

  IF orgs < pol.min_contributors THEN
    RAISE EXCEPTION 'refused: % contributing organisations, minimum %', orgs, pol.min_contributors;
  END IF;
  IF top > pol.max_share_pct THEN
    RAISE EXCEPTION 'refused: one organisation contributes %%%, cap %%%', top, pol.max_share_pct;
  END IF;
  IF newest > current_date - pol.min_lag_days THEN
    RAISE EXCEPTION 'refused: data newer than the % day lag', pol.min_lag_days;
  END IF;

  RETURN bucketise(p_field, p_cohort, pol.bucket_scheme);   -- buckets out, never raw values
END $$;
REVOKE ALL ON contributions FROM authenticated;   -- the ONLY read path is this function
```

Note `count(DISTINCT org_id)`, not `count(*)`. Five submissions from one company is one contributor, and
counting rows rather than organisations is the most common way this control is quietly defeated.

### 5.2 The attacks k ≥ 5 does not stop

**(a) Query-set-size / tracker attack.** Ask for cohort A (n=6) and cohort A-minus-one-attribute (n=5).
The difference is one company's value. Both queries pass k ≥ 5.

*Mitigations, all three:* **fixed pre-computed cohorts only** on sensitive fields, so arbitrary
user-defined slicing is not offered; a **query audit log with overlap detection** that refuses a request
whose symmetric difference from a prior request by the same viewer is below a threshold; and **cohort
minimums enforced on every dimension combination**, not just the top-level count.

```sql
CREATE TABLE aggregate_query_log (
  viewer_id uuid NOT NULL, field_key text NOT NULL,
  cohort jsonb NOT NULL, member_set_hash text NOT NULL,   -- hash of the contributing org set
  requested_at timestamptz NOT NULL DEFAULT now()
);
-- Refuse when |prior_set Δ this_set| < 3 for the same viewer and field within 90 days.
```

**(b) Complementary-cell disclosure.** Suppress one cell in a row that also publishes a total, and the
suppressed value is recoverable by subtraction. Standard statistical-disclosure-control failure.
*Mitigation:* complementary suppression — suppressing a primary cell forces suppression of enough
secondary cells that no linear combination recovers it, and we never publish a total alongside a
partially suppressed breakdown.

**(c) Longitudinal re-identification.** Two periods on a small cohort where membership changed by one
identifies the joiner or leaver. *Mitigation:* no time series on a cohort below 2× the minimum, and
cohort membership is **frozen for the life of a published series**, with a new series ID when it changes.

**(d) AI-assisted re-disaggregation.** Agencies now explicitly recognise that models can re-disaggregate
supposedly anonymous sets, so the historical safe-harbour arithmetic is a floor. *Mitigation:* buckets
rather than point values, bucket widths that scale inversely with cohort size, and no cross-field joins
on sensitive fields within one cohort.

### 5.3 The structural boundary

The strongest control is architectural, and it is the same one that makes section 4 work: **community
data physically cannot reach a statutory computation.** `admissibleFor()` refuses `community` and
`community-corroborated` for `calculation` and `filing` with no override, the derivation-purity trigger
rejects any statutory row that transitively touches an estimate, and a lineage audit asserts zero paths
from a community record to any figure in an export. Verified by test, not by policy.

Plus, from Gartner's Peer Insights model: **verified identity, pseudonymous display** (role, industry,
company size, region; never name or company) and **no direct messaging**, which is simultaneously an
anti-solicitation and an anti-collusion control.

---

## 6. What is built, what is designed

| | Status |
|---|---|
| Surface classifier as single source of truth; route admission guards on all 4 detail routes | **SHIPPED** (PR #450) |
| Six shared vocabularies as frozen enums, 35 tests | **SHIPPED** (PR #451) |
| Number envelope: `derivation`, as-of triple, zero-fill guard, pp-vs-%, propagate-to-weakest, 30 tests | **SHIPPED** (PR #451) |
| Freshness derived incl. `frozen`; wired into the Operations fact path | **SHIPPED** (PR #451) |
| `entities` + `entity_identifiers` crosswalk + `entity_scope` | **SHIPPED, schema-only** (migration 282/283, Lane DP-SPINE, 2026-09-02 — see [ADR-024](../decisions/ADR-024-decision-propagation.md)); backfilled for jurisdiction/instrument/organisation kinds (`scripts/entities/backfill-entities.mjs`); progressive re-keying FK columns (`instrument_entity_id`, `organisation_entity_id`, `entity_refs`) live beside the existing text keys, held from regressing by F30 |
| Corridor, obligation, signpost per-kind attribute tables (§1.2) | DESIGNED, §1.2 — not built this lane; `entities` accepts `kind='corridor'`/`'obligation'`/`'signpost'` today with no attribute table yet |
| Outbox + derivation DAG + governed drain | **SHIPPED, schema + runtime** (migrations 284/285, Lane DP-ENGINE, 2026-09-02); `src/lib/propagation/drain.ts` + `scripts/turns/run-propagation-drain.mjs` implement the two-pass (invalidate, then apply-mode-only recompute) drain over the outbox; the `methods/index.ts` `registerMethod`/`METHODS` seam exists with **zero registered methods** — no concrete derivation method lands in this lane, so an apply-mode drain recomputes nothing until DP-SURF or a later lane calls `registerMethod` |
| Lifecycle × admissibility state machine; computed decay; the gate | **SHIPPED** (Lane DP-ENGINE, 2026-09-02): `src/lib/propagation/admissible-for.ts` implements `admissibleFor()` against ADR-024's FLOOR values; `src/lib/propagation/effective-confidence.mjs` computes decay per §3.2 (never stored); F31 fitness function pins the import boundary (only `src/lib/propagation/**` may query `derived_values`/`statutory_computations`/`estimated_values` directly). Not yet wired into a route or component — that call site is DP-SURF's task |
| Statutory/estimate physical + type + DB + component isolation | **SHIPPED, layers 1–3** (migration 286, Lane DP-ENGINE, 2026-09-02): separate physical tables (layer 1), the `assert_statutory_purity()` trigger enforcing the derivation-graph constraint (layer 3), F32 fitness function as a static mirror of the same rule. Layer 2 (the type-level barrier) is expressed in `register-derivation.ts`'s discriminated `origin_class`, not a distinct branded type. Layer 4 (separate render components + gate) is DESIGNED only — DP-SURF's task, not built here |
| Antitrust write-time gates + the four attack mitigations | **SHIPPED** (migration 287, Lane DP-ENGINE, 2026-09-02, two commits same day per operator ruling "nothing deferred"): the k≥5 floor, §5.2(a) query-set-size/tracker-attack overlap refusal, §5.2(b) complementary-cell suppression (exact-complement-within-a-caller-supplied-parent-set detection), §5.2(c) longitudinal freeze (`granted_payload` replayed verbatim within `min_lag_days`, proven under changed underlying values), §5.2(d) bucket rounding and width scaling (`bucket_value`/`bucket_width_multiplier`, grammar `pct:N`/`abs:N`/`log2`), the `max_share_pct` dominance cap, and the `forward_looking_allowed` future-period refusal are ALL implemented in `publish_aggregate()` and proven live by the migration's own self-check (14 real calls across 4 fields) plus a CI-testable pure JS mirror, `src/lib/propagation/aggregate-safeguards.mjs` (37 tests), sharing the same fixtures. Each of (b)-(d)/dominance/forward-looking activates only when the caller supplies the data it needs (`member_values`/`parent_member_ids`/`period_start`/`period_end` in `p_cohort_filter`) — honest given no live sensitive field exists yet (migration 287's own header: "NO LIVE SUBJECT TODAY") for a real caller to derive them from; a future lane wiring `community_contributions` activates every check as-is |

Gate battery on the shipped work: test suite 1311/1311 pre-existing (2754/2755 with Lane DP-ENGINE's
additions — see that lane's own report for the one anticipated F28 meta-harness re-pin), 26/26 fitness
functions with the same single anticipated violation, invariant-coverage meta-gate PASS, `tsc --noEmit`
clean.

## 7. The falsification test

A design that cannot be shown to be wrong is not engineering. Five assertions, each mechanically
checkable, each failing loudly:

1. **Spine:** zero queries filter on an entity name where an `entity_id` FK exists.
2. **Propagation:** revise one emission factor in a fixture; assert every dependent derived value is
   marked stale, and that after the drain each carries a new row with the new method version. Assert
   nothing outside the transitive closure was touched.
3. **Decay:** a community contribution older than one half-life fails `admissibleFor('calculation')`.
4. **Isolation:** a statutory computation whose input graph touches an estimate fails to insert.
5. **Anonymisation:** two overlapping cohort queries differing by one organisation are refused, and a
   lineage audit finds zero paths from a `community` record to any exported figure.

**The human test, for what CI cannot catch.** Hand an evaluator one corridor and one regulation. Ask
them to reach every relevant item on all five surfaces without using search or the URL bar, then state
which single question each screen answered. If a screen answers zero questions it is decoration; if it
answers more than one it is a dashboard; if they hit a dead end the spine has a hole there.

## 8. Open questions worth an outside opinion

1. **Drain granularity.** Per-event, or batch to a quiescent point? Batching is cheaper and gives one
   coherent reader notice instead of five; per-event gives lower latency once armed. Current lean:
   batch, because the reader notice is the product and five notices is noise.
2. **Should `estimated_values` ever back a customer-visible *decision*,** or only a
   customer-visible *range*? Current lean: range only, with the break-even value given equal billing to
   the point estimate, so the reader decides rather than the model.
3. **Confidence floors per use.** §3.3 references `FLOOR[use]` but the numbers are unset. These are
   product judgements with commercial consequences and should not be picked by whoever writes the code.
4. **Corridor identity granularity.** Port-pair, or Xeneta-style clustering by price correlation rather
   than geography? Correlation clustering is more useful analytically and much harder to explain to a
   customer. Currently port-pair.
