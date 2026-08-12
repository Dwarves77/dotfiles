# Surface spec 09: domain extensions, and two architectural resolutions

Status: DRAFT for operator review, 2026-08-12. Integrates an external architecture review (Gemini,
2026-08-12) into specs 00 to 08. Additive: nothing in 00 to 08 is retracted.

## 0. What the review got right, and what it changes

Eight functional domains were genuinely missing, one was a real defect in my design, and the brief leaves
two architectural questions unresolved that I resolve here rather than leaving ambiguous.

**The defect, owned.** The corridor ID scheme in spec 08 §1.2 hashed
`origin | mode | dest | coalesce(leg_ordinal,'')`. That is wrong in three independent ways, and the
worst is not the one the review named. **Routing was absent from the payload**, so Asia–Europe via Suez
and Asia–Europe via the Cape of Good Hope hashed *identically*. Those are not the same corridor: a Cape
reroute raises fuel burn roughly 30 to 40%, which moves the vessel into a higher FuelEU and EU ETS
penalty bracket and materially changes the carbon component of the rate. Two corridors whose statutory
cost differs by a third cannot share a primary key, and if they had, the rerouting-multiplier domain in
§1.7 below would have been unrepresentable. **FIXED AND SHIPPED** this unit, with 14 tests, including one
per collision class.

**The strongest addition** is the OEM equipment layer. Research was scoped TRL 1 to 6 and Market Intel
to spot rates, with nothing between them. The middle band is where the forwarder's actual question lives,
and it is the *leading* indicator: manufacturer commitments precede fleet tenders by 18 to 36 months.

---

## 1. The eight new domains

### 1.1 OEM equipment roadmap (Market Intel, TRL 7 to 9)

The bridge between lab science and spot rates. Two outputs justify the whole table.

```sql
CREATE TABLE oem_tech_roadmaps (
  entity_id       text PRIMARY KEY REFERENCES entities(entity_id),
  manufacturer_id text NOT NULL REFERENCES entities(entity_id),   -- cl:org:byd, cl:org:volvo_trucks
  tech_category   text NOT NULL CHECK (tech_category IN
                    ('heavy_battery','megawatt_charging','hydrogen_fcell','ammonia_engine',
                     'methanol_dualfuel','saf_refinery','e_axle','reefer_electrification')),
  commercial_stage text NOT NULL CHECK (commercial_stage IN
                    ('announced','pilot_demonstration','small_batch_fleet','mass_series_production')),
  target_year      int,
  -- The two fields that make payload and downtime computable:
  energy_density_wh_kg numeric,   -- PACK level, not cell. Cell-level flatters by 20-30% and is the
                                  -- number manufacturers quote. Store which, and refuse to mix.
  density_basis    text CHECK (density_basis IN ('cell','module','pack')),
  c_rate_max       numeric,       -- charge acceptance; with pack kWh this gives driver downtime
  usable_kwh       numeric,
  announced_at     date NOT NULL,
  source_id        text NOT NULL REFERENCES entities(entity_id),
  -- An OEM announcement is a VENDOR claim. It is evidence of intent, never of capability.
  origin_class     text NOT NULL DEFAULT 'community' CHECK (origin_class IN ('official','partner')),
  derivation       text NOT NULL DEFAULT 'observed',
  confidence_admiralty text          -- typically B2/C2: reliable source, uncorroborated claim
);
```

**Payload penalty delta.** Battery mass displaces cargo, and on a weight-limited long-haul road leg that
is a revenue loss, not an inconvenience:

```
Δpayload_kg = diesel_powertrain_kg − (usable_kwh / (energy_density_wh_kg / 1000)) − e_powertrain_kg
Δpayload_pct = Δpayload_kg / legal_payload_kg
```

At 160 Wh/kg pack this is roughly −18% payload; at 210 Wh/kg it is roughly −4%. **The forwarder's real
question is not "when is it available" but "when does it stop costing me a fifth of my revenue tonnes",**
and that is a different, later, computable date. `derivation = 'modelled'`, never contractable, always
rendered as a range.

**TCO crossover.** Fed by ICCT cost structures plus our own electricity and diesel series. Output is a
**crossover interval with a probability, never a date**: "diesel parity for this duty cycle falls in
2029 to 2034 at 70%". A point date here would be false precision on a Monte Carlo.

**Feeds forward:** 24 to 48 month forward rate models per corridor, which is the Market Intel lead-time
chart in spec 07 given a real driver rather than a diffusion proxy.

### 1.2 Carrier surcharge audit and FuelEU pooling arbitrage (Market Intel)

**This is the monetisation loop, and it is the sharpest commercial idea in the review.** Carriers bill
"EU ETS Surcharge" and "SAF Premium" line items. Under FuelEU Maritime a carrier may **pool** compliance
balances across its fleet, clearing a deficit at the pool's marginal cost, while billing the forwarder a
surcharge priced as though every tonne were penalised at €2,400/t VLSFOe.

```sql
CREATE TABLE carrier_compliance_pools (
  entity_id     text PRIMARY KEY REFERENCES entities(entity_id),
  carrier_id    text NOT NULL REFERENCES entities(entity_id),
  compliance_year int NOT NULL,
  pool_surplus_gco2e numeric,      -- from THETIS-MRV verified vessel data, aggregated per operator
  pool_deficit_gco2e numeric,
  implied_clearing_eur_per_t numeric,   -- what clearing ACTUALLY cost them
  derivation    text NOT NULL DEFAULT 'modelled',   -- inferred from public data; say so loudly
  method_id     text NOT NULL
);

CREATE TABLE surcharge_audits (
  entity_id      text PRIMARY KEY REFERENCES entities(entity_id),
  corridor_id     text NOT NULL REFERENCES entities(entity_id),
  carrier_id      text NOT NULL REFERENCES entities(entity_id),
  invoice_line    text NOT NULL,
  billed_eur      numeric NOT NULL,               -- observed, from the customer's own invoice
  statutory_eur   numeric NOT NULL,               -- statutory_formula: the real liability
  statutory_basis text NOT NULL,                  -- provision cited
  variance_eur    numeric GENERATED ALWAYS AS (billed_eur - statutory_eur) STORED,
  pool_adjusted_eur numeric                       -- modelled, where a pool position is inferable
);
```

**The isolation discipline matters more here than anywhere else in the product.** `statutory_eur` is
`statutory_formula` and citable. `pool_adjusted_eur` is `modelled` and must never be presented as the
carrier's actual cost, because we are inferring a commercial position from public vessel data. The
customer-facing claim is *"your billed surcharge exceeds the statutory liability by €X"* — defensible,
observed against statutory. It is **not** *"your carrier is overcharging you by €Y"*, which requires the
modelled pool position and is an accusation we cannot support. Same screen, two very different sentences,
and the derivation class is what keeps them apart.

**Flywheel effect:** exposing a variance saves real cash, which is why the forwarder uploads *every*
invoice, which deepens the proprietary rate corpus. That is Loop 2 in the review's model and it is the
only loop with an immediate, quantified payback to the user.

### 1.3 Dynamic carbon contract indexation (Market Intel → commercial)

A forwarder signing a three-year enterprise contract carries unhedged carbon risk. The generator emits
a clause with an explicit index, base, cap, floor, review cadence and a worked example.

```sql
CREATE TABLE indexation_clauses (
  entity_id     text PRIMARY KEY REFERENCES entities(entity_id),
  contract_ref  text,
  corridor_id   text REFERENCES entities(entity_id),
  index_id      text NOT NULL REFERENCES entities(entity_id),  -- EUA front-Dec, UKA, TTF
  base_value    numeric NOT NULL, base_date date NOT NULL,     -- frozen at signature
  passthrough_pct numeric NOT NULL CHECK (passthrough_pct BETWEEN 0 AND 100),
  cap_pct numeric, floor_pct numeric,
  review_cadence text NOT NULL CHECK (review_cadence IN ('monthly','quarterly','semiannual')),
  rounding_rule text NOT NULL
);
```

**Scope boundary, stated for the record:** we generate the clause *mechanics* and the arithmetic. We do
not give legal advice, and the output carries that on its face. This sits behind the same refusal rule as
the Assistant: the product supplies the obligation, the index and the computation; the customer's counsel
supplies the contract.

### 1.4 DQI and primary data share (Operations, ISO 14083 / GLEC v3)

The tender-competitiveness metric. Enterprise shippers now score on data quality, not just on a number,
and **DQI is per transport chain element, not per shipment** — that is the ISO 14083 unit, and averaging
it to the shipment destroys the thing the auditor wants to see.

```sql
CREATE TABLE tce_data_quality (
  entity_id       text PRIMARY KEY REFERENCES entities(entity_id),
  tce_id          text NOT NULL REFERENCES entities(entity_id),   -- transport chain element
  -- The five ISO 14083 / GLEC axes, 1 best .. 5 worst, deliberately the ecoinvent shape
  reliability smallint NOT NULL CHECK (reliability BETWEEN 1 AND 5),
  completeness smallint NOT NULL CHECK (completeness BETWEEN 1 AND 5),
  temporal_correlation smallint NOT NULL CHECK (temporal_correlation BETWEEN 1 AND 5),
  geographical_correlation smallint NOT NULL CHECK (geographical_correlation BETWEEN 1 AND 5),
  technological_correlation smallint NOT NULL CHECK (technological_correlation BETWEEN 1 AND 5),
  primary_data_share numeric NOT NULL CHECK (primary_data_share BETWEEN 0 AND 1),
  primary_evidence  text     -- what makes it primary: carrier telemetry, fuel receipt, verified MRV
);
```

Rolled up to a shipment as a **share and a distribution, never a mean**: "62% primary by tonne-km; 4 of
11 legs primary; weakest leg geographical correlation 4." A single DQI letter grade is what competitors
sell and it hides exactly the leg an auditor will ask about.

### 1.5 Auxiliary energy profiles (Operations)

The Operations surface assumed ambient freight. The customer's verticals are the opposite: fine art,
luxury, live events and pharma all carry **stationary auxiliary load** that never appears in a
per-tonne-km factor.

```sql
CREATE TABLE auxiliary_energy_profiles (
  entity_id    text PRIMARY KEY REFERENCES entities(entity_id),
  load_type    text NOT NULL CHECK (load_type IN
                 ('reefer_genset','airport_climate_hold','warehouse_hvac','museum_spec_hold',
                  'battery_conditioning','dehumidification')),
  node_id      text REFERENCES entities(entity_id),
  kw_draw      numeric NOT NULL,
  duty_cycle   numeric NOT NULL CHECK (duty_cycle BETWEEN 0 AND 1),
  setpoint_c   numeric, setpoint_rh_pct numeric,   -- 21±1°C / 50±5% RH is a real museum loan condition
  hours_typical numeric NOT NULL,
  grid_intensity_source text                        -- Ember or EEA gCO2/kWh at that node
);
```

This is the missing input to the HVAC-versus-hire decision in spec 07, and it is genuinely
differentiating: **a 72-hour climate-controlled airport hold for a museum loan can exceed the flight leg's
own emissions**, and no per-tonne-km model shows that. It also gives the art and live-events verticals a
number nobody else computes for them.

### 1.6 Grid connection queue (Operations)

Tracking €/kWh missed the actual barrier to electrification. **The binding constraint is the transformer
queue, commonly 24 to 36 months**, and a depot electrification plan that ignores it is fiction.

```sql
CREATE TABLE grid_connection_queues (
  entity_id      text PRIMARY KEY REFERENCES entities(entity_id),
  jurisdiction_id text NOT NULL REFERENCES entities(entity_id),
  dso_name       text NOT NULL,
  capacity_band_mw text NOT NULL,
  queue_months_p50 numeric, queue_months_p90 numeric,
  as_of          date NOT NULL,
  obs_status     text NOT NULL DEFAULT 'A'
);
```

Consequence for the Operations feasibility gate: grid queue becomes a **gate, not a cost line**. A region
with cheap power and a 36-month queue is `BLOCKED` for a 2027 electrification decision regardless of
€/kWh, and no amount of cheap electricity un-blocks it. BESS payback is the paired mitigation and belongs
in the same panel.

### 1.7 Geopolitical rerouting multipliers (Market Intel × Regulations)

The compounding case, and the one that forced the corridor fix.

```sql
CREATE TABLE reroute_events (
  entity_id   text PRIMARY KEY REFERENCES entities(entity_id),
  baseline_corridor_id text NOT NULL REFERENCES entities(entity_id),
  reroute_corridor_id  text NOT NULL REFERENCES entities(entity_id),  -- a DIFFERENT corridor entity
  cause       text NOT NULL,
  distance_delta_nm numeric, transit_delta_days numeric,
  fuel_burn_multiplier numeric NOT NULL,     -- ~1.30 to 1.40 for Cape vs Suez
  effective_from date NOT NULL, effective_to date
);
```

**The compounding chain, which is Loop B from spec 08 doing real work:** reroute → higher fuel burn →
higher GHG intensity → FuelEU compliance balance worsens → penalty crosses into a higher bracket → EU ETS
allowance cost rises → the corridor's carbon-per-FEU moves → the forwarder's indexation clause triggers →
the customer's Scope 3 figure changes. Five surfaces move from one event, automatically, because they
share the corridor entity. **A single scalar multiplier applied at the end would get this wrong**, because
the penalty function is bracketed, not linear.

### 1.8 EUDR geo-traceability and book-and-claim custody (Regulations)

Two distinct gaps with one theme: **the operational consequence is a border hold, not a later fine**, and
the product had been modelling fines.

```sql
CREATE TABLE eudr_plot_claims (
  entity_id  text PRIMARY KEY REFERENCES entities(entity_id),
  consignment_ref text NOT NULL,
  geometry_json jsonb,            -- point for <4ha, polygon otherwise
  area_ha numeric,
  validation_state text NOT NULL CHECK (validation_state IN
    ('missing','malformed','valid','fails_cutoff')),
  hold_risk text NOT NULL CHECK (hold_risk IN ('none','documentary','border_hold')),
  dds_reference text
);

CREATE TABLE custody_chains (
  entity_id text PRIMARY KEY REFERENCES entities(entity_id),
  credit_type text NOT NULL CHECK (credit_type IN ('saf_bnc','green_methanol','biodiesel_bnc','ets_allowance')),
  scheme text NOT NULL,                       -- ISCC PLUS, RSB, SFC
  certificate_ref text NOT NULL,
  retired_at date, retirement_registry text,
  double_count_check text NOT NULL CHECK (double_count_check IN
    ('unverified','single_claim_confirmed','conflict_detected')),
  claimant_id text REFERENCES entities(entity_id)
);
```

`hold_risk = 'border_hold'` must render as a **blocking operational alert**, in a different visual class
from a monetary exposure. A missing polygon does not cost money later, it stops the container now, and
those two facts do not belong in the same severity vocabulary. `double_count_check = 'conflict_detected'`
is a liability, not a data-quality flag: two parties claiming one SAF batch is a compliance exposure for
both.

---

## 2. Two architectural resolutions the brief leaves open

### 2.1 Read-time views versus materialised values: the brief specifies both

The review's brief says calculation happens "on-demand at read-time via database views, avoiding
long-running background cron jobs", *and* that ingest marks `derived_values.admissibility = 'stale'`.
Those are two different architectures and the tension has to be resolved, or it gets resolved
accidentally by whoever writes the first query.

**Resolution: read-time for MASKS, materialised for EVIDENCE.** The discriminator is auditability.

| Compute at read time | Materialise and invalidate |
|---|---|
| Freshness and staleness masks (pure function of a stored timestamp) | **Anything a customer filed.** A statutory computation submitted on 14 March must be reproducible byte-for-byte, and a read-time view recomputed against today's inputs cannot do that |
| Confidence decay (pure function of age) | Monte Carlo outputs — TCO crossover intervals, payload deltas. Too expensive per read, and non-deterministic without a stored seed |
| k-anonymity gating | Anything with an external input snapshot, because the input series will be revised |
| Unit conversion, index rebasing | Surcharge audits, which are the evidence in a commercial dispute |

**The rule in one line: if a customer could be asked to defend it, materialise it. If it is a way of
looking at something, compute it at read time.** A filed number that silently recomputes is not an
audit trail, it is a liability, and it is the single most expensive mistake available in this design.

`active_derived_values` remains exactly right as the read-time resolution view: it applies decay,
freshness and admissibility masks over materialised rows. It does not *compute* the rows.

### 2.2 Staleness is deferred, but the mask is already shipped

Noted that staleness is not a build-1 concern. Agreed on the **drain**: arming is deliberately deferred,
events accumulate durably, and the queue depth is the visible tension.

One correction worth having on the record, because it changes what "deferred" means: **the read-time mask
is already built, tested and wired.** Freshness derives from the as-of triple against a declared cadence
and returns `current / ageing / stale / frozen / unknown`, and it is live in the Operations fact path.
So the honest status is not "deferred", it is "mask done, drain deferred". That distinction matters for
one reason: `frozen` is what makes the EU/US Operations data hole legible instead of looking pending, and
that hole is a build-1 credibility problem, not a build-2 one.

---

## 3. Shipped this unit

| Change | Detail |
|---|---|
| **Corridor identity, fixed** | `src/lib/contracts/corridor-id.mjs`. Length-prefixed canonical payload, printable NULL sentinel, routing key and ordered via-list in the hash, scheme version, SQL codegen twin for JS/SQL parity. 14 tests: one per collision class, plus a 180-spec matrix asserting zero collisions |
| **Statutory derivation classes** | `statutory_fixed` and `statutory_formula` added to the derivation enum, ordered above `observed`, with `isStatutory()`. `calculated` had been conflating "we computed it" with "the statute prescribes it"; a FuelEU penalty is the statute's arithmetic and a compliance reader must see which. 5 new tests |
| **Governance records** | F23 exemption for a `createHash().update()` false positive against the DB-write regex, with the durable detector fix named as evidence rather than requested as a relaxation. F25 allowlist entry for corridor-id with a **named landing point** that the spine unit must delete |

Gates: test suite **1329/1329** (was 1311), fitness **20/20 with 0 violations**, invariant-coverage
meta-gate **PASS**, `tsc --noEmit` clean.

## 4. Sequencing consequence

The eight domains do not change the phase order in spec 06, they populate Phases 3 and 4. Two move
*earlier* than their spec-06 position because they are now on the critical path:

1. **The corridors table** moves to the front of the spine unit, because §1.7 rerouting, §1.2 surcharge
   audit and §1.1 forward rate impact all key on it, and the ID scheme is now settled.
2. **The surcharge audit** moves ahead of the other Market Intel components. It is the only one with an
   immediate cash payback to the user, which makes it the loop that earns the right to ask for invoice
   uploads, and every other Market Intel component gets better with that corpus.

## 5. Open, and genuinely operator decisions

1. **Pool-position inference.** §1.2's `pool_adjusted_eur` infers a carrier's commercial position from
   public vessel data. Defensible as `modelled` and clearly labelled. Do we publish it at all, or hold
   the product to the observed-versus-statutory variance only? Publishing invites a carrier dispute;
   withholding leaves the sharpest number on the table. **I would hold it internally and publish only
   the statutory variance**, but that is a commercial risk call, not a technical one.
2. **Indexation clause output format.** Mechanics and arithmetic only, or a drafted clause? Drafted text
   reads as legal advice however it is captioned.
3. **OEM density basis.** Manufacturers quote cell-level Wh/kg; payload maths needs pack-level, which is
   typically 20 to 30% lower. Do we publish a derived pack estimate where only cell is disclosed, or
   show `M` (missing)? Consistent with everything else in this design the answer is `M`, but it will make
   the table look emptier than a competitor's.
4. **Confidence floors per use.** Still unset from spec 08 §3.3, and still a commercial judgement that
   should not be picked by whoever writes the code.
