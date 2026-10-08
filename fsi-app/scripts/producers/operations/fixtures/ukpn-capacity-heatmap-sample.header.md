# Fixture header: UK Power Networks LTDS Capacity Heatmap (lane S8-E6)

Real data, saved unmodified, one fetch session on 2026-10-08 (13:05 to 13:07 UTC). Rule 2 (never fabricate): nothing in the two JSON files beside this header was typed, edited or trimmed by the lane.

| File | What it is | Bytes | sha256 |
|---|---|---|---|
| `ukpn-capacity-heatmap-sample.json` | The publisher's London Power Networks (LPN) heatmap release file, 128 primary substations | 150929 | 699cbb7fd00a9f44501c02e78f03e40298e35cc1d7d60b1f3a09470c5619d406 |
| `ukpn-capacity-heatmap-metadata-sample.json` | The dataset's catalogue metadata (licence, publisher, attachment list) | 27122 | e69191d8f9c68217651cc8e896e7bb8147020faf4433e34ba48b5285eaf56b11 |

## Fetch URLs and date

- Metadata: `https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-capacity-heatmap` (HTTP 200, 2026-10-08).
- Sample file: `https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-capacity-heatmap/attachments/ltds_heatmap_lpn_2026_01_json_2026_05_29_v10json` (HTTP 200, 150929 bytes, `last-modified: Fri, 29 May 2026 09:28:34 GMT`, 2026-10-08).
- The records endpoint of the same dataset (`.../records?limit=60`) answered HTTP 403 `ForbiddenAccess` to an anonymous request, twice (plain and with a browser user agent), and the metadata states `"data_visible": false`, and the description ends "To view this data please register and login." The sample is therefore the dataset's own public attachment, not a records response. The catalogue lists one attachment per licence area (LPN, EPN, SPN); only LPN was fetched.

## Licence text (quoted from the saved metadata and the saved file)

- Metadata `metas.default.license`: "CC BY 4.0"
- Metadata `metas.default.license_url`: "https://creativecommons.org/licenses/by/4.0/"
- File `rights`: "https://creativecommons.org/licenses/by/4.0/"
- Metadata `metas.default.publisher`: "UK Power Networks, Company number 3870728"
- Metadata `metas.default.update_frequency`: "ANNUAL_2" (twice a year)
- File `issued`: "2026-05-29T00:00:00Z"; `valid`: 2025-03-01 to 2026-11-30.

Attribution to carry wherever a figure from this dataset is shown: "Contains data from UK Power Networks, Long Term Development Statement Capacity Heatmap, CC BY 4.0".

## Shape facts read from the saved file (not assumed)

- Top level keys: contributor, coverage, creator, date, description, format, identifier, issued, language, publisher, rights, title, valid, Substations, Circuits.
- Each Substations entry carries mRID, name, type, area, demandFirmCapacity, demandAvailableCapacity, demandConstraint (GREEN 126, AMBER 1, RED 1), demandConstraintLimitingFactor (Thermal 126, Voltage 2), the generation equivalents, GSP, BSP and a PastConnectionActivity array. demandAvailableCapacity is a number in MW and is negative for one substation (-3.1, a RED site).
- No field in the file states a queue duration in months.
