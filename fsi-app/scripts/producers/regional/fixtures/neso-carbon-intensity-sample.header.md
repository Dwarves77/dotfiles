# neso-carbon-intensity-sample.json: provenance header

This is real data, saved unmodified from one HTTP response (lane S8-E5, the one network fetch the brief permits).

- Fetch URL: https://api.carbonintensity.org.uk/intensity/stats/2026-09-24T00:00Z/2026-10-07T23:59Z/24
- Fetch date: 2026-10-08 (response Date header 13:10:15 GMT), HTTP 200, no API key, no authentication header sent
- Publisher: National Energy System Operator (NESO), Carbon Intensity API (https://carbonintensity.org.uk/)
- Size: 2690 bytes, 14 daily blocks (2026-09-24 to 2026-10-07), each {from, to, intensity:{max, average, min, index}}
- Licence text, as recorded by the PROD-SRC fact lane on 2026-10-08 (register section 1.5, row D): the API page states
  "CC BY 4.0", with an "API Terms of Use" pointer on the project's GitHub. This lane did not re-read the licence
  page; it saved only the API response, which carries no licence field and no unit field.
- The unit gCO2/kWh is not in the response; it is the unit the repo's spec 04 section 7 names for this dataset family.
- The response does not say whether `average` is over forecast or actual half-hour values.
- NESO About page (cited by host-verdicts-001.json for the publicly-owned claim): https://www.neso.energy/about. Not fetched by lane S8-E5; the ownership claim (publicly owned since 2024-10-01) is the coordinator ruling of 2026-10-08.
- Used by: scripts/producers/regional/neso-carbon-intensity-producer.test.mjs (parser, mapper, dry run).
