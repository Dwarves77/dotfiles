# Source classification backfill — batch 5

**Generated:** 2026-05-11T14:10:42.555Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 5 | 100 |
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
| primary_legal_authority | 66 |
| statistical_data_agency | 9 |
| intergovernmental_body | 6 |
| trade_press | 6 |
| standards_body | 4 |
| academic_research | 4 |
| industry_association | 3 |
| industry_data_provider | 2 |

## Confidence distribution (this batch)

| Confidence | Count |
|---|---|
| HIGH | 72 |
| LOW | 28 |

## Notes / schema gaps

- Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.

## Per-row log

| # | id | name | items | role | tier (existing → new) | confidence | action |
|---|---|---|---|---|---|---|---|
| 1 | `b434ddee-7755-4071-b729-70088256af06` | Ville de Montréal — Environnement | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 2 | `b440f113-5be4-4fa5-aa65-80782ff8469f` | Ministarstvo gospodarstva i održivog razvoja (Ministry of Ec | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 3 | `b476ff63-cae4-43bd-b39c-9b5e45a14677` | Louisiana DOTD – State Freight Plan | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 4 | `b4b04ad0-7884-4722-9bc5-19137708254c` | General Office of the Standing Committee of the National Peo | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 5 | `b58bd743-1f9e-41b4-970d-888a9712c148` | U.S. Environmental Protection Agency (EPA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 6 | `b5e7624e-7c17-485f-8731-25b67e3127d7` | Queensland Parliament | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 7 | `b5f85b79-82e0-4f2d-9665-51f1d4d146ca` | Louisiana Department of Environmental Quality (LDEQ) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 8 | `b6b32cb2-0575-4fd7-ba88-3ee7409f4ef1` | Legislative Assembly of Ontario | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 9 | `b737a500-8b9c-4928-84fb-b1028bd37852` | Northwest Territories Department of Environment and Climate  | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 10 | `b8917aa2-062c-497c-9fcc-20cb51156bb4` | Victorian Department of Energy, Environment and Climate Acti | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 11 | `b8c5905c-4461-46df-aad4-e73b7e98799f` | National Assembly of the Republic of Bulgaria | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 12 | `b92386d4-9e79-4854-9a0f-8f9c7c79de13` | Legislative Assembly of Prince Edward Island | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 13 | `b926dd11-6242-4b2f-ba34-cfdb789e7402` | Iowa Utilities Commission (IUC) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 14 | `b98250ab-296c-4967-be19-ac27e83d1fb9` | Oregon Department of Environmental Quality (DEQ) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 15 | `b9d38292-21af-42a6-a956-3918f700dcae` | CER – Community of European Railway and Infrastructure Compa | 1 | industry_association | T4 → T4 keep | HIGH | UPDATED |
| 16 | `ba680206-2b54-4d08-8d98-909da2b3c643` | City of Toronto — Environment & Climate | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 17 | `bb2dbe84-d48d-4883-a586-b8bd724d3719` | Hydrogen Insight | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 18 | `bb38c4f7-2b4a-421a-91cf-d1185902e9c2` | Ministry of Environment and Water (MOEW) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 19 | `bb5aebde-d5ea-44d0-a6e2-7587a872c4aa` | LA Existing Buildings Energy & Water Efficiency (EWEO) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 20 | `bb8954b0-c4fa-4387-9cff-3e5c4c0f8768` | CDP Supply Chain | 1 | industry_data_provider | T5 → T5 keep | HIGH | UPDATED |
| 21 | `bd3beeb4-e60f-43dc-b6b9-9e4f4778d7fd` | Federal Register / Office of the Federal Register (U.S. Gove | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 22 | `be1164eb-5467-4da4-a5d2-17432f88e9cb` | Delaware Department of Natural Resources and Environmental C | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 23 | `be45c914-8ca6-4fe7-bd08-2b121fe4006d` | Colorado Department of Transportation – GHG Transportation P | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 24 | `be57a794-e82a-4c91-b182-6a1ad1cccab2` | Texas Commission on Environmental Quality (TCEQ) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 25 | `be70947c-503b-497b-a16f-a143372cd69c` | New Jersey Department of Transportation (NJDOT) – Freight Pl | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 26 | `bec1a090-c849-4e78-b463-f7f34e64afb6` | International Council on Clean Transportation (ICCT) | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 27 | `bec796bd-772f-4aba-8c24-0aaffc82f821` | Port of Los Angeles (Los Angeles Harbor Department) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 28 | `bedb8f15-e9d2-4877-8902-ae5152b055fd` | Arizona State Legislature | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 29 | `beecae98-5bdb-4513-8215-eaa3ce8bf0d1` | U.S. Green Building Council (USGBC) | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 30 | `bf536e46-bef8-43fd-922e-bb46606024ed` | Global Reporting Initiative (GRI) | 1 | standards_body | T4 → T4 keep | HIGH | UPDATED |
| 31 | `bf5603b3-18b2-422e-9f8e-02e39a2de45a` | World Economic Forum | 1 | industry_association | T3 → T3 keep | HIGH | UPDATED |
| 32 | `bf630add-6c5a-4c0b-9984-2f66fc8efc6b` | DNV Maritime Regulatory Updates | 1 | standards_body | T4 → T4 keep | HIGH | UPDATED |
| 33 | `bf68898e-fee2-4469-978e-2a96c363ba69` | NYC Department of Buildings / Office of the City Clerk | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 34 | `bf9399db-8f66-4c78-8c5e-5998bf9c0245` | Ministério do Meio Ambiente e Mudança do Clima – gov.br | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 35 | `c048ce5e-bbf4-4e74-a03c-575283bcfba3` | EUR-Lex (Official Journal of the European Union) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 36 | `c1bf569d-dce7-4fe8-af09-741e246a087a` | UK Department for Transport via assets.publishing.service.go | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 37 | `c20241c2-a712-440a-8e59-be582186517e` | Australian Maritime Safety Authority (AMSA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 38 | `c2267c50-0bdb-4717-8145-6606c11d77ea` | Metropolitan Government of Nashville and Davidson County – D | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 39 | `c30febdb-2981-47f3-b65c-0907c0091b04` | International Labour Organization (ILO) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 40 | `c3cd15a9-93f4-4c13-9041-dc229ef7548c` | UK Department for Transport / GOV.UK | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 41 | `c3ff2016-c77e-4de1-ba4d-0b5d0fa84928` | Ministerio de Transporte de Colombia | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 42 | `c49414da-7c9e-45cc-a629-f138166ecda5` | Maritime and Port Authority of Singapore (MPA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 43 | `c5177c00-fc69-4823-a9bb-c15c03fc6935` | Minnesota Legislature | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 44 | `c610702c-4ced-4c2d-8316-153edd9e8a76` | Washington State Register (WSR) / Washington Administrative  | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 45 | `c6398492-92c4-41cb-bacf-0d552da9b48b` | Ministero dell'Ambiente e della Sicurezza Energetica (MASE) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 46 | `c7ac74e3-4660-479b-bc10-87bc1e838f9c` | Ministry of Oceans and Fisheries, Republic of Korea | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 47 | `c7cee2e1-1d6c-4e7f-95d0-944de3e4a1d7` | The Aspen Institute | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 48 | `c7f45d80-638d-475b-b8bb-f4c7c32644f9` | Intergovernmental Panel on Climate Change (IPCC) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 49 | `c81301f7-b043-474c-8eac-d02ff3b90542` | Oklahoma Department of Environmental Quality (ODEQ) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 50 | `c8b07d63-f48f-4d1e-984c-ad9df229966b` | Albuquerque-Bernalillo County Air Quality Control Board (AQC | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 51 | `c8b87abd-146d-4e79-8c91-d14ad8943681` | Alabama State Legislature | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 52 | `ca5b4543-e6cd-446c-b41a-ed9a1205b4fb` | U.S. Environmental Protection Agency (EPA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 53 | `cb816051-80d0-463b-95b2-551cf70c1c91` | European Commission – DG Energy | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 54 | `cd0ab56f-371e-4ae8-a8ea-27e27f007d4f` | Diario Oficial de la Federación (DOF) — Gobierno de México | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 55 | `cd7ed847-c50f-44a5-b946-a66e29692a8d` | Blue Visby Consortium (co-ordinated by NAPA Oy & Stephenson  | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 56 | `cd8da726-1422-4d22-8f7c-4038cef55e18` | U.S. Energy Information Administration (EIA) | 1 | statistical_data_agency | T3 → T3 keep | HIGH | UPDATED |
| 57 | `cda55872-b68c-4903-b4bd-9883acc41817` | European Union Aviation Safety Agency (EASA) | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 58 | `ce9bbe0c-557b-4c93-92f2-1f0711a529ee` | Alberta Environment and Protected Areas | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 59 | `ce9e6672-1cff-402c-8316-31cab6a0d48f` | United Nations Department of Economic and Social Affairs (UN | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 60 | `cf7ab33d-f61e-4cc2-824f-29d9088924ac` | Connecticut General Assembly (cga.ct.gov) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 61 | `cf93f9e4-5bf8-40a2-8a6f-e878acc2dd7c` | Kansas Secretary of State – Kansas Register (Official Gazett | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 62 | `d223ee3b-b3d3-46af-b213-0a9533a7533e` | NREL PVWatts Calculator | 1 | academic_research | T1 → T1 keep | HIGH | UPDATED |
| 63 | `d2d7bd93-ba75-4d69-b92f-09912c78e9a4` | US EIA Open Data API | 1 | statistical_data_agency | T1 → T1 keep | HIGH | UPDATED |
| 64 | `d363dcbd-de9b-4481-9178-d5820e6d574c` | UNCTAD (UN Trade and Development) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 65 | `d3e7c0b9-7550-4805-84cb-6aad42ef3275` | Seatrade Maritime News | 1 | trade_press | T4 → T4 keep | HIGH | UPDATED |
| 66 | `d4107279-8725-4499-8040-436b6a0c0040` | Parliament of Australia | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 67 | `d55e91db-dc9b-42a9-9854-ddd4f1d670ee` | FreightWaves | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 68 | `d561c0b8-9679-42cd-93fa-923b7cb32945` | Canada Gazette | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 69 | `d5aadce8-c12b-44e5-93ed-91995f271737` | Thomson Reuters Regulatory Intelligence | 1 | industry_data_provider | T6 → T6 keep | LOW | UPDATED |
| 70 | `d5f9920c-d07a-46a1-9fc9-d563832b86df` | Tokyo Metropolitan Government Bureau of Environment (東京都環境局) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 71 | `d6e87364-309a-4f1b-90e9-93223133f29a` | Smart Freight Centre / GLEC Framework | 1 | academic_research | T5 → T5 keep | HIGH | UPDATED |
| 72 | `d78a96bb-3f85-4ef5-aaf2-6ffe1481e108` | Maritime and Port Authority of Singapore (MPA) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 73 | `d7c1a71b-8de0-498a-8da6-e87f044409e0` | legislation.gov.uk (His Majesty's Stationery Office) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 74 | `d821599d-9aad-4eba-8940-47685a1644cb` | World Bank — Financial Intermediary Funds Trustee | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 75 | `d8859b1a-a9d9-410a-b7cb-039dde1581b7` | Agência Portuguesa do Ambiente (APA) | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 76 | `d888d3a0-4fac-406e-9997-3e888c450354` | McKinsey Sustainability | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 77 | `d8ca8c47-29d2-474a-8548-038651717d15` | European Environment Agency | 1 | primary_legal_authority | T4 → T4 keep | HIGH | UPDATED |
| 78 | `d9424b30-ca5a-4e6e-bb52-6b2a319c9402` | Philadelphia City Council | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 79 | `d96111d4-b9e7-432a-a9b4-ee79fc4dee1d` | GreenBiz (Trellis Group) | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 80 | `d97bb365-a359-4500-aeff-5e2aea8904d8` | ISO 14083 | 1 | standards_body | T5 → T5 keep | HIGH | UPDATED |
| 81 | `d9bf4347-ea64-4ee6-accf-cef66f0e2cd4` | GHG Protocol | 1 | trade_press | T5 → T5 keep | LOW | UPDATED |
| 82 | `d9e0948e-71c7-4234-9ab4-28302141826f` | Federal Register / U.S. Department of Transportation | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 83 | `d9f534eb-84aa-4a61-9a9c-3badb922f68c` | ABS Sustainability | 1 | standards_body | T4 → T4 keep | HIGH | UPDATED |
| 84 | `da251500-ec68-4df5-adab-0f654f4876f2` | Ministerio de Transporte de Colombia | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 85 | `da604866-450e-47c0-9d2b-04d606bc6267` | MIT Center for Transportation and Logistics | 1 | academic_research | T2 → T2 keep | HIGH | UPDATED |
| 86 | `daa0bb17-5688-47d3-a404-e4c7d569113a` | Metropolitan Government of Nashville and Davidson County – O | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 87 | `dae165c8-a279-4612-a579-08119cb73031` | National Database of Laws and Regulations (China) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 88 | `dbfb56f7-f38b-4d67-ac3d-15d5a5cb0149` | Norwegian Maritime Authority (Sjøfartsdirektoratet / NMA) | 1 | primary_legal_authority | T2 → T2 keep | LOW | UPDATED |
| 89 | `dcaf69fa-d9fd-4bd8-b462-041e1d4dc386` | U.S. Green Building Council (USGBC) | 1 | statistical_data_agency | T4 → T4 keep | LOW | UPDATED |
| 90 | `dd4d41e2-100a-46dc-9273-8d2c95be347a` | UK Government (GOV.UK) — Department for Energy Security and  | 1 | primary_legal_authority | T2 → T2 keep | HIGH | UPDATED |
| 91 | `dd7b482b-bae8-4620-a6ac-6fa9846b1eb5` | Joint Office of Energy and Transportation (U.S. DOE / U.S. D | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 92 | `dda43af7-f921-4f21-9b42-b1f1add1c4b0` | Global Maritime Forum (manager of the Getting to Zero Coalit | 1 | industry_association | T4 → T4 keep | HIGH | UPDATED |
| 93 | `de15227a-ce56-49f5-8ebb-8758c5794d67` | FreightWaves | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 94 | `de36ea2b-fa9e-4406-8158-3a3c8dde6860` | EUR-Lex / Official Journal of the European Union | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 95 | `e0e3b24b-f709-4e97-ab8e-03c6f8a72891` | Journal of Commerce (S&P Global) | 1 | trade_press | T5 → T5 keep | HIGH | UPDATED |
| 96 | `e0e9d808-bc39-4317-8107-883943d86a71` | Montana Legislature – Montana Code Annotated (MCA) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 97 | `e0ec620e-8ca3-4bdf-b91c-05523e9de047` | San Francisco Board of Supervisors | 1 | primary_legal_authority | T1 → T1 keep | LOW | UPDATED |
| 98 | `e13722ed-be7f-4e56-a264-ec08a747f4cb` | Alaska Department of Environmental Conservation (DEC) | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 99 | `e158c5ec-29ab-4b13-9eca-94718029ec6c` | United Nations Department of Economic and Social Affairs (UN | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |
| 100 | `e3a3818a-7e8b-4aad-8bbb-b7668f0fbc17` | Asian Development Bank (ADB) | 1 | academic_research | T3 → T3 keep | LOW | UPDATED |

---

HOLD — batch 6 awaits operator approval
