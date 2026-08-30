// Committed fixture for src/lib/market/oil-bulletin-workbook.mjs's tests.
//
// STRUCTURE IS PRIMARY-VERIFIED (inspection pass 3, 2026-08-30, a browser fetch of the live Weekly Oil
// Bulletin .xlsx — 4,455,028 bytes, the same file the CI runner downloaded — see the workbook module's own
// header for the full citation): row 1 is a MACHINE-IDENTIFIER row (the sheet's own A1 title, repeating
// "CTR" marker columns ahead of every country/EU/EUR block, and per-column ids of the shape
// "{PREFIX}_price_wo_tax_{product}"); row 2 is the human-readable product display name, repeated verbatim
// under every block; row 3 carries "Date" plus a unit ("1000 l"/"t") where the verified evidence has one;
// "EU - European Union" is a LEGEND-row string (real shared string, one cell, far below the header rows —
// modelled here in a legend row with no Date cell, never in rows 1-3); and data rows are NEWEST-FIRST,
// starting at row 4 with a numeric Excel serial (46258 == 2026-08-24, this pipeline's own conversion,
// re-confirmed this pass).
//
// This fixture replaces the previous revision's shape (a single merged row-1 block-name cell per country,
// "EU - European Union" literally present as a header) — that shape does not exist in the real file and was
// exactly why the first live CI run threw (producers run #7, 2026-08-30, exit 2): the module correctly
// failed closed on a key that was simply never there. See oil-bulletin-workbook.mjs's header for the full
// story.
//
// THESE NUMBERS ARE ILLUSTRATIVE TEST DATA, NOT ASSERTED LIVE FIGURES — same posture as
// market-eu-oil-bulletin-parser.fixtures.mjs (CLAUDE.md standing rule 2: never fabricate a number
// presented as real). The real-numbers proof is the CI dry run an operator reads against the live file.
//
// LOCATION: under src/__tests__/, mirroring market-eu-oil-bulletin-parser.{fixtures,test}.mjs exactly —
// fsi-app/.discipline/run-test-suite.sh globs `src/__tests__/*.test.mjs` but has no glob for
// `src/lib/market/**`, so a co-located test would be green and run by nothing (CLAUDE.md rule 15).

// Shared-string table indices used by the row/cell fixtures below — kept as named constants so the
// worksheet fixture stays readable instead of a wall of magic numbers.
export const SI = {
  DATE: 0,
  EU_LEGEND: 1, // "EU - European Union" — the real legend-row string; never used as a header key here
  EUROSUPER_95: 2,
  AUTOMOTIVE_DIESEL: 3,
  HEATING_GAS_OIL: 4,
  LPG_MOTOR_FUEL: 5,
  FUEL_OIL_BASE_GRADE: 6, // verbatim capture has no percentage suffix — see workbook module header
  FUEL_OIL_HIGH_SULPHUR: 7, // verbatim "...Soufre > 1% Sulphur > 1%..." -> heavy-fuel-oil-3-5pct
  LPG_UNIT_1000L: 8,
  AUTO_UNIT_1000_L: 9,
  CTR_MARKER: 10, // repeating row-1 spacer marker ahead of every country/EU/EUR block
  FOOTER_NOTE: 11,
  EUROSUPER_95_CR_VARIANT: 12, // "_x000D_"-escaped variant, exercised by the decode test only
  SHEET_TITLE: 13, // A1's own title — row 1's text over the date column, NOT "Date" (row 3 carries that)
  EU_EURO95: 14,
  EU_DIESEL: 15,
  EU_HEATING_OIL: 16,
  EU_FUEL_OIL_1: 17,
  EU_FUEL_OIL_2: 18,
  EU_LPG: 19,
  EUR_EURO95: 20,
  EUR_DIESEL: 21,
  AT_EURO95: 22,
  AT_DIESEL: 23,
  EU_BOGUS_SUFFIX: 24, // row-1 id with a suffix EU_SUFFIX_TO_SLUG does not recognise
};

export const SHARED_STRINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="25" uniqueCount="25">
  <si><t>Date</t></si>
  <si><t>EU - European Union</t></si>
  <si><t>Euro-super 95  (I)</t></si>
  <si><t>Gas oil automobile Automotive gas oil Dieselkraftstoff (I)</t></si>
  <si><t xml:space="preserve"> Gas oil de chauffage Heating gas oil Heizöl (II)</t></si>
  <si><t>GPL pour moteur LPG motor fuel</t></si>
  <si><t xml:space="preserve"> Fuel oil - Schweres Heizöl (III) Soufre </t></si>
  <si><t xml:space="preserve"> Fuel oil -Schweres Heizöl (III) Soufre &gt; 1% Sulphur &gt; 1% Schwefel &gt; 1%</t></si>
  <si><t>1000L</t></si>
  <si><t>1000 l</t></si>
  <si><t>CTR</t></si>
  <si><t>preliminary; weighted averages for EU and EUR may change when final weights (annual consumption) for corresponding years arrive</t></si>
  <si><t>Euro-super 95_x000D_(I)</t></si>
  <si><t>Consumer prices of petroleum products net of duties and taxes</t></si>
  <si><t>EU_price_wo_tax_euro95</t></si>
  <si><t>EU_price_wo_tax_diesel</t></si>
  <si><t>EU_price_wo_tax_heating_oil</t></si>
  <si><t>EU_price_wo_tax_fuel_oil_1</t></si>
  <si><t>EU_price_wo_tax_fuel_oil_2</t></si>
  <si><t>EU_price_wo_tax_LPG</t></si>
  <si><t>EUR_price_wo_tax_euro95</t></si>
  <si><t>EUR_price_wo_tax_diesel</t></si>
  <si><t>AT_price_wo_tax_euro95</t></si>
  <si><t>AT_price_wo_tax_diesel</t></si>
  <si><t>EU_price_wo_tax_mystery_grade</t></si>
</sst>`;

// xl/workbook.xml — two price sheets (as verified) plus a couple of the other named sheets, to prove
// parseSheetNames resolves by name, never by position.
export const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Prices with taxes" sheetId="2" r:id="rId1"/>
    <sheet name="Prices wo taxes" sheetId="3" r:id="rId2"/>
    <sheet name="Consumption" sheetId="4" r:id="rId3"/>
    <sheet name="VAT" sheetId="5" r:id="rId4"/>
  </sheets>
</workbook>`;

// xl/_rels/workbook.xml.rels — deliberately out of rId order, to prove resolution is by id, not position.
export const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
</Relationships>`;

// Column layout (mirrors the verified real shape): A=Date (row1 carries the sheet's own title, not
// "Date" — row3 carries that), B="CTR" marker, C..H=EU block (6 machine-id columns), I="CTR" marker,
// J..K=EUR block (euro-area average — a DIFFERENT aggregate, included specifically to prove EU_ vs EUR_
// disambiguation), L="CTR" marker, M..N=AT (Austria) country block — included to prove a country block is
// never mistaken for the EU block either. Row 2 repeats the SAME product display text under every block
// (EU/EUR/AT alike — verified: row 2 cannot by itself distinguish blocks, only products), which is exactly
// what makes the row-1 machine id the only column-level way to tell them apart.
//
// Data rows: newest-first in document order, matching the verified real file — r=4 is the LATEST week
// (serial 46258 == 2026-08-24), r=5 is the prior week (serial 46251 == 2026-08-17), r=6 is the week before
// that (serial 46244 == 2026-08-10). r=4 deliberately omits column G (EU fuel_oil_2 /
// heavy-fuel-oil-3-5pct) to exercise the "missing price -> warning, not fabricated" path on the row
// extractLatestEuRow actually returns. r=7 is a LEGEND row (B7 = the real "EU - European Union" string,
// no Date-column cell) modelling the real file's B1088 legend cell — must never be read as a header or as
// data. r=8/9 are footer notes (spans="2:8", no Date-column cell) mirroring the real trailing note rows.
export const SHEET_WO_TAXES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:N9"/>
  <sheetViews>
    <sheetView><pane ySplit="3" topLeftCell="A4" state="frozen"/></sheetView>
  </sheetViews>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>${SI.SHEET_TITLE}</v></c>
      <c r="B1" t="s"><v>${SI.CTR_MARKER}</v></c>
      <c r="C1" t="s"><v>${SI.EU_EURO95}</v></c>
      <c r="D1" t="s"><v>${SI.EU_DIESEL}</v></c>
      <c r="E1" t="s"><v>${SI.EU_HEATING_OIL}</v></c>
      <c r="F1" t="s"><v>${SI.EU_FUEL_OIL_1}</v></c>
      <c r="G1" t="s"><v>${SI.EU_FUEL_OIL_2}</v></c>
      <c r="H1" t="s"><v>${SI.EU_LPG}</v></c>
      <c r="I1" t="s"><v>${SI.CTR_MARKER}</v></c>
      <c r="J1" t="s"><v>${SI.EUR_EURO95}</v></c>
      <c r="K1" t="s"><v>${SI.EUR_DIESEL}</v></c>
      <c r="L1" t="s"><v>${SI.CTR_MARKER}</v></c>
      <c r="M1" t="s"><v>${SI.AT_EURO95}</v></c>
      <c r="N1" t="s"><v>${SI.AT_DIESEL}</v></c>
    </row>
    <row r="2">
      <c r="C2" t="s"><v>${SI.EUROSUPER_95}</v></c>
      <c r="D2" t="s"><v>${SI.AUTOMOTIVE_DIESEL}</v></c>
      <c r="E2" t="s"><v>${SI.HEATING_GAS_OIL}</v></c>
      <c r="F2" t="s"><v>${SI.FUEL_OIL_BASE_GRADE}</v></c>
      <c r="G2" t="s"><v>${SI.FUEL_OIL_HIGH_SULPHUR}</v></c>
      <c r="H2" t="s"><v>${SI.LPG_MOTOR_FUEL}</v></c>
      <c r="J2" t="s"><v>${SI.EUROSUPER_95}</v></c>
      <c r="K2" t="s"><v>${SI.AUTOMOTIVE_DIESEL}</v></c>
      <c r="M2" t="s"><v>${SI.EUROSUPER_95}</v></c>
      <c r="N2" t="s"><v>${SI.AUTOMOTIVE_DIESEL}</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>${SI.DATE}</v></c>
      <c r="D3" t="s"><v>${SI.AUTO_UNIT_1000_L}</v></c>
      <c r="H3" t="s"><v>${SI.LPG_UNIT_1000L}</v></c>
    </row>
    <row r="4">
      <c r="A4"><v>46258</v></c>
      <c r="C4"><v>1519.9</v></c>
      <c r="D4"><v>1493.9</v></c>
      <c r="E4"><v>1108.9</v></c>
      <c r="F4"><v>501.9</v></c>
      <c r="H4"><v>709.9</v></c>
      <c r="J4"><v>1600.0</v></c>
      <c r="K4"><v>1550.0</v></c>
      <c r="M4"><v>1580.0</v></c>
      <c r="N4"><v>1520.0</v></c>
    </row>
    <row r="5">
      <c r="A5"><v>46251</v></c>
      <c r="C5"><v>1511.1</v></c>
      <c r="D5"><v>1481.1</v></c>
      <c r="E5"><v>1101.1</v></c>
      <c r="F5"><v>491.1</v></c>
      <c r="G5"><v>451.1</v></c>
      <c r="H5"><v>711.1</v></c>
      <c r="J5"><v>1590.0</v></c>
      <c r="K5"><v>1540.0</v></c>
      <c r="M5"><v>1570.0</v></c>
      <c r="N5"><v>1510.0</v></c>
    </row>
    <row r="6">
      <c r="A6" t="str"><v>2026-08-10</v></c>
      <c r="C6"><v>1502.2</v></c>
      <c r="D6"><v>1471.2</v></c>
      <c r="E6"><v>1092.2</v></c>
      <c r="F6"><v>481.2</v></c>
      <c r="G6"><v>441.2</v></c>
      <c r="H6"><v>701.2</v></c>
      <c r="J6"><v>1580.0</v></c>
      <c r="K6"><v>1530.0</v></c>
      <c r="M6"><v>1560.0</v></c>
      <c r="N6"><v>1500.0</v></c>
    </row>
    <row r="7">
      <c r="B7" t="s"><v>${SI.EU_LEGEND}</v></c>
    </row>
    <row r="8" spans="2:8">
      <c r="B8" t="s"><v>${SI.FOOTER_NOTE}</v></c>
    </row>
    <row r="9" spans="2:8">
      <c r="B9" t="s"><v>${SI.FOOTER_NOTE}</v></c>
    </row>
  </sheetData>
</worksheet>`;

// SAME header rows and week values as SHEET_WO_TAXES_XML, but the data rows are listed in an order that is
// NEITHER newest-first NOR oldest-first — the middle week first, then the latest, then the oldest — to
// prove extractEuSeries sorts explicitly by week_ending rather than trusting ANY particular document order
// (not just the real file's newest-first order).
export const SHEET_WO_TAXES_SHUFFLED_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:N9"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>${SI.SHEET_TITLE}</v></c>
      <c r="B1" t="s"><v>${SI.CTR_MARKER}</v></c>
      <c r="C1" t="s"><v>${SI.EU_EURO95}</v></c>
      <c r="D1" t="s"><v>${SI.EU_DIESEL}</v></c>
      <c r="E1" t="s"><v>${SI.EU_HEATING_OIL}</v></c>
      <c r="F1" t="s"><v>${SI.EU_FUEL_OIL_1}</v></c>
      <c r="G1" t="s"><v>${SI.EU_FUEL_OIL_2}</v></c>
      <c r="H1" t="s"><v>${SI.EU_LPG}</v></c>
    </row>
    <row r="2">
      <c r="C2" t="s"><v>${SI.EUROSUPER_95}</v></c>
      <c r="D2" t="s"><v>${SI.AUTOMOTIVE_DIESEL}</v></c>
      <c r="E2" t="s"><v>${SI.HEATING_GAS_OIL}</v></c>
      <c r="F2" t="s"><v>${SI.FUEL_OIL_BASE_GRADE}</v></c>
      <c r="G2" t="s"><v>${SI.FUEL_OIL_HIGH_SULPHUR}</v></c>
      <c r="H2" t="s"><v>${SI.LPG_MOTOR_FUEL}</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>${SI.DATE}</v></c>
    </row>
    <row r="4">
      <c r="A4"><v>46251</v></c>
      <c r="C4"><v>1511.1</v></c>
      <c r="D4"><v>1481.1</v></c>
      <c r="E4"><v>1101.1</v></c>
      <c r="F4"><v>491.1</v></c>
      <c r="G4"><v>451.1</v></c>
      <c r="H4"><v>711.1</v></c>
    </row>
    <row r="5">
      <c r="A5"><v>46258</v></c>
      <c r="C5"><v>1519.9</v></c>
      <c r="D5"><v>1493.9</v></c>
      <c r="E5"><v>1108.9</v></c>
      <c r="F5"><v>501.9</v></c>
      <c r="G5"><v>461.9</v></c>
      <c r="H5"><v>709.9</v></c>
    </row>
    <row r="6">
      <c r="A6"><v>46244</v></c>
      <c r="C6"><v>1502.2</v></c>
      <c r="D6"><v>1471.2</v></c>
      <c r="E6"><v>1092.2</v></c>
      <c r="F6"><v>481.2</v></c>
      <c r="G6"><v>441.2</v></c>
      <c r="H6"><v>701.2</v></c>
    </row>
  </sheetData>
</worksheet>`;

// A minimal, deliberately EU-block-free sheet, for the "no row-1 header matches EU_price_wo_tax_" test —
// an EUR block and an AT country block are both present (proving neither is mistaken for the EU block),
// but no column carries an "EU_price_wo_tax_*" id.
export const SHEET_NO_EU_BLOCK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:E4"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>${SI.SHEET_TITLE}</v></c>
      <c r="B1" t="s"><v>${SI.CTR_MARKER}</v></c>
      <c r="C1" t="s"><v>${SI.EUR_EURO95}</v></c>
      <c r="D1" t="s"><v>${SI.CTR_MARKER}</v></c>
      <c r="E1" t="s"><v>${SI.AT_EURO95}</v></c>
    </row>
    <row r="2">
      <c r="C2" t="s"><v>${SI.EUROSUPER_95}</v></c>
      <c r="E2" t="s"><v>${SI.EUROSUPER_95}</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>${SI.DATE}</v></c>
    </row>
    <row r="4">
      <c r="A4"><v>46251</v></c>
      <c r="C4"><v>1500.0</v></c>
      <c r="E4"><v>1490.0</v></c>
    </row>
  </sheetData>
</worksheet>`;

// A sheet with no Date column at all, for the "missing Date column throws" test.
export const SHEET_NO_DATE_COLUMN_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:D4"/>
  <sheetData>
    <row r="1">
      <c r="C1" t="s"><v>${SI.EU_EURO95}</v></c>
    </row>
    <row r="2">
      <c r="C2" t="s"><v>${SI.EUROSUPER_95}</v></c>
    </row>
    <row r="3"></row>
  </sheetData>
</worksheet>`;

// A sheet whose one data row has an unparseable date cell in the date column (neither a numeric serial
// nor an ISO-ish string) — for the "fails closed, naming the raw cell value" test.
export const SHEET_BAD_DATE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:D4"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>${SI.SHEET_TITLE}</v></c>
      <c r="C1" t="s"><v>${SI.EU_EURO95}</v></c>
    </row>
    <row r="2">
      <c r="C2" t="s"><v>${SI.EUROSUPER_95}</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>${SI.DATE}</v></c>
    </row>
    <row r="4">
      <c r="A4" t="s"><v>${SI.FOOTER_NOTE}</v></c>
      <c r="C4"><v>1500.0</v></c>
    </row>
  </sheetData>
</worksheet>`;
