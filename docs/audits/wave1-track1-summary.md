> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Wave 1a Track 1 (Gate 4) Discovery Summary

Generated 2026-05-10T02:16:27.081Z

Source JSONL: `C:\Users\jason\dotfiles\docs\wave1-api-discovery-2026-05-09.jsonl`

## Aggregate counts

| Metric | Value |
|---|---|
| Total probed | 695 |
| Allowlist hits (skipped probe) | 80 |
| Manual review required | 4 |
| Aborted (timeout/429) | 1 |
| Probe errors (per-source try/catch) | 0 |
| Divergences flagged (existing rss_feed_url vs detected) | 1 |
| Switching from scrape to structured | 221 |
| Parse errors in JSONL | 0 |

## Recommendations breakdown

| Method | Count |
|---|---|
| html_scrape | 330 |
| rss | 188 |
| sitemap | 140 |
| api_rest | 20 |
| api_soap | 15 |
| atom | 2 |

## Confidence distribution

| Level | Count |
|---|---|
| high | 158 |
| medium | 99 |
| low | 438 |

## Source distribution by current access_method

| Existing method | Count |
|---|---|
| scrape | 691 |
| api | 4 |

## Browserless cycle recalibration (Lean tier)

After applying the discovered routing, 470 sources (67.6%) remain on Browserless. Estimating 6 minutes per scrape source on Lean tier (T1 daily / T2 weekly / T3 monthly):

- Sources per hour (single worker): ~10
- Daily render budget if every scrape source runs once daily: 2820 min (47.0 hours)

If this exceeds the Lean tier's allotment, T2 sources move to weekly cadence and T3 to monthly.

## Manual-review-required items (4)

These were flagged by the probe for human review (e.g., JSON detected at /api but endpoint shape unknown, or existing rss_feed_url diverges from detected).

- **Western Australian Government Gazette (WA Legislation)** (`https://www.legislation.wa.gov.au`), recommend `api_rest`. JSON detected at /api. Manual review for endpoint shape.
- **FreightWaves** (`https://www.freightwaves.com/`), recommend `rss`. DIVERGENCE: existing rss_feed_url=https://www.freightwaves.com/news/feed vs detected=https://www.freightwaves.com/rss.
- **Kansas Legislature** (`https://www.kslegislature.org/`), recommend `api_rest`. JSON detected at /api/v1. Manual review for endpoint shape.
- **House of Representatives of Japan (Shugiin / 衆議院)** (`https://www.shugiin.go.jp/`), recommend `api_rest`. JSON detected at /api. Manual review for endpoint shape.

## Low-confidence items (438)

These were probed but fell into the low-confidence bucket. Per dispatch, low-confidence items are NOT auto-applied by the writer script (they keep their existing access_method); they remain in the registry as scrape and surface here for operator tuning via Claude in Chrome.

First 30 surfaced for review:

- **Ministry of Ecology and Environment (MEE), People's Republic of China**, https://english.mee.gov.cn/international_cooperation/CCICED/. 
- **Hrvatski sabor – Croatian Parliament**, https://www.sabor.hr/. 
- **Seimas of the Republic of Lithuania**, https://www.lrs.lt/. 
- **Országgyűlés – National Assembly of Hungary**, https://www.parlament.hu/. 
- **Saeima of the Republic of Latvia**, https://www.saeima.lv/. 
- **Ministry of Environment and Water (MOEW)**, https://www.moew.government.bg/. 
- **Ministarstvo gospodarstva i održivog razvoja (Ministry of Economy and Sustainable Development)**, https://mingor.gov.hr/. 
- **Aplinkos apsaugos agentūra (AAA – Environmental Protection Agency)**, https://aaa.lrv.lt/. 
- **ECLAC / CEPAL – United Nations**, https://www.cepal.org/en. 
- **Ministrstvo za okolje, podnebje in energijo (MOPE)**, https://www.gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje-podnebje-in-energijo/. 
- **New York State Department of Transportation (NYSDOT)**, https://www.dot.ny.gov/divisions/operating/osss/truck/regulations. 
- **Državni zbor Republike Slovenije**, https://www.dz-rs.si/. 
- **Camera Deputaților – Chamber of Deputies of Romania**, https://www.cdep.ro/. 
- **Vides aizsardzības un reģionālās attīstības ministrija (VARAM)**, https://www.varam.gov.lv/. 
- **Ministère de la Transition écologique et de la Cohésion des territoires (MITECO)**, https://www.ecologie.gouv.fr/. 
- **Brussels Environment / Leefmilieu Brussel (Bruxelles Environnement)**, https://environnement.brussels/. 
- **ECLAC / CEPAL – United Nations**, https://www.cepal.org/en/about. 
- **Singapore Statutes Online**, https://sso.agc.gov.sg. 
- **Sénat (France)**, https://www.senat.fr/. 
- **Rijksinstituut voor Volksgezondheid en Milieu (RIVM)**, https://www.rivm.nl/. 
- **SPF Santé publique, Sécurité de la chaîne alimentaire et Environnement (FPS Health)**, https://www.health.belgium.be/. 
- **Assemblée nationale**, https://www.assemblee-nationale.fr/. 
- **La Chambre des représentants de Belgique / Belgische Kamer van volksvertegenwoordigers**, https://www.lachambre.be/. 
- **Umweltbundesamt (UBA) — German Environment Agency**, https://www.umweltbundesamt.de/. 
- **New York State Climate Action Council – Scoping Plan**, https://climate.ny.gov. 
- **Vlaamse Milieumaatschappij (VMM) — Flanders Environment Agency**, https://www.vmm.be/. 
- **Naturvårdsverket — Swedish Environmental Protection Agency**, https://www.naturvardsverket.se/. 
- **Ministère de l'Environnement, du Climat et de la Biodiversité (MECDD) — Luxembourg**, https://environnement.public.lu/. 
- **Umweltbundesamt — Austrian Environment Agency**, https://www.umweltbundesamt.at/. 
- **North Carolina Department of Environmental Quality (NC DEQ) – Division of Air Quality**, https://www.deq.nc.gov/about/divisions/air-quality. 
- ... and 408 more.

## Divergences (1)

Existing rss_feed_url does not match the URL we detected on the home page.

- **FreightWaves**: existing=`https://www.freightwaves.com/news/feed`, detected=`https://www.freightwaves.com/rss`

## Related

- [wave1-step1-verification](./wave1-step1-verification.md) — Sibling Wave 1a gate deliverable (Track 1 / Gate 4 discovery) in the same gated dispatch sequence
- [W2B-discovery-agent-spec](../plans/W2B-discovery-agent-spec.md) — This access-method probing (JSON-at-/api detection, rss/sitemap discovery) is the discovery-agent capability that spec defines
- [W5-cost-projection](../plans/W5-cost-projection.md) — The Browserless cycle recalibration (470 scrape sources, render-hour budget, Lean-tier cadence tiers) is direct input to that cost projection
- [wave1-track5-widget-implementation-plan](../plans/wave1-track5-widget-implementation-plan.md) — Plan is explicitly staged to implement after the Wave 1a foundation (migrations 052-059) this summary covers
