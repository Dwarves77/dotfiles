# Host-registration census + dispositions (2026-07-14)

$0 census of every unregistered/null-tier host the priced run surfaced, ruled by the operator. Input to the
coverage-floor unit. Related: [gate-b-close](../ops/gate-b-close-2026-07-14.md) ·
[re-grounds-never-destroy landed](../ops/gate-b-close-2026-07-14.md). Doctrine: `registration-does-not-unlock`.

## The finding (divergence from the dispatch premise)
The null-tier holds are NOT dominated by unregistered official primaries. Across ~130 null-tier host groups,
the dominant bucket is **non-primary corroborators** — law firms, trade news, analysts, aggregators/wikis. Even
**Brazil's 11 null-tier facts** cite `circularactionhub.org / mondaq.com / inderscience.com / oneplanetnetwork.org`,
not the Portuguese law (planalto is already registered). Under the moat, **registering a corroborator changes
nothing** — a signal tier is not a fact tier. So the lever split: register the genuine primaries (small), and
**floor-first re-attribution** for the rest (Step 2), not registration.

## Registered (29 hosts, guarded, read-back verified — `scripts/host-registration-sweep-2026-07-14.mjs`)
**17 deterministic primaries:** in.gov.br (T1, Brazil Diário Oficial), mainelegislature.org (T1), fsc.go.kr (T2),
ato.gov.au (T2), fws.gov (T2), irs.gov (T2), cer-rec.gc.ca (T2), darrp.noaa.gov (T2), consult.defra.gov.uk (T2),
pollution-waste.canada.ca (T2), international.canada.ca (T2), manitoba.ca (T2), doa.nc.gov (T2),
prsregister.beis.gov.uk (T2), catalog.data.gov (T2), whc.unesco.org (T3), unep.org (T3).
**12 ruled-ambiguous:** decarbonization.unido.org (T3), ers.usda.gov (T3), now-gmbh.de (T3),
international-climate-initiative.com (T3), biofin.org (T3), hydrogencouncil.com (T4), ieta.org (T4),
goldstandard.org (T4), data-basis.org (T4), bsr.org (T6), c2es.org (T6), climatecatalyst.org (T6).

## PULLED from the primary set (operator ruling)
- **law.cornell.edu** — Cornell LII is a legal-text REPUBLISHER, not the official publisher (same class as
  justia/legiscan, permanent-worklist; #318's dry-run flagged it as a fake-cert risk). Its spans are
  re-attribution instructions → re-home to the official US source (eCFR / Federal Register / state code).
- **korea.net** — Korea's promotional/culture portal, not a legal/regulatory publisher → corroborator class.
  K-taxonomy's authority is fsc.go.kr (registered).

## NOT registered — the ~95 corroborator hosts
Law firms (T6), trade news (T5), analysts (T6), aggregators/wikis (T6/T7). Register lazily by class rule
if/when a span legitimately needs their honest sub-floor tier recorded. `goldstandard.org` / `data-basis.org`
certify only their OWN standards at T4 (SC-14), nothing regulatory.

## The lesson (doctrine `registration-does-not-unlock`)
Registering a host records its honest institutional tier as provenance — it NEVER confers reg-fact eligibility.
A `fact_below_authority_floor` hold is unlocked ONLY by attribution to a floor-qualifying source that verbatim-
contains the span (floor-first re-attribution), not by registering the corroborator it was cited to. The moat
(SC-9/SC-11/SC-14) stated per-source; this is its per-registration corollary.

## Step 2 (reframed, ADOPTED) — floor-first re-attribution over the sub-floor holds
Scope: **23 quarantined reg-family items holding ≥1 FACT** (10 with null-tier facts; 111 null-tier facts total).
The re-ground re-stamps a held span to an already/newly-registered primary WHERE the span verbatim-sits in it
(SC-13 constraint set; never furniture). Not all 23 flip — an item with no floor-qualifying span for a required
slot stays held / relabels. Projection: ~$0.45/item (this run's resynth actual) → ~$10 for the 23. **Operator
writes the bound.**
