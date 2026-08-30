// oil-bulletin-workbook.mjs — pure XML/OOXML parsing for the EU Weekly Oil Bulletin's published
// spreadsheet, built for scripts/producers/market/fetch-oil-bulletin.mjs (WO-16 step 3's fetch layer,
// 2026-08-30). This module answers "given the raw XML parts of the .xlsx zip, what does the EU-average
// price table say" — nothing here touches the network, the filesystem, or a subprocess. That split lets
// the structural-parsing logic (the part that can be gotten subtly wrong) run under `node --test` with
// zero I/O, against a fixture that mirrors the real file's shape.
//
// STRUCTURE IS PRIMARY-VERIFIED, 2026-08-30, TWO INDEPENDENT GITHUB-RUNNER INSPECTION RUNS THAT
// DOWNLOADED THE LIVE FILE (see fetch-oil-bulletin.mjs's own header for the full citation). What was
// actually read:
//   * xl/workbook.xml lists sheets "Prices with taxes" (sheetId=2, r:id=rId1), "Prices wo taxes"
//     (sheetId=3, r:id=rId2), "Consumption", "VAT", "Excise duties", "Excise duties - components",
//     "Other Indirect Taxes" — never assume sheet order, always resolve name -> r:id -> Target via
//     xl/_rels/workbook.xml.rels (rId1 -> worksheets/sheet1.xml, rId2 -> worksheets/sheet2.xml, verified).
//   * Both price sheets: dimension A1:HR1109, frozen panes ySplit=3 (THREE header rows), and a repeating
//     column layout of [1 narrow spacer col + 6-7 data cols] per country block. Row-1 cells are
//     shared-string refs (t="s") carrying country/product headers.
//   * sharedStrings.xml includes verbatim (quoted exactly as read, including a leading/trailing space
//     that is part of the real string): "Euro-super 95  (I)", "Euro-super 95_x000D_(I)" (Excel's own
//     `_x000D_` in-band escape for an embedded CR — decoded here as a literal character, never left as
//     the six-character token, so header matching sees the same text either way), "Gas oil automobile
//     Automotive gas oil Dieselkraftstoff (I)", " Gas oil de chauffage Heating gas oil Heizöl (II)",
//     " Fuel oil - Schweres Heizöl (III) Soufre " (the base/first fuel-oil grade — the captured text has
//     no percentage suffix; see PRODUCT_MATCHERS below for how that ambiguity is resolved), " Fuel oil
//     -Schweres Heizöl (III) Soufre > 1% Sulphur > 1% Schwefel > 1%" (the second, high-sulphur grade —
//     matched to this pipeline's `heavy-fuel-oil-3-5pct` slug, the Bulletin's own name for the ">1% S"
//     grade), "GPL pour moteur LPG motor fuel", "Date", "1000 l", "1000L", and "EU - European Union"
//     (the EU-average block's own header, matched by exact text — never inferred from a fixed column
//     letter, since nothing in the verified evidence pins the EU block to a specific column and a future
//     country being added/removed would silently shift it).
//   * Trailing rows (observed at r=1107/1109) are footer notes, `spans="2:8"`, holding the Commission's
//     own "preliminary; weighted averages … may change" caveat as shared-string cells — not data. A row
//     is a DATA row iff its Date-column cell carries a value that parses as a date (see parseDateCell);
//     a footer row's Date-column cell is simply absent, so it is skipped by construction, never by a
//     row-index cutoff this module would have to keep in sync with the file by hand.
//   * Date-cell ENCODING was NOT verified (could be an Excel 1900-epoch serial with a date number
//     format, or a literal ISO-ish string). parseDateCell handles both and throws a named,
//     structure-specific error — never a silent guess — for anything that is neither.
//
// EU-AVERAGE, NOT A COMPUTED AVERAGE OF THIS MODULE'S OWN. The "EU - European Union" block's values are
// the Commission's own published weighted averages (shared-string caveat above is literally about how
// THEY compute it) — this module reads that block's cells verbatim. It NEVER averages country columns
// itself; if the EU block cannot be located, resolveHeaderBlocks throws rather than falling back to an
// average this pipeline did not verify.
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

const EU_BLOCK_NAME = "EU - European Union";

/** Explicit, documented fuzzy matchers, checked in order (most specific first — both fuel-oil grades
 *  contain "Fuel oil", so the >1%-sulphur grade must be tried before the elimination fallback below). */
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
 * Resolves the three header rows into country blocks and locates the EU-average block, mapping its
 * product columns to this pipeline's six slugs.
 *
 * Column layout (verified): a block starts at the column where the top header row (row1) carries text
 * (the country/EU name — a merged cell in the real file, so only its first column has that text); every
 * subsequent column with row2/row3 text but no row1 text of its own belongs to that same block, until
 * the next row1-labelled column starts a new one. A column with no text in any of the three rows is a
 * spacer and is skipped — never counted as a data column.
 *
 * @param {WorkbookCell[]} row1Cells @param {WorkbookCell[]} row2Cells @param {WorkbookCell[]} row3Cells
 * @param {string[]} sharedStrings
 * @returns {{
 *   blocks: Array<{ name: string, columns: Array<{ col: string, headerText: string }> }>,
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

  const blocks = [];
  let current = null;
  for (const col of sortedCols) {
    if (col === dateCol) continue;
    const blockName = row1.get(col);
    const productText = [row2.get(col), row3.get(col)].filter(Boolean).join(" ").trim();
    if (blockName) {
      current = { name: blockName, columns: [] };
      blocks.push(current);
      if (productText) current.columns.push({ col, headerText: productText });
      continue;
    }
    if (!productText) continue; // spacer column
    if (!current) continue; // product text before any block header — cannot happen in the verified
    // layout (every block starts with its own row1 label); ignored rather than mis-attributed.
    current.columns.push({ col, headerText: productText });
  }

  const euBlock = blocks.find((b) => b.name.trim() === EU_BLOCK_NAME);
  if (!euBlock) {
    throw new OilBulletinStructureError(
      `no header block named "${EU_BLOCK_NAME}" found among ${blocks.length} block(s): ${blocks.map((b) => b.name).join(" | ") || "(none)"}`,
    );
  }

  const warnings = [];
  for (const c of euBlock.columns) {
    c.slug = matchProductSlug(c.headerText);
    if (!c.slug) warnings.push(`EU block column ${c.col} ("${c.headerText}") did not match any known product — left unmapped`);
  }

  return { blocks, euBlock, dateCol, warnings };
}

// ── date parsing ─────────────────────────────────────────────────────────────────────────────────────

const EXCEL_1900_EPOCH_OFFSET_DAYS = 25569; // Excel serial 25569 == 1970-01-01 (per this pipeline's own
// documented convention — Excel's 1900 date system, off-by-one leap-year bug included since it is baked
// into every serial the real file would contain).
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
 * Walks every row of the sheet, keeps the ones with a parseable date in the date column (the verified
 * "a data row is identified by having a date in its leading column" rule — footer rows have no cell
 * there at all, so they are excluded by construction), and returns the latest `weeks` of them, most
 * recent first. Each EU-block column with a numeric price cell in a given row contributes to that
 * row's `prices`; a missing or non-numeric price cell for a mapped slug is a per-row warning, never a
 * fabricated value and never a thrown error (one missing cell must not sink the whole extraction).
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
    if (!isDataRow(row, dateCol)) continue; // footer / blank row — skipped by construction, not by index
    const dateCell = row.cells.find((c) => c.col === dateCol);
    const weekEnding = parseDateCell(dateCell, sharedStrings); // throws, named, if the value doesn't parse

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

  return dataRows.slice(-weeks).reverse(); // most recent first
}

/** Convenience wrapper: the single latest data row. Throws OilBulletinStructureError if there is none. */
export function extractLatestEuRow(sheetXml, sharedStrings, headerResolution) {
  const [latest] = extractEuSeries(sheetXml, sharedStrings, headerResolution, { weeks: 1 });
  if (!latest) throw new OilBulletinStructureError("no data row found (no row with a parseable date in the date column)");
  return latest;
}
