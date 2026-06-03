# Portal-Shell Source Triage — 2026-06-03

**Question answered:** of the 19 off-domain "portal shell" intelligence_items, which underlying SOURCES are legitimate freight-env monitoring targets (KEEP, re-point at instruments) vs not (REMOVE, suspend source)?
**Method:** 13-agent research workflow (`wf_594b04f3-0ae`), WebSearch-grounded, existence+citation only, no interpretation. Full agent output: `tasks/woqg9dz91.output`.
**Test applied (per operator):** "is the source an entity that issues or codifies freight-relevant regulation" — regulator/ministry/legislature → KEEP; directory/council-governance/residential-services/error-page → REMOVE.

## Partition

- **REMOVE = 6** (non-regulators): archive item + **suspend source**. See `offdomain-remove-op.mjs`.
  `24cf9264` Montreal nav-error (`error_page`*), `cd238eda` Toronto Council, `445a06b2` Houston directory, `ec086e7d` Chicago Public Health, `14ff3453` LA Bureaus directory, `653f174b` Toronto Water (residential) — last five `off_domain`*.
- **KEEP = 13** (regulators/repositories): archive shell item as `portal_artifact`*, **preserve source**, re-point at confirmed instruments below, flag for content generation when Browserless restored.
  \* archive_reason values pending operator confirm (corpus already uses `error_page_artifact`; `off_domain`/`portal_artifact` are net-new).

## KEEP catalog — 13 sources → confirmed instruments (re-point targets)

All verdict KEEP, confidence high. Only `confirmed=true` instruments listed; see output file for `confirmed=false` candidates + full Browserless gap lists.

| id | source | class | confirmed instruments (canonical) |
|---|---|---|---|
| `2cb40f97` | WA DWER | regulator | EP Act 1986; EP Regs 1987 — legislation.wa.gov.au |
| `6918e77f` | Tennessee TDEC | regulator | APC rules 0400-30; 1200-03; Title V program — tnsosfiles.com / tn.gov |
| `344a58cd` | Newfoundland ECCM | regulator | EP Act E-14.2; Air Pollution Control Regs 2022 (NLR 11/22); GHG Regs (NLR 116/18) — assembly.nl.ca |
| `22d0883e` | MLIT Japan | regulator | Carbon Neutral Port cert; Marine Pollution Act 136/1970 — mlit.go.jp / japaneselawtranslation |
| `dff7017e` | Massachusetts Gen Laws | repository | M.G.L. Ch 90, 21N, 25A, 111 — malegislature.gov |
| `290933b8` | Ley Chile (BCN) | repository | Ley 19.300; Ley 20.417; DL 2222 Navegación — bcn.cl idNorma |
| `7b159d86` | Oregon ORS | repository | ORS Ch 468A; 468A.266 Clean Fuels; 468A.280 reporting; OAR 340-253 — oregonlegislature.gov / sos |
| `281644c5` | Korea KLRI | repository | Marine Env Mgmt Act; Clean Air Conservation Act + Decree; Maritime Safety Act; EIA Act — elaw.klri.re.kr |
| `b8fb3eba` | Manitoba | repository | Climate & Green Plan C134; Environment Act E125; Biofuels B40; Fuel Tax F192 — web2.gov.mb.ca |
| `dbcf1b7a` | Saskatchewan Env | regulator | EMPA 2010 (E-10.22); GHG Act M-2.01 + Standards/Compliance Regs; Env Code Adoption Regs — canlii.org |
| `cac4ab4c` | Utah Air Quality | regulator | UAC R307 index; R307-401 New/Modified Sources; R307-101 — rules.utah.gov |
| `edad4e2c` | Wisconsin DNR Air | regulator | WAC NR 485 (motor vehicles/mobile sources); Clean Diesel Grant — legis.wisconsin.gov / dnr |
| `1add1175` | Alberta AEPA | regulator | Renewable Fuels Standard Reg 29/2010; TIER Reg 133/2019; EPEA E-12 — open.alberta.ca |

## Next steps (Browserless-gated unless noted)
1. **(no Browserless)** Execute REMOVE op (6) + archive the 13 shells as `portal_artifact` — pending operator archive_reason confirm.
2. **(Browserless)** For each KEEP source: crawl confirmed instruments, resolve the per-source `confirmed=false` gaps, generate briefs. Re-point source from index shell → canonical instrument(s).
3. Cross-cutting gaps to resolve on crawl: marine instruments often federal (NL, Manitoba landlocked); section-anchor deep URLs (Oregon, Mass); in-force version/amendment confirmation (Korea hseq, Chile idNorma).
