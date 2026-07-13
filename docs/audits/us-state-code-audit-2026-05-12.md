# US-state Code Audit — 2026-05-12

Audit of `intelligence_items.jurisdictions` for US-XX codes that may have been wrongly converted from bare ISO country codes by PR #101's first (buggy) migration 072 normalizer.

## 1. Summary

- Total rows audited (across 15 collision codes, classified rows only): **49**
- Autocorrected (country unambiguous, state absent): **0**
- Surfaced for operator review (both or neither mentioned): **12**
- Left in place (state unambiguous, country absent): **37**

Mode: DRY-RUN (no UPDATEs executed)

## 2. Autocorrected

_None._

## 3. Surfaced for operator review

| id | title | source | current | evidence | recommendation |
|---|---|---|---|---|---|
| b0cf862e-a95a-41a9-8d97-ab2c03b3342b | Caltrans Sustainable Freight Planning - Content Unavailable | California Department of Transportation – Office of Sustainable Freight Planning (Caltrans OSFP) | `["US-CA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| e5c17fac-a188-41da-be29-8278da6539e7 | Los Angeles Department of Building and Safety - Green Building Servic... | LA Existing Buildings Energy & Water Efficiency (EWEO) | `["LOS ANGELES","US-CA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| a212b2ab-c394-49f7-9527-9c94a4bf700f | Port of Los Angeles Environmental Management Policy | Port of Los Angeles (Los Angeles Harbor Department) | `["LOS ANGELES COUNTY","PORT OF LOS ANGELES","US-CA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| 2943632e-cca4-412c-8e89-487b301692ce | Port of Los Angeles Environmental Management and Sustainability Frame... | Port of Los Angeles (Los Angeles Harbor Department) | `["LOS ANGELES COUNTY","PORT OF LOS ANGELES","SAN PEDRO BAY","US-CA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| 388c76de-798a-4f2c-9dd8-de1af6189085 | San Francisco Environment Department: Climate Action Plan and Sustain... | San Francisco Department of the Environment (SF Environment) | `["SAN FRANCISCO","US-CA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| 247fe3b7-e0d9-4dfe-918d-0c2b323f63fb | San Francisco Board of Supervisors - Municipal Legislative Authority | San Francisco Board of Supervisors | `["SAN_FRANCISCO","US-CA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| 14ff3453-96ae-4bf2-91d7-3bace7948e9d | City of Los Angeles Departments & Bureaus Directory | City of Los Angeles — Departments & Bureaus | `["LOS ANGELES","US","US-CA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| 77b2b073-25c4-4d4a-b69d-d51574f2529d | LADBS May 2026 Newsletter and LEA/CWS DTLA Public Notices | Los Angeles Department of Building and Safety (LADBS) | `["LOS ANGELES","US-CA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| fb86ee11-08ba-47a5-8cbd-5a8079dfc1c2 | Matrix Hudson Unit Lottery Opening - 2BR Affordable Rental at 80% AMI... | City of Boston — Environment Department | `["BOSTON","US-MA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| daaa7e3a-61fc-4c53-adba-81d9e636133f | Matrix Hudson 2BR/1BA Affordable Rental Unit - Lottery Application De... | Boston City Council | `["BOSTON","US-MA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| 6961f625-f7cb-4433-9f95-82f959016c46 | Philadelphia Office of Sustainability: Climate, Energy, and Environme... | City of Philadelphia — Office of Sustainability | `["PHILADELPHIA","US","US-PA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |
| 267419ac-b2cc-4258-ac2c-c74b35a7e7d2 | Philadelphia City Council April 2026 Legislative Updates - Multiple P... | Philadelphia City Council | `["PHILADELPHIA","US-PA"]` | (no mention of state or country in title/summary/full_brief) | Neither mentioned — operator: original raw tag unclear; verify source content |

## 4. Left in place

Total: **37** rows (state unambiguous, country absent from title/summary/full_brief).

## 5. Per-code breakdown

| US-XX | country candidate | total | autocorrect | surface | leave |
|---|---|---|---|---|---|
| US-AR | Argentina (AR) | 4 | 0 | 0 | 4 |
| US-CA | Canada (CA) | 16 | 0 | 8 | 8 |
| US-DE | Germany (DE) | 2 | 0 | 0 | 2 |
| US-ID | Indonesia (ID) | 2 | 0 | 0 | 2 |
| US-IN | India (IN) | 3 | 0 | 0 | 3 |
| US-KY | Cayman Islands (KY) | 0 | 0 | 0 | 0 |
| US-LA | Laos (LA) | 3 | 0 | 0 | 3 |
| US-MA | Morocco (MA) | 4 | 0 | 2 | 2 |
| US-MD | Moldova (MD) | 3 | 0 | 0 | 3 |
| US-ME | Montenegro (ME) | 1 | 0 | 0 | 1 |
| US-MO | Macau (MO) | 2 | 0 | 0 | 2 |
| US-MT | Malta (MT) | 2 | 0 | 0 | 2 |
| US-NE | Niger (NE) | 1 | 0 | 0 | 1 |
| US-PA | Panama (PA) | 5 | 0 | 2 | 3 |
| US-VA | Vatican (VA) | 1 | 0 | 0 | 1 |

## Related

- [jurisdiction-normalization-audit-2026-05-11](./jurisdiction-normalization-audit-2026-05-11.md) — Direct follow-on: the US-XX collision audit tests migration 072's buggy normalizer against the same jurisdictions column; this doc's US-AR row…
- [W4-backfill-plan](../plans/W4-backfill-plan.md) — The W4 ISO derivation is the normalization workstream whose US-XX outputs this audit checks for country/state collisions
