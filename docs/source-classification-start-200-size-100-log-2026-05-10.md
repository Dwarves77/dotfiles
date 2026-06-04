# Source classification backfill — batch 1

**Generated:** 2026-05-11T02:18:50.469Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 1 | 100 |
| UPDATEs issued (success) | 100 |
| Skipped — already classified | 0 |
| Skipped — read fail / other | 0 |
| Tier overrides | 0 |
| Errors | 0 |

## Tier overrides by direction

_none_

## Role distribution (this batch)

| Role | Count |
|---|---|
| primary_legal_authority | 59 |
| intergovernmental_body | 15 |
| statistical_data_agency | 10 |
| academic_research | 6 |
| trade_press | 5 |
| industry_association | 3 |
| standards_body | 2 |

## Confidence distribution (this batch)

| Confidence | Count |
|---|---|
| HIGH | 70 |
| LOW | 30 |

## Notes / schema gaps

- Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.

## Per-row log

| # | id | name | items | role | tier (existing → new) | confidence | action |
|---|---|---|---|---|---|---|---|
| 1 | `5993fd5f-ce69-4d3e-b3c1-737dd8fd5754` | Montana Department of Environmental Quality (DEQ) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 2 | `59a8c53e-177b-44b7-872f-93934f2c1dcf` | UNCTAD (UN Trade and Development) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 3 | `5a08fec4-cecd-4cb8-8b25-45e034d94980` | Newfoundland and Labrador Department of Environment and Clim | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 4 | `5a5afc4f-b319-4429-a340-554ca046c251` | Ontario Ministry of the Environment, Conservation and Parks | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 5 | `5a70d4a5-27af-4b11-9a6c-d4d193731c4e` | Aviation Week Network (Informa) | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 6 | `5a81a775-3ea6-4e5b-a468-7b5cf7dbd215` | European Commission — Directorate-General for Mobility and T | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 7 | `5a83bc99-f851-48ff-9514-b838b3a6248e` | U.S. Bureau of Labor Statistics (BLS) | 1 | statistical_data_agency | T2 → T2 keep | HIGH | UPDATED |
| 8 | `5aa6c2c0-2778-4359-b683-55cb8144efbf` | Smart Freight Centre | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 9 | `5b6638f6-2d10-4da9-99a1-47e1036a4770` | Maritime and Port Authority of Singapore (MPA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 10 | `5b676647-171e-4ba4-b468-28f7d41c2e72` | Massachusetts Department of Environmental Protection (MassDE | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 11 | `5b770846-a00b-4af2-8325-89f2b73bdb04` | Guam Environmental Protection Agency (GEPA) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 12 | `5ba23288-e27e-47ee-a2de-3b65cd9bfa97` | Measurabl — Building Benchmarking Tracker | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 13 | `5ce39da7-a55b-41bf-bc58-a3d33746213c` | Global Environment Facility (GEF) — official secretariat sit | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 14 | `5ed8596c-67f6-4f97-960f-2a1ebf4404df` | California Department of Transportation – Office of Sustaina | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 15 | `5ef07695-889c-40f8-a488-00b2f702f5b1` | Carbon Trust | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 16 | `5f12cb79-ec17-4725-8514-aa5bcf938f08` | DC Department of Energy & Environment (DOEE) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 17 | `5f2c0cad-2d0b-4d3f-95db-6b946399fa7f` | Ministério dos Transportes, Governo Federal do Brasil | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 18 | `5f395d6b-7868-422c-93d3-1107fb425dfa` | Western Australia Department of Water and Environmental Regu | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 19 | `6033c43e-82ff-4acf-b38d-5810178ebc7f` | Arkansas General Assembly | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 20 | `60898344-665a-43cf-baed-b8311c10817a` | Smart Freight Centre | 1 | academic_research | T4 → T4 keep | HIGH | UPDATED |
| 21 | `610ed5ac-ae3b-4fc6-b82f-df2988bb78e3` | New York State Department of Transportation (NYSDOT) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 22 | `61321847-144d-4560-99e6-057f433f7aef` | Louisiana State Legislature | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 23 | `61895e25-5dc2-4bf9-ab34-156fcfa61289` | Tennessee Department of Environment and Conservation (TDEC) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 24 | `61fd172f-b2b8-472e-9d92-06139889b24a` | Sénat (France) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 25 | `622d0e55-ed6c-4ec2-83a0-229425f73797` | MIT Climate Machine | 1 | academic_research | T1 → T1 keep | HIGH | UPDATED |
| 26 | `62323e04-77bd-428a-a881-f81cc6b78d7b` | Policy Research Institute for Land, Infrastructure, Transpor | 1 | primary_legal_authority | T3 → T3 keep | HIGH | UPDATED |
| 27 | `62398739-5a17-494d-ae0e-74acc7bf9cf0` | European Parliament — Legislative Train Schedule | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 28 | `62a43402-42e4-4987-a760-c3abe6f0390c` | Australian Government Federal Register of Legislation | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 29 | `62d003e3-4b19-4286-8fd8-3bda315ab460` | CER – Community of European Railway and Infrastructure Compa | 1 | industry_association | T4 → T4 keep | HIGH | UPDATED |
| 30 | `63df9b16-2a53-4fd6-81fb-09933abd9b38` | New York State Climate Action Council – Scoping Plan | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 31 | `63f3ac51-55b1-460e-bebd-bcce00413583` | U.S. Energy Information Administration (EIA) | 1 | statistical_data_agency | T3 → T3 keep | HIGH | UPDATED |
| 32 | `63f65853-8fc0-455d-b352-be0d77cc0d25` | ICAP Emissions Trading Status Report | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 33 | `64328f32-7e83-4487-83ac-1eb68efd6450` | Maryland General Assembly (mgaleg.maryland.gov) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 34 | `645a64c5-10b6-40f6-867c-acd30f22bfa0` | Illinois Environmental Protection Agency (IEPA) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 35 | `6483d4b1-7a49-4658-bcd3-cfeb18199eab` | Wisconsin Department of Transportation (WisDOT) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 36 | `64f5f70d-1443-45e4-a5fa-51756499f9ee` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 37 | `65b6e5fc-77e4-4055-97c6-39e26a7cc932` | Naturvårdsverket — Swedish Environmental Protection Agency | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 38 | `65d53daf-bcd6-4081-aa36-fe8f40be41cd` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 39 | `669899ef-7c42-4c53-a809-b19f59eed777` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 40 | `681a4d52-5934-4d3f-9994-871dd46a52cb` | International Energy Agency (IEA) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 41 | `687a082b-65eb-4b9a-9e0d-e3bccda8f64b` | ECLAC / CEPAL – United Nations | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 42 | `68cbe865-33fb-4d56-b79f-4a39393bed22` | International Civil Aviation Organization (ICAO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 43 | `68fe7082-3b95-4a5a-a9d8-5d5ac3529524` | Maritime Carbon Intelligence | 1 | trade_press | T5 → T5 keep | LOW | UPDATED |
| 44 | `6901afb7-faaf-4156-9492-9907a09c5daf` | US EIA Petroleum Spot Prices | 1 | statistical_data_agency | T1 → T1 keep | HIGH | UPDATED |
| 45 | `6a4fbc59-5412-4541-a9a3-eeb155b15cc6` | ESG Today | 1 | trade_press | T4 → T4 keep | HIGH | UPDATED |
| 46 | `6a72c694-7910-49da-bdb6-ab528807a512` | World Bank Group | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 47 | `6abf5dce-b873-47ad-a834-115ddd65e210` | Oregon Legislature – Oregon Revised Statutes (ORS) & Legisla | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 48 | `6ac220a6-d1fb-4439-8212-c0f2349e2993` | City of Sydney | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 49 | `6c0c9c13-db64-4f55-bfbc-18380209a430` | Global Reporting Initiative (GRI) | 1 | standards_body | T4 → T4 keep | HIGH | UPDATED |
| 50 | `6c2490a4-15d1-4d17-addc-d67d14c409c9` | Nevada Legislature – Nevada Revised Statutes (NRS) & Legisla | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 51 | `6c906a79-826c-43e9-80b0-9b846cd4a1d9` | Ministerstvo životního prostředí (MZP) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 52 | `6ca8a468-1368-4779-b315-220a95ae2cb2` | OECD iLibrary | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 53 | `6d184dc2-fc25-403f-b14d-32f48637aac8` | Carbon Trust | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 54 | `6d2537ca-21b4-442d-8750-447c9ee76d7c` | Connecticut Department of Energy and Environmental Protectio | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 55 | `6e234940-3d99-40cc-ac5d-d83058266c09` | Parliament of Victoria | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 56 | `6f117b90-a73b-4dcb-83c5-7b3f41d9982f` | International Transport Forum | 1 | intergovernmental_body | T4 → T4 keep | HIGH | UPDATED |
| 57 | `6f698bf0-8e67-4432-83d1-83f9daff7283` | EcoVadis | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 58 | `6faa1d15-e7b5-44bf-95b7-df9334cdb7c9` | BizClik Media (Supply Chain Digital) | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 59 | `6fad3393-3a75-434d-b354-a09659fe091b` | Los Angeles Department of Building and Safety (LADBS) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 60 | `7053e1f6-20bf-4150-9b24-900c10fac9bf` | FIATA Sustainability | 1 | industry_association | T5 → T5 keep | HIGH | UPDATED |
| 61 | `70aea436-0087-49f2-a6c4-0b273eb1972c` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 62 | `71ce6ddf-6a34-4560-8cc7-ec41530f735c` | World Bank Group | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 63 | `71f5003a-57f3-431a-a3a7-1d5b67dad2ac` | NSW Environment Protection Authority (EPA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 64 | `729062fd-d113-4e64-a731-0b0db8469386` | Transport Canada | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 65 | `72a1868d-3567-4d2e-97bf-3f6a83b45eaf` | International Maritime Organization (IMO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 66 | `72afffc1-86ef-49c5-858d-3f61977c8056` | Bundesministerium für Digitales und Verkehr (BMDV) / German  | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 67 | `734a5f60-d826-44da-b49f-4119da637a16` | IFRS / ISSB Sustainability Standards | 1 | standards_body | T5 → T5 keep | HIGH | UPDATED |
| 68 | `7353dea0-a2e7-4b3e-be3f-202e981eed4f` | Houston City Council | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 69 | `74d46ece-5db5-4ae6-8796-56529ab79b11` | U.S. Bureau of Labor Statistics (BLS) | 1 | statistical_data_agency | T3 → T3 keep | HIGH | UPDATED |
| 70 | `75281c05-63e9-4a29-9baf-65c198f99249` | Iowa Department of Natural Resources (Iowa DNR) – Air Qualit | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 71 | `7572537b-d94b-40d5-bb43-466e3e6346be` | Dubai Electricity & Water Authority (DEWA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 72 | `7663d425-295a-46ce-abc4-c47f6fa8d683` | Région Île-de-France | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 73 | `777c7a9c-8e46-4791-af04-aa8d4aaf92b5` | EUR-Lex / European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 74 | `77bbe384-1a98-4836-99e9-34ca3fab972c` | International Renewable Energy Agency (IRENA) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 75 | `77d85d87-5d4d-40f1-a0ed-9d2745f69b68` | Northwest Territories Legislative Assembly | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 76 | `77d910f4-d638-4b43-970e-f47b3fa74181` | International Energy Agency (IEA) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 77 | `77dd0e92-9da8-4589-8327-aba15293569e` | Washington Utilities and Transportation Commission (UTC) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 78 | `790b6557-0cd2-48ea-8635-22d42fa3b023` | UNFCCC | 1 | industry_association | T3 → T3 keep | HIGH | UPDATED |
| 79 | `7a608c06-2205-4b24-b791-77bd33b56da0` | National Assembly of the Republic of Korea (대한민국 국회) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 80 | `7addb61a-16a5-4a37-ad3c-78f990b2f561` | International Energy Agency (IEA) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 81 | `7b0bb91d-d80d-46fe-8312-a8b7f21548dc` | IEA Data and Statistics Hub | 1 | intergovernmental_body | T1 → T1 keep | HIGH | UPDATED |
| 82 | `7b726d85-2d19-4cab-a6d2-04fe3c704ec1` | California Office of Administrative Law (OAL) – California R | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 83 | `7c077e07-5be4-4af2-b3b3-e212084a4f4c` | Vlaamse Milieumaatschappij (VMM) — Flanders Environment Agen | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 84 | `7cc36395-3e20-47d9-b23c-5cb64dc13663` | Hrvatski sabor – Croatian Parliament | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 85 | `7d18d831-429b-450a-a209-22446a8d886f` | City of Toronto — City Council | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 86 | `7d939fc1-0356-4ed0-8026-c39df58db71f` | Climate Change Laws of the World | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 87 | `7da47f8c-e7ce-4b6c-8ec5-1c20b3b8366c` | Missouri Department of Natural Resources – Division of Envir | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 88 | `7dd79f52-390e-4c47-bbb5-c8bce1a4f5a1` | Renewables, Climate and Future Industries Tasmania (ReCFIT) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 89 | `7f213384-e730-451b-85d7-e794baa62be4` | Gobierno de México (gob.mx) — SEMARNAT | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 90 | `7f8d6310-97cc-4c6a-ab93-ac984e9d737c` | NYC Office of Administrative Trials and Hearings / NYC Rules | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 91 | `7fb0e8dc-1f87-46e0-8748-269ba548f669` | ECLAC / CEPAL – United Nations | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |
| 92 | `807a3ad8-7665-47b3-b0e4-3702ef3a8b33` | Publications Office of the European Union / EUR-Lex | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 93 | `80a70899-559b-4f6d-8c70-5e243800ecbe` | UK Department for Transport (GOV.UK) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 94 | `80bf696d-d8a2-46fd-a0ba-4b5242626b88` | South Coast Air Quality Management District (SCAQMD) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 95 | `817a4c48-5257-4eff-8e80-8413dbffd4dc` | Ville de Paris (Mairie de Paris) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 96 | `81d5ee4d-7604-4e8e-8b22-d8e3b62c4406` | ENERGY STAR Portfolio Manager | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 97 | `81df8e97-9b84-45c3-94a5-5e9e5838c10a` | Ministère de la Transition écologique et de la Cohésion des  | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 98 | `81f10615-1e7e-4646-9fd4-e576a38fd232` | InsideEVs | 1 | trade_press | T5 → T5 keep | LOW | UPDATED |
| 99 | `82a5c70e-cf83-498c-83d2-924e06ba9c81` | Ministerio de Transporte de Colombia | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 100 | `8330f9b4-29ae-414b-a010-7b9a564d586a` | Legislative Council of the Hong Kong SAR (LegCo) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |

---

HOLD — batch 2 awaits operator approval
