# Tier-H Spot-Check Results

- Ran at: `2026-05-06T00:47:54.804Z`
- Sample size: **20**
- Haiku model: `claude-haiku-4-5-20251001`
- Estimated Anthropic cost: **$0.0190**
- Thresholds in effect: relevance ≥ 70, freight ≥ 50

## Per-source verdicts

| # | Name | Original (rel/frt/tier) | New (rel/frt/tier) | Drift (rel/frt) | HEAD | Domain | Verdict |
|---|------|-------------------------|--------------------|-----------------|------|--------|---------|
| 1 | Western Australian Government Gazette (WA Legislation) | 75/65/T1 | —/—/? | —/— | ERR | au-gov | **unreachable** |
| 2 | California Highway Patrol (CHP) – Commercial Vehicle Section | 75/85/T2 | 75/85/T2 | 0/0 | 200 | us-gov | **confirm-H** |
| 3 | ACT Legislation Register (Parliamentary Counsel's Office) | 85/70/T1 | 85/65/T1 | 0/-5 | 200 | au-gov | **confirm-H** |
| 4 | Australian Maritime Safety Authority (AMSA) | 75/70/T2 | 75/70/T2 | 0/0 | 200 | au-gov | **confirm-H** |
| 5 | Hawaii State Energy Office (HSEO) | 85/65/T2 | 85/65/T2 | 0/0 | 200 | us-gov | **confirm-H** |
| 6 | Transport Canada | 85/75/T2 | 85/75/T2 | 0/0 | 200 | ca-canada | **confirm-H** |
| 7 | NT Legislation – Northern Territory Legislation Website | 75/65/T1 | 75/65/T1 | 0/0 | 200 | au-gov | **confirm-H** |
| 8 | Iowa DOT – Freight Planning & Maps/Data Tools | 72/85/T2 | 75/85/T2 | +3/0 | 200 | us-gov | **confirm-H** |
| 9 | Montana Legislature – Montana Code Annotated (MCA) | 85/70/T1 | 85/75/T1 | 0/+5 | 200 | us-gov | **confirm-H** |
| 10 | DPNR – Division of Environmental Protection | 85/65/T2 | 82/45/T2 | -3/-20 | 200 | us-gov | **should-be-M** |
| 11 | New York State Department of Transportation (NYSDOT) | 75/85/T2 | 75/80/T2 | 0/-5 | 200 | us-gov | **confirm-H** |
| 12 | Maryland Department of the Environment (MDE) – Air & Climate Change Program | 92/65/T2 | 85/45/T2 | -7/-20 | 200 | us-gov | **should-be-M** |
| 13 | South Carolina Department of Environmental Services (SCDES) – Bureau of Air Quality | 85/65/T2 | 85/65/T2 | 0/0 | 200 | us-gov | **confirm-H** |
| 14 | Kansas Secretary of State – Kansas Register (Official Gazette) | 85/65/T1 | 85/65/T1 | 0/0 | 200 | us-gov | **confirm-H** |
| 15 | Florida Department of Environmental Protection (FDEP) – Division of Air Resource Management | 88/65/T2 | 85/65/T2 | -3/0 | 200 | us-gov | **confirm-H** |
| 16 | Rules and Regulations of the State of Georgia (GA SOS) | 75/65/T1 | 75/65/T1 | 0/0 | 200 | us-gov | **confirm-H** |
| 17 | Michigan Legislature – Michigan Compiled Laws (MCL) & Administrative Code | 75/65/T1 | 75/65/T1 | 0/0 | 405 | us-gov | **confirm-H** |
| 18 | Georgia Department of Transportation (GDOT) – Freight Office | 75/85/T2 | 72/85/T2 | -3/0 | 200 | us-gov | **confirm-H** |
| 19 | National Heavy Vehicle Regulator (NHVR) | 75/85/T2 | 75/95/T2 | 0/+10 | 200 | au-gov | **confirm-H** |
| 20 | Virginia Department of Transportation (VDOT) | 72/75/T2 | 65/75/T2 | -7/0 | 200 | us-gov | **should-be-M** |

## Summary

- confirm-H:    **16**
- should-be-M:  **3**
- should-be-L:  **0**
- unreachable:  **1**
- **false-positive rate:** 15.00%
- median relevance drift: 0
- median freight drift:   0

## Recalibration

False-positive rate 15.0% exceeds 5% target. Recommend raising H thresholds by ~5 points (rel ≥ 75, frt ≥ 55) and re-running the spot-check.

> :warning: False-positive rate exceeds 5% target. See recalibration note above.

## Source URLs (for manual follow-up)

1. [unreachable] https://www.legislation.wa.gov.au
2. [confirm-H] https://www.chp.ca.gov/programs-services/programs/commercial-vehicle-section
   _CHP Commercial Vehicle Section enforces motor carrier safety, permits, and regulations directly affecting freight operations. Primary regulator with operational jurisdiction over commercial vehicle co_
3. [confirm-H] https://www.legislation.act.gov.au/
   _ACT legislative archive—canonical T1 primary source. Covers all ACT Acts & subordinate laws incl. transport, environment, energy. Freight impact via planning, environment, transport regulation._
4. [confirm-H] https://www.amsa.gov.au
   _AMSA is canonical maritime regulator; governs vessel safety, emissions (NOx, GHG, sulphur fuel), dangerous goods, port operations—operationally affects maritime freight & cargo transport._
5. [confirm-H] https://energy.hawaii.gov/
   _State energy office with canonical regulatory & policy mandate. Covers alternative fuels, fleet procurement, decarbonization—directly operationally relevant to freight via fuel standards, EV adoption,_
6. [confirm-H] https://tc.canada.ca/en
   _Federal transport regulator; primary jurisdiction over dangerous goods, marine, rail, aviation, road safety—all operationally impact freight. Canonical regulator._
7. [confirm-H] https://legislation.nt.gov.au/
   _Canonical NT legislative archive hosting Acts, bills, subordinate legislation. Primary regulator publication for jurisdiction. Freight relevance moderate—general legislation portal, not pure-sustainab_
8. [confirm-H] https://iowadot.gov/transportation-development/systems-planning/areas-planning/freight
   _State DOT freight planning portal with canonical regulatory authority over multimodal freight systems, corridors, and economic competitiveness planning._
9. [confirm-H] https://leg.mt.gov/bills/mca/
   _Montana legislative code archive. T1 canonical primary source hosting statutes across all domains including Title 60 (Highways/Transportation), Title 61 (Motor Vehicles), Title 69 (Public Utilities), _
10. [should-be-M] https://dpnr.vi.gov/environmental-protection/
   _USVI territorial environmental regulator with air, water, waste, and coastal mandates. Vessel registration and port-adjacent authority support freight operations indirectly._
11. [confirm-H] https://www.dot.ny.gov/divisions/operating/osss/truck/regulations
   _NYSDOT canonical truck/motor carrier safety regulator. Directly governs commercial vehicle ops, hazmat, household goods transport. Primary regulatory authority._
12. [should-be-M] https://mde.maryland.gov/programs/air/ClimateChange/Pages/index.aspx
   _State-level primary regulator with climate/emissions mandate. Direct sustainability relevance. Indirect freight impact via building decarbonization, emissions inventory, and climate policy that may af_
13. [confirm-H] https://des.sc.gov/programs/bureau-air-quality
   _Canonical state air-quality regulator with direct jurisdiction over emissions, air permits, hazardous air pollutants. Operationally affects freight via emission standards, vehicle/fleet air compliance_
14. [confirm-H] https://sos.ks.gov/publications/kansas-register.html
   _Official state gazette publishing proposed/adopted administrative regulations, session laws, and public notices. Primary regulatory publication venue for Kansas; freight-relevant regulations (air qual_
15. [confirm-H] https://floridadep.gov/air
   _State air-quality regulator with emissions monitoring & permitting authority. Operational freight impact via emissions standards, diesel rules, port air quality. Primary regulatory publisher._
16. [confirm-H] https://rules.sos.georgia.gov
   _Georgia SOS Rules & Regulations is canonical primary regulatory archive hosting all state agency rules filed under GA Administrative Procedure Act. Covers sustainability-relevant agencies; indirect fr_
17. [confirm-H] https://www.legislature.mi.gov
   _Canonical legislative archive hosting Michigan Compiled Laws, bills, and Public Acts. Primary source for state regulatory content including freight-affecting domains (energy, labor, transport, environ_
18. [confirm-H] https://www.dot.ga.gov/GDOT/pages/freight.aspx
   _State DOT freight planning & infrastructure. Operationally impacts freight movement across modes. Not emissions/sustainability-focused but canonical state transport regulator._
19. [confirm-H] https://www.nhvr.gov.au
   _Australian national heavy vehicle regulator; primary authority on truck safety, fatigue, vehicle standards, emissions-adjacent compliance. Canonical regulator for freight operations._
20. [should-be-M] https://www.vdot.virginia.gov/travel-traffic/freight/
   _State DOT with direct freight-operations authority: truck routing, weight/size enforcement, hazmat transport, toll infrastructure. Primary regulator for commercial vehicle movement._
