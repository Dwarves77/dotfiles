// oil-bulletin-workbook.mjs — pure XML/OOXML parsing for the EU Weekly Oil Bulletin's published
// spreadsheet, built for scripts/producers/market/fetch-oil-bulletin.mjs (WO-16 step 3's fetch layer,
// 2026-08-30). This module answers "given the raw XML parts of the .xlsx zip, what does the EU-average
// price table say" — nothing here touches the network, the filesystem, or a subprocess. That split lets
// the structural-parsing logic (the part that can be gotten subtly wrong) run under `node --test` with
// zero I/O, against a fixture that mirrors the real file's shape.
//
// REVISION HISTORY, STATED PLAINLY. The first revision of this module keyed the EU-average block on the
// display string "EU - European Union" found (it believed) in header row 1. The first live CI run against
// the real file (producers run #7, 2026-08-30) failed loudly and by design — exit 2, OilBulletinStructureError
// — because that string is NOT a header anywhere in the real workbook: it is a LEGEND-row label, one cell,
// far below the data (see "WHAT rows 1-3 ACTUALLY ARE" below). The failure was correct behaviour (fail
// closed, name the problem) but the underlying key was simply wrong. This revision replaces it with the key
// the file actually carries — see "WHY THE MACHINE ROW IS PRIMARY" below — from a third inspection pass
// (browser fetch, 2026-08-30, 4,455,028 bytes, the same file the CI runner downloaded) that read the raw
// sheet2.xml cell-by-cell instead of trusting the first pass's assumption about what row 1 would contain.
//
// WHAT ROWS 1-3 ACTUALLY ARE (verified, inspection pass 3, sheet "Prices wo taxes" -> xl/worksheets/sheet2.xml):
//   * Row 1 is a MACHINE-IDENTIFIER row, not a display-label row. A1 carries the sheet's own title
//     ("Consumer prices of petroleum products net of duties and taxes"); most other row-1 cells carry a
//     repeating "CTR" marker string (one before every country/EU/EUR column group — verified at B1 before
//     the EU block's C..H, and again at I1 before the EUR block's J.. — a spacer role, not a country code);
//     and the actual data columns carry machine identifiers of the shape "{PREFIX}_price_wo_tax_{product}",
//     e.g. "EU_price_wo_tax_euro95", "EUR_price_wo_tax_diesel", "AT_price_wo_tax_heating_oil", one per
//     country code plus "EU_" (the bloc-wide average, this module's target) and "EUR_" (the euro-area
//     subset average — texually adjacent to "EU_" but a DIFFERENT aggregate; see EU_PRICE_WO_TAX_RE below
//     for why the two cannot collide). Non-euro countries additionally carry a "{CC}_exchange_rate" column.
//   * Row 2 carries the human-readable product display name per column — the six verbatim strings quoted
//     below, repeated under every country/EU/EUR block (it is the same physical commodity column,
//     independent of whose price it is), which is exactly why row 2 makes a good CROSS-CHECK but a bad
//     PRIMARY key: it cannot by itself tell an EU_ column from an AT_ column, only what product a column is.
//   * Row 3 carries "Date" (over the leading date column) and the unit ("1000 l" or "t") over the price
//     columns that carry one in the verified evidence.
//   * "EU - European Union" is shared string ss[417] in the live file and appears in EXACTLY ONE cell of
//     sheet2: B1088 — a LEGEND row near the bottom of the sheet, not a header row, not column-aligned with
//     anything a header-scan would see (header rows 1-3 never reach row 1088). It is real text in the real
//     file; it is simply not where the first revision of this module looked for it.
//   * Data rows start at row 4 and run NEWEST-FIRST, descending as the row index grows (verified: A4 is a
//     numeric Excel serial 46258 == 2026-08-24, the latest published week at inspection time; later rows
//     hold earlier weeks). Nothing about that ordering is assumed to hold structurally for a future file —
//     see extractEuSeries below for why this module sorts explicitly instead of trusting document order.
//   * Trailing rows (observed at r=1102..1109) are footer/legend rows, `spans="2:11"` or `spans="2:8"`,
//     holding shared-string cells (footnote markers like "(I)"/"(II)", the Commission's disclaimer text,
//     and the B1088 legend cell above). A row is a DATA row iff its Date-column cell carries a value that
//     PARSES as a date (see parseDateCell) — NOT merely iff that cell is present. Inspection pass 4
//     (browser re-fetch, 2026-08-30, same 4,455,028-byte file, a full-column scan of every populated A
//     cell below row 3) found the earlier claim here ("a footer row's Date-column cell is simply absent")
//     was true of every footer/legend row EXCEPT ONE: A1087, a shared-string cell (t="s") resolving to
//     "Notes:" — the first row of the footer block, which DOES occupy the date column, just with text
//     that is not a date. So the correct rule is: a footer/legend row's Date-column cell is either absent
//     OR present-but-unparseable, and either shape is skipped, never by a row-index cutoff this module
//     would have to keep in sync with the file by hand — see extractEuSeries below for the classification.
//
// WHY THE MACHINE ROW IS PRIMARY, THE DISPLAY ROW IS A CROSS-CHECK, NEVER THE REVERSE. Row 1's machine
// identifiers are the file's own namespacing: "EU_price_wo_tax_*" cannot collide with "EUR_price_wo_tax_*"
// (see EU_PRICE_WO_TAX_RE — the regex requires the literal "EU_price_wo_tax_" prefix, and "EUR_price_wo_tax_"
// fails that prefix at the very next character) or with any country code, because the file itself uses this
// row to disambiguate columns that otherwise look identical under row 2 (the euro95 column under EU_, EUR_,
// and every country block all carry the SAME row-2 display text — row 2 alone cannot tell them apart). Row 2
// is still read and still matters: resolveHeaderBlocks runs the SAME PRODUCT_MATCHERS this module has always
// used against every EU column's row-2 text and, when both keys disagree about which of the six products a
// column is, THROWS rather than picking one silently — two independent keys disagreeing means the file's
// format drifted in a way this module has not verified, not a case to guess through.
//
//   * sharedStrings.xml includes verbatim (quoted exactly as read, including a leading/trailing space that
//     is part of the real string): "Euro-super 95  (I)", "Euro-super 95_x000D_(I)" (Excel's own `_x000D_`
//     in-band escape for an embedded CR — decoded here as a literal character, never left as the
//     six-character token, so header matching sees the same text either way), "Gas oil automobile
//     Automotive gas oil Dieselkraftstoff (I)", " Gas oil de chauffage Heating gas oil Heizöl (II)", " Fuel
//     oil - Schweres Heizöl (III) Soufre " (the base/first fuel-oil grade — the captured text has no
//     percentage suffix; see PRODUCT_MATCHERS below for how that ambiguity is resolved), " Fuel oil
//     -Schweres Heizöl (III) Soufre > 1% Sulphur > 1% Schwefel > 1%" (the second, high-sulphur grade —
//     matched to this pipeline's `heavy-fuel-oil-3-5pct` slug, the Bulletin's own name for the ">1% S"
//     grade), "GPL pour moteur LPG motor fuel", "Date", "1000 l", "1000L", and "EU - European Union" (the
//     legend-row string described above — read here only for that one cell's sake, never as a header key).
//   * Date-cell ENCODING was NOT fully re-verified this pass beyond confirming the numeric-serial case
//     (46258 == 2026-08-24, per this module's own EXCEL_1900_EPOCH_OFFSET_DAYS convention). parseDateCell
//     still handles both a numeric serial and an ISO-ish string, and throws a named, structure-specific
//     error — never a silent guess — for anything that is neither.
//
// EU-AVERAGE, NOT A COMPUTED AVERAGE OF THIS MODULE'S OWN. The EU_price_wo_tax_* columns' values are the
// Commission's own published weighted averages (the B1088 legend cell and the footer disclaimer are
// literally about how THEY compute it) — this module reads that block's cells verbatim. It NEVER averages
// country columns itself; if no column's row-1 text matches EU_PRICE_WO_TAX_RE, resolveHeaderBlocks throws
// rather than falling back to an average this pipeline did not verify.
//
// PLAIN ESM, ZERO DEPENDENCIES, NO fs/fetch/child_process — pure string-in, data-out. The orchestrator
// (fetch-oil-bulletin.mjs) owns every I/O boundary.

/** Thrown for any workbook shape that does not match the verified structure above — never swallowed,
 *  never downgraded to a guess. Every message names the specific missing/unexpected piece. */
export class OilBulletinStructureError extends Error {
  constructor(message) {
    super(message);
    this.name = "OilBulletinStructureError";
  }
}

// ── XML / OOXML text decoding ────────────────────────────────────────────────────────────────────────

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decode standard XML entities (named + numeric) and Excel's own `_xHHHH_` in-band control-char escape
 *  (e.g. `_x000D_` -> CR). Order matters: entities first (they are the outer XML encoding), then the
 *  Excel escape (which operates on the resulting text, per OOXML's own convention). */
export function decodeOoxmlText(raw) {
  if (raw == null) return "";
  let s = String(raw);
  s = s.replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => XML_ENTITIES[n]);
  s = s.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  s = s.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  s = s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return s;
}

// ── column-letter <-> number (A=1, Z=26, AA=27, …) ──────────────────────────────────────────────────

function colToNum(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function refToCol(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new OilBulletinStructureError(`cell ref "${ref}" is not a valid A1-style reference`);
  return m[1];
}

// ── xl/workbook.xml + xl/_rels/workbook.xml.rels -> sheet name -> package path ─────────────────────

/**
 * @param {string} workbookXml  raw text of xl/workbook.xml
 * @param {string} relsXml      raw text of xl/_rels/workbook.xml.rels
 * @returns {Record<string,string>} sheet name -> full in-package path (e.g. "xl/worksheets/sheet2.xml")
 */
export function parseSheetNames(workbookXml, relsXml) {
  const sheetTags = [...String(workbookXml ?? "").matchAll(/<sheet\b([^>]*)\/>/g)].map((m) => m[1]);
  if (sheetTags.length === 0) {
    throw new OilBulletinStructureError("workbook.xml: no <sheet> entries found — cannot resolve any sheet");
  }
  const relTags = [...String(relsXml ?? "").matchAll(/<Relationship\b([^>]*)\/>/g)].map((m) => m[1]);
  const targetById = new Map();
  for (const attrs of relTags) {
    const id = /(?:^|\s)Id="([^"]+)"/.exec(attrs)?.[1];
    const target = /(?:^|\s)Target="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) targetById.set(id, target);
  }
  if (targetById.size === 0) {
    throw new OilBulletinStructureError("workbook.xml.rels: no <Relationship> entries found — cannot resolve any sheet path");
  }

  const result = {};
  for (const attrs of sheetTags) {
    const name = /(?:^|\s)name="([^"]*)"/.exec(attrs)?.[1];
    // r:id — the namespace prefix is fixed (r:) in every real workbook.xml this format produces.
    const rId = /(?:^|\s)r:id="([^"]+)"/.exec(attrs)?.[1];
    if (!name || !rId) continue; // malformed <sheet> tag — skip rather than crash on one bad entry
    const target = targetById.get(rId);
    if (!target) {
      throw new OilBulletinStructureError(`workbook.xml: sheet "${name}" references r:id="${rId}" with no matching Relationship`);
    }
    if (target.startsWith("/")) {
      // absolute-in-package target — strip the leading slash, it's already package-rooted.
      result[decodeOoxmlText(name)] = target.slice(1);
    } else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) {
      throw new OilBulletinStructureError(`workbook.xml.rels: sheet "${name}" has an external target "${target}" — expected a package-relative path`);
    } else {
      // relative to xl/ (relationships in xl/_rels/workbook.xml.rels are relative to xl/, the folder
      // the .rels file's own parent sits in) — this is the shape verified live: "worksheets/sheet1.xml".
      result[decodeOoxmlText(name)] = `xl/${target}`;
    }
  }
  if (Object.keys(result).length === 0) {
    throw new OilBulletinStructureError("workbook.xml: no <sheet> entry resolved to a valid path");
  }
  return result;
}

// ── xl/sharedStrings.xml -> string[] ────────────────────────────────────────────────────────────────

/** @param {string} xml raw text of xl/sharedStrings.xml @returns {string[]} */
export function parseSharedStrings(xml) {
  const src = String(xml ?? "");
  const siBlocks = [...src.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1]);
  return siBlocks.map((block) => {
    const runs = [...block.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)];
    if (runs.length === 0) return "";
    return runs.map((m) => decodeOoxmlText(m[1] ?? "")).join("");
  });
}

// ── worksheet <sheetData> -> rows of cells ──────────────────────────────────────────────────────────

/**
 * @typedef {{ ref: string, col: string, row: number, type: string|null, value: string|null }} WorkbookCell
 * @typedef {{ rowIndex: number, cells: WorkbookCell[] }} WorkbookRow
 */

/**
 * Parses a worksheet's <sheetData> into rows of cells, in document order. A cell's `value` is the raw
 * text of its <v> (or, for an inline string, its <is><t>) — never coerced to a number here; callers that
 * need a number parse it themselves (this module's own extractEuSeries does, for price and date cells).
 * A cell with no children (self-closing `<c .../>`) yields `value: null` — an explicitly empty cell,
 * distinct from a cell that is simply absent from the row (both mean "nothing here" to a caller, but
 * this module never conflates "empty" with "zero").
 *
 * @param {string} sheetXml
 * @returns {Generator<WorkbookRow>}
 */
export function* iterateRows(sheetXml) {
  const src = String(sheetXml ?? "");
  const sheetDataMatch = /<sheetData>([\s\S]*?)<\/sheetData>/.exec(src);
  if (!sheetDataMatch) {
    throw new OilBulletinStructureError("worksheet XML has no <sheetData> element — not a recognisable sheet");
  }
  const body = sheetDataMatch[1];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(body))) {
    const [, rowAttrs, rowInner] = rowMatch;
    const rIndexRaw = /(?:^|\s)r="(\d+)"/.exec(rowAttrs)?.[1];
    const rowIndex = rIndexRaw ? Number(rIndexRaw) : null;
    const cells = [];
    if (rowInner) {
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowInner))) {
        const [, cAttrs, cInner] = cellMatch;
        const ref = /(?:^|\s)r="([A-Z]+\d+)"/.exec(cAttrs)?.[1];
        if (!ref) continue; // a cell with no ref cannot be positioned — skip rather than guess a column
        const type = /(?:^|\s)t="([a-zA-Z]+)"/.exec(cAttrs)?.[1] ?? null;
        let value = null;
        if (cInner) {
          if (type === "inlineStr") {
            const t = /<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>/.exec(cInner);
            value = t ? decodeOoxmlText(t[1]) : null;
          } else {
            const v = /<v>([\s\S]*?)<\/v>/.exec(cInner);
            value = v ? decodeOoxmlText(v[1]) : null;
          }
        }
        cells.push({ ref, col: refToCol(ref), row: rowIndex, type, value });
      }
    }
    yield { rowIndex, cells };
  }
}

// ── header resolution ────────────────────────────────────────────────────────────────────────────────

// The legend-row string (verified: shared string ss[417], appears in exactly one cell, B1088, of the real
// sheet2.xml). Kept here only as a documented fact and for diagnostic display (euBlock.name below) — it is
// NEVER used to locate the EU block. Locating by this string is exactly what the first revision of this
// module did, and it is exactly why that revision threw on the live file (see the module header above).
const EU_LEGEND_TEXT = "EU - European Union";

/** The EU-average block's row-1 machine-identifier prefix. Deliberately anchored at the START of the
 *  string (`^`) with the trailing underscore included in the literal prefix, so "EUR_price_wo_tax_*" (the
 *  euro-area block — a DIFFERENT aggregate) can never match: after "EU" the next required character is
 *  "_", but EUR_'s next character is "R" — the two prefixes diverge at the very next byte, by construction,
 *  with no extra exclusion logic needed. */
const EU_PRICE_WO_TAX_RE = /^EU_price_wo_tax_(.+)$/;

/** Row-1 suffix (the part of "EU_price_wo_tax_{suffix}" after the prefix) -> this pipeline's slug. Closed
 *  vocabulary, mechanical mapping — an EU column whose suffix is not a key here is left unmapped with a
 *  warning (see resolveHeaderBlocks), never guessed from row 2 alone. */
const EU_SUFFIX_TO_SLUG = {
  euro95: "eurosuper-95",
  diesel: "automotive-diesel",
  heating_oil: "heating-gas-oil",
  fuel_oil_1: "residual-fuel-oil-1pct",
  fuel_oil_2: "heavy-fuel-oil-3-5pct",
  LPG: "lpg-motor-fuel",
};

/** Explicit, documented fuzzy matchers over row-2 DISPLAY text, checked in order (most specific first —
 *  both fuel-oil grades contain "Fuel oil", so the >1%-sulphur grade must be tried before the elimination
 *  fallback below). Used ONLY as the cross-check against the row-1 machine-id mapping above (see
 *  resolveHeaderBlocks) — never as the primary key, since row 2's text repeats identically under every
 *  country/EU/EUR block and so cannot by itself say which block a column belongs to. */
const PRODUCT_MATCHERS = [
  { slug: "eurosuper-95", test: (h) => /euro[\s-]*super\s*95/i.test(h) },
  { slug: "automotive-diesel", test: (h) => /(automotive gas oil|gas oil automobile|dieselkraftstoff)/i.test(h) },
  { slug: "heating-gas-oil", test: (h) => /(heating gas oil|gas oil de chauffage|heiz(?:öl|ol)\s*\(ii\))/i.test(h) },
  { slug: "lpg-motor-fuel", test: (h) => /(lpg motor fuel|gpl pour moteur)/i.test(h) },
  // The ">1% sulphur" grade — verified verbatim text carries "Sulphur > 1%" / "Soufre > 1%" explicitly.
  { slug: "heavy-fuel-oil-3-5pct", test: (h) => /fuel oil/i.test(h) && />\s*1\s*%/.test(h) },
  // The other fuel-oil grade: "Fuel oil" present, ">1%" not — the verified capture of this header has no
  // percentage suffix at all, so this is deliberately the elimination case, not a positive percentage
  // match (documented ambiguity — see this module's header comment).
  { slug: "residual-fuel-oil-1pct", test: (h) => /fuel oil/i.test(h) && !/>\s*1\s*%/.test(h) },
];

/** @param {string} headerText @returns {string|null} */
function matchProductSlug(headerText) {
  const h = headerText ?? "";
  for (const m of PRODUCT_MATCHERS) if (m.test(h)) return m.slug;
  return null;
}

/**
 * Resolves a cell's actual value: for a shared-string cell (t="s"), the raw <v> text is an INDEX into
 * sharedStrings, not the text itself — every caller that reads a cell's value (header text, a date, a
 * price) must go through this, never read `cell.value` directly, or a shared-string cell silently reads
 * back its own index as if it were the content.
 * @param {WorkbookCell} cell @param {string[]} sharedStrings @returns {string|null}
 */
export function resolveCellValue(cell, sharedStrings) {
  if (!cell || cell.value == null) return null;
  if (cell.type === "s") {
    const idx = Number(cell.value);
    if (!Number.isInteger(idx) || idx < 0 || idx >= sharedStrings.length) {
      throw new OilBulletinStructureError(`cell ${cell.ref} references shared-string index ${cell.value}, out of range (0..${sharedStrings.length - 1})`);
    }
    return sharedStrings[idx];
  }
  // Numeric (no t, or t="n"), inlineStr/str (already-decoded by iterateRows), boolean, etc. — the raw
  // <v>/<is><t> text is the value itself for every other cell type.
  return cell.value;
}

function cellText(cell, sharedStrings) {
  return resolveCellValue(cell, sharedStrings) ?? "";
}

function indexByCol(cells, sharedStrings) {
  const map = new Map();
  for (const cell of cells ?? []) {
    const text = cellText(cell, sharedStrings).trim();
    if (text) map.set(cell.col, text);
  }
  return map;
}

/**
 * Resolves the three header rows, locates the EU-average block by its row-1 MACHINE identifier
 * ("EU_price_wo_tax_{suffix}" — see EU_PRICE_WO_TAX_RE), cross-checks each mapped column against row 2's
 * human-readable product text, and maps every EU column to this pipeline's six slugs.
 *
 * TWO-KEY DESIGN, FAIL CLOSED. Row 1 (machine id) is primary: it is the only column-level text in the real
 * file that says WHICH block ("EU_", "EUR_", a country code) a column belongs to, since row 2's product
 * text is identical across every block. Row 2 is still read for every EU column and run through the same
 * PRODUCT_MATCHERS this module has always used, as an independent cross-check: if row 2 names a DIFFERENT
 * product than row 1's suffix implies, that is two independent keys disagreeing — a signal of format drift
 * this module has not verified, not a case to silently prefer one key over the other — so it throws. A
 * missing or unrecognised row-2 text is a warning only (row 1's mapping is kept); an unrecognised row-1
 * suffix is a warning only (the column is left unmapped, slug null).
 *
 * @param {WorkbookCell[]} row1Cells @param {WorkbookCell[]} row2Cells @param {WorkbookCell[]} row3Cells
 * @param {string[]} sharedStrings
 * @returns {{
 *   blocks: Array<{ col: string, headerText: string }>,
 *   euBlock: { name: string, columns: Array<{ col: string, headerText: string, slug: string|null }> },
 *   dateCol: string,
 *   warnings: string[],
 * }}
 */
export function resolveHeaderBlocks(row1Cells, row2Cells, row3Cells, sharedStrings) {
  const row1 = indexByCol(row1Cells, sharedStrings);
  const row2 = indexByCol(row2Cells, sharedStrings);
  const row3 = indexByCol(row3Cells, sharedStrings);
  const allCols = new Set([...row1.keys(), ...row2.keys(), ...row3.keys()]);
  const sortedCols = [...allCols].sort((a, b) => colToNum(a) - colToNum(b));

  // Date column: unchanged from the earlier revision, and it already works on the real file — the merged
  // text of rows 1-3 for column A includes row 3's "Date", regardless of what row 1's own text says there
  // (A1 carries the sheet's title, not "Date" — row 3 is what actually says it).
  let dateCol = null;
  for (const col of sortedCols) {
    const merged = [row1.get(col), row2.get(col), row3.get(col)].filter(Boolean).join(" ");
    if (/\bdate\b/i.test(merged)) {
      dateCol = col;
      break;
    }
  }
  if (!dateCol) {
    throw new OilBulletinStructureError('header rows 1-3 contain no column whose text matches "Date" — cannot identify the date column');
  }

  // Diagnostic-only list of every column's row-1 text (excluding the date column) — NOT a semantic block
  // model any more (row 1 carries a per-column machine id now, not a merged block label spanning several
  // columns). Its only job is to make the "no EU column found" error below actually useful to a reader.
  const blocks = sortedCols
    .filter((col) => col !== dateCol && row1.get(col))
    .map((col) => ({ col, headerText: row1.get(col) }));

  const euColumns = [];
  for (const b of blocks) {
    const m = EU_PRICE_WO_TAX_RE.exec(b.headerText);
    if (m) euColumns.push({ col: b.col, machineId: b.headerText, suffix: m[1] });
  }

  if (euColumns.length === 0) {
    throw new OilBulletinStructureError(
      `no column's row-1 header matched ${EU_PRICE_WO_TAX_RE} among ${blocks.length} observed header(s): ` +
        `${blocks.map((b) => b.headerText).join(" | ") || "(none)"}`,
    );
  }

  const warnings = [];
  for (const c of euColumns) {
    c.slug = EU_SUFFIX_TO_SLUG[c.suffix] ?? null;
    if (!c.slug) {
      warnings.push(`EU column ${c.col} ("${c.machineId}") has an unrecognised suffix "${c.suffix}" — left unmapped`);
      continue; // no known slug to cross-check row 2 against
    }
    const displayText = row2.get(c.col);
    if (!displayText) {
      warnings.push(`EU column ${c.col} ("${c.machineId}") has no row-2 display text to cross-check against — keeping the machine-id mapping to "${c.slug}"`);
      continue;
    }
    const displaySlug = matchProductSlug(displayText);
    if (!displaySlug) {
      warnings.push(
        `EU column ${c.col} ("${c.machineId}") row-2 display text "${displayText}" did not match any known product — keeping the machine-id mapping to "${c.slug}"`,
      );
      continue;
    }
    if (displaySlug !== c.slug) {
      throw new OilBulletinStructureError(
        `EU column ${c.col}: row-1 machine id "${c.machineId}" maps to slug "${c.slug}", but row-2 display text ` +
          `"${displayText}" maps to slug "${displaySlug}" — two independent keys disagree, refusing to guess which is right`,
      );
    }
  }

  const euBlock = {
    // Display name only (used in fetch-oil-bulletin.mjs's stderr report and in messages elsewhere) — the
    // legend text is real and still describes what this block IS, it is just never used to locate it.
    name: EU_LEGEND_TEXT,
    columns: euColumns.map((c) => ({ col: c.col, headerText: row2.get(c.col) ?? c.machineId, slug: c.slug })),
  };

  return { blocks, euBlock, dateCol, warnings };
}

// ── date parsing ─────────────────────────────────────────────────────────────────────────────────────

const EXCEL_1900_EPOCH_OFFSET_DAYS = 25569; // Excel serial 25569 == 1970-01-01 (per this pipeline's own
// documented convention — Excel's 1900 date system, off-by-one leap-year bug included since it is baked
// into every serial the real file would contain). Re-confirmed inspection pass 3: serial 46258 == 2026-08-24.
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * @param {WorkbookCell} cell @param {string[]} sharedStrings
 * @returns {string} ISO date (YYYY-MM-DD), or throws OilBulletinStructureError
 */
export function parseDateCell(cell, sharedStrings) {
  const raw = resolveCellValue(cell, sharedStrings);
  if (raw == null || raw === "") {
    throw new OilBulletinStructureError(`date cell ${cell?.ref ?? "(unknown)"} is empty — not a data row`);
  }
  // Numeric serial (Excel 1900 date system) — the row's date column has no `t` attribute (implicit
  // numeric) or an explicit t="n".
  if (cell.type == null || cell.type === "n") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const ms = (n - EXCEL_1900_EPOCH_OFFSET_DAYS) * 86400000;
      const iso = new Date(ms).toISOString().slice(0, 10);
      if (ISO_DATE_RE.test(iso)) return iso;
    }
  }
  // ISO-ish string (shared string, inline/str cell, or a numeric cell that just didn't parse above).
  const isoMatch = ISO_DATE_RE.exec(String(raw));
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  throw new OilBulletinStructureError(
    `date cell ${cell.ref}: value "${raw}" (type ${cell.type ?? "n"}) parses as neither an Excel serial nor an ISO-ish date string`,
  );
}

function isDataRow(row, dateCol) {
  const dateCell = row.cells.find((c) => c.col === dateCol);
  return Boolean(dateCell && dateCell.value != null && dateCell.value !== "");
}

// ── EU-row / EU-series extraction ───────────────────────────────────────────────────────────────────

/**
 * @typedef {{ week_ending: string, prices: Record<string, number>, warnings: string[] }} EuWeekRow
 */

/**
 * Walks every row of the sheet, keeps the ones with a parseable date in the date column, and returns the
 * latest `weeks` of them, most recent first. Each EU-block column with a numeric price cell in a given
 * row contributes to that row's `prices`; a missing or non-numeric price cell for a mapped slug is a
 * per-row warning, never a fabricated value and never a thrown error (one missing cell must not sink the
 * whole extraction).
 *
 * A ROW IS DATA IFF ITS DATE-COLUMN CELL PARSES AS A DATE — NOT MERELY IFF THAT CELL IS PRESENT. The
 * original rule here ("a footer row's Date-column cell is simply absent") was itself corrected by
 * inspection pass 4 (browser re-fetch of the live 4,455,028-byte file, 2026-08-30, a full-column scan of
 * every populated A cell below row 3): exactly one row in the whole sheet does NOT fit that rule — A1087,
 * a shared-string cell (t="s") resolving to "Notes:", the first row of the footer block. Every other
 * populated date-column cell in the sheet is a plain numeric serial. So the date column is not reliably
 * EMPTY on a footer row, only reliably NOT A DATE — the classification below reflects that: a date-column
 * cell that fails to parse marks the row as footer/legend and it is skipped, exactly like a genuinely
 * absent cell, rather than thrown on. This is a per-row classification, not a relaxed error policy: the
 * systemic guard is still extractLatestEuRow's own check below, which throws when EVERY row's date fails
 * to parse (or there simply are no rows) — real format drift still fails closed, one known footnote row
 * merely does not count as drift.
 *
 * ORDERING: NEVER TRUST DOCUMENT ORDER. The real workbook lists data rows NEWEST-FIRST (verified
 * inspection pass 3: row 4 = serial 46258 = 2026-08-24, descending as the row index grows) — but nothing
 * here assumes any particular document order holds, including that one. An earlier version of this
 * function did `dataRows.slice(-weeks).reverse()`, which assumes document order is OLDEST-first; run
 * against the real, newest-first file it silently returns the OLDEST `weeks` rows, mislabelled as the
 * latest. This version collects every data row and sorts explicitly by `week_ending` (a plain string
 * compare is safe: week_ending is always produced as an ISO YYYY-MM-DD string by parseDateCell), so the
 * result is correct regardless of what order the sheet happens to list rows in.
 *
 * @param {string} sheetXml
 * @param {string[]} sharedStrings
 * @param {ReturnType<typeof resolveHeaderBlocks>} headerResolution
 * @param {{ weeks?: number }} [opts]
 * @returns {EuWeekRow[]}
 */
export function extractEuSeries(sheetXml, sharedStrings, headerResolution, opts = {}) {
  const weeks = Number.isInteger(opts.weeks) && opts.weeks > 0 ? opts.weeks : 1;
  const { euBlock, dateCol } = headerResolution;
  const dataRows = [];

  for (const row of iterateRows(sheetXml)) {
    if (row.rowIndex == null || row.rowIndex <= 3) continue; // header rows themselves are never data
    if (!isDataRow(row, dateCol)) continue; // date column genuinely empty — footer/legend row, skip
    const dateCell = row.cells.find((c) => c.col === dateCol);
    let weekEnding;
    try {
      weekEnding = parseDateCell(dateCell, sharedStrings);
    } catch (err) {
      // Date column is present but its text is not a date (verified live: A1087 "Notes:", the first
      // footer row) — that classifies this row as footer/legend, not a structural failure. Only
      // extractLatestEuRow's "zero rows parsed" guard below still fails closed on real drift.
      if (err instanceof OilBulletinStructureError) continue;
      throw err;
    }

    const byCol = new Map(row.cells.map((c) => [c.col, c]));
    const prices = {};
    const warnings = [];
    for (const col of euBlock.columns) {
      if (!col.slug) continue; // already warned about at resolveHeaderBlocks time
      const priceCell = byCol.get(col.col);
      const raw = resolveCellValue(priceCell, sharedStrings);
      const n = raw == null ? NaN : Number(raw);
      if (Number.isFinite(n) && n > 0) {
        prices[col.slug] = n;
      } else {
        warnings.push(`week ${weekEnding}: EU column ${col.col} (${col.slug}) has no usable price ("${raw ?? ""}") — omitted, not fabricated`);
      }
    }
    dataRows.push({ week_ending: weekEnding, prices, warnings });
  }

  dataRows.sort((a, b) => (a.week_ending < b.week_ending ? 1 : a.week_ending > b.week_ending ? -1 : 0));
  return dataRows.slice(0, weeks);
}

/** Convenience wrapper: the single latest data row. Throws OilBulletinStructureError if there is none. */
export function extractLatestEuRow(sheetXml, sharedStrings, headerResolution) {
  const [latest] = extractEuSeries(sheetXml, sharedStrings, headerResolution, { weeks: 1 });
  if (!latest) throw new OilBulletinStructureError("no data row found (no row with a parseable date in the date column)");
  return latest;
}
