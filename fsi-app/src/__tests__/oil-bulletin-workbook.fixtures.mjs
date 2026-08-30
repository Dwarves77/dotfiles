// Committed fixture for src/lib/market/oil-bulletin-workbook.mjs's tests.
//
// STRUCTURE IS PRIMARY-VERIFIED (2026-08-30, two GitHub-runner inspection runs that downloaded the live
// Weekly Oil Bulletin .xlsx — see the workbook module's own header for the full citation): the sheet
// list + rIds in xl/workbook.xml, the rId->Target mapping in xl/_rels/workbook.xml.rels, the 3
// frozen header rows, the repeating [spacer + 6-7 data cols] country-block layout, the verbatim
// shared-string headers ("EU - European Union", "Date", the six product headers, the `_x000D_`-escaped
// variant, the footer notes with spans="2:8"), and that a data row is identified by a parseable date in
// its leading column. What is NOT verified — and therefore NOT asserted as real here — is the exact
// literal header text of any non-EU country block, or the precise column count/spacing of a second
// block; "XX - Synthetic Country" below is a deliberately-labelled placeholder that exists only to prove
// block segmentation (spacer columns skipped, more than one block resolved, only the EU block mapped)
// works when more than one block is present, not a real country header.
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
  EU_BLOCK: 1,
  EUROSUPER_95: 2,
  AUTOMOTIVE_DIESEL: 3,
  HEATING_GAS_OIL: 4,
  LPG_MOTOR_FUEL: 5,
  FUEL_OIL_BASE_GRADE: 6, // verbatim capture has no percentage suffix — see workbook module header
  FUEL_OIL_HIGH_SULPHUR: 7, // verbatim "...Soufre > 1% Sulphur > 1%..." -> heavy-fuel-oil-3-5pct
  LPG_UNIT_1000L: 8,
  AUTO_UNIT_1000_L: 9,
  SYNTHETIC_COUNTRY: 10,
  FOOTER_NOTE: 11,
  EUROSUPER_95_CR_VARIANT: 12, // "_x000D_"-escaped variant, exercised by the decode test only
};

export const SHARED_STRINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="13" uniqueCount="13">
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
  <si><t>XX - Synthetic Country</t></si>
  <si><t>preliminary; weighted averages for EU and EUR may change when final weights (annual consumption) for corresponding years arrive</t></si>
  <si><t>Euro-super 95_x000D_(I)</t></si>
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

// Column layout: A=Date, B=spacer, C..H=EU block (6 data cols), I=spacer, J..O=synthetic 2nd block.
// Header rows 1-3 (frozen panes ySplit=3, verified). Row 2 carries the product name per EU column; row 3
// carries the unit for the two auto-fuel columns that have one in the verified evidence (LPG, diesel) —
// left absent for the fuel-oil columns, matching the ambiguity noted above (never fabricated).
//
// Data rows: r=4 uses a numeric Excel-serial date (46251 == 2026-08-17, verified conversion: serial -
// 25569 days from the 1970-01-01 epoch); r=5 (the LATEST row) uses an ISO-ish string date instead, to
// exercise BOTH documented date encodings, and deliberately omits column H (the >1%-sulphur price) to
// exercise the "missing price -> warning, not fabricated" path on the row extractLatestEuRow actually
// returns. Rows r=6/7 are footer notes (spans="2:8", no Date-column cell) mirroring the real file's
// trailing note rows — must be skipped, not read as data.
export const SHEET_WO_TAXES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:O7"/>
  <sheetViews>
    <sheetView><pane ySplit="3" topLeftCell="A4" state="frozen"/></sheetView>
  </sheetViews>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>${SI.DATE}</v></c>
      <c r="C1" t="s"><v>${SI.EU_BLOCK}</v></c>
      <c r="J1" t="s"><v>${SI.SYNTHETIC_COUNTRY}</v></c>
    </row>
    <row r="2">
      <c r="C2" t="s"><v>${SI.EUROSUPER_95}</v></c>
      <c r="D2" t="s"><v>${SI.AUTOMOTIVE_DIESEL}</v></c>
      <c r="E2" t="s"><v>${SI.HEATING_GAS_OIL}</v></c>
      <c r="F2" t="s"><v>${SI.LPG_MOTOR_FUEL}</v></c>
      <c r="G2" t="s"><v>${SI.FUEL_OIL_BASE_GRADE}</v></c>
      <c r="H2" t="s"><v>${SI.FUEL_OIL_HIGH_SULPHUR}</v></c>
      <c r="J2" t="s"><v>${SI.EUROSUPER_95}</v></c>
      <c r="K2" t="s"><v>${SI.AUTOMOTIVE_DIESEL}</v></c>
    </row>
    <row r="3">
      <c r="D3" t="s"><v>${SI.AUTO_UNIT_1000_L}</v></c>
      <c r="F3" t="s"><v>${SI.LPG_UNIT_1000L}</v></c>
    </row>
    <row r="4">
      <c r="A4"><v>46251</v></c>
      <c r="C4"><v>1511.1</v></c>
      <c r="D4"><v>1481.1</v></c>
      <c r="E4"><v>1101.1</v></c>
      <c r="F4"><v>711.1</v></c>
      <c r="G4"><v>491.1</v></c>
      <c r="H4"><v>451.1</v></c>
      <c r="J4"><v>1510.0</v></c>
      <c r="K4"><v>1480.0</v></c>
    </row>
    <row r="5">
      <c r="A5" t="str"><v>2026-08-24</v></c>
      <c r="C5"><v>1519.1</v></c>
      <c r="D5"><v>1493.1</v></c>
      <c r="E5"><v>1108.1</v></c>
      <c r="F5"><v>709.1</v></c>
      <c r="G5"><v>501.1</v></c>
      <c r="J5"><v>1518.0</v></c>
      <c r="K5"><v>1492.0</v></c>
    </row>
    <row r="6" spans="2:8">
      <c r="B6" t="s"><v>${SI.FOOTER_NOTE}</v></c>
    </row>
    <row r="7" spans="2:8">
      <c r="B7" t="s"><v>${SI.FOOTER_NOTE}</v></c>
    </row>
  </sheetData>
</worksheet>`;

// A minimal, deliberately EU-block-free sheet, for the "missing EU block throws" test — one country
// block only, named something that is not "EU - European Union".
export const SHEET_NO_EU_BLOCK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:D4"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>${SI.DATE}</v></c>
      <c r="C1" t="s"><v>${SI.SYNTHETIC_COUNTRY}</v></c>
    </row>
    <row r="2">
      <c r="C2" t="s"><v>${SI.EUROSUPER_95}</v></c>
    </row>
    <row r="3"></row>
    <row r="4">
      <c r="A4"><v>46251</v></c>
      <c r="C4"><v>1500.0</v></c>
    </row>
  </sheetData>
</worksheet>`;

// A sheet with no Date column at all, for the "missing Date column throws" test.
export const SHEET_NO_DATE_COLUMN_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:D4"/>
  <sheetData>
    <row r="1">
      <c r="C1" t="s"><v>${SI.EU_BLOCK}</v></c>
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
      <c r="A1" t="s"><v>${SI.DATE}</v></c>
      <c r="C1" t="s"><v>${SI.EU_BLOCK}</v></c>
    </row>
    <row r="2">
      <c r="C2" t="s"><v>${SI.EUROSUPER_95}</v></c>
    </row>
    <row r="3"></row>
    <row r="4">
      <c r="A4" t="s"><v>${SI.FOOTER_NOTE}</v></c>
      <c r="C4"><v>1500.0</v></c>
    </row>
  </sheetData>
</worksheet>`;
