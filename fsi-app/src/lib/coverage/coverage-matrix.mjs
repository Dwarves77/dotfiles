// coverage-matrix.mjs: the generated Coverage surface, pure half (lane COV-1, 2026-10-08).
//
// Spec 00 section 4 asks for a first-class Coverage surface: mode x geography x data class, with a numerator
// and a denominator in every cell, versioned, dated, publicly linkable, exportable, and GENERATED from the
// data rather than hand-written. This module is the generator. It takes the entries `getCoverageIndex` /
// `getCoverageEntries` (src/lib/coverage/index-data.ts) already produce and builds the matrix, the per-cell
// links, the view for one query, and the CSV. It reads no database and no clock: the entries and the
// generation instant come in as arguments, so every property below is provable with `node --test`.
//
// WHAT THE NUMBERS MEAN (stated on the page too, from DEFINITIONS below):
//   denominator  instruments the discovery census catalogued as relevant, in that cell (census_worklist
//                would_mint). A catalogued instrument is a pointer, not a grounded brief.
//   numerator    those whose identity resolved to a registered primary source AND that scored firm-core
//                relevance: the index's own "dual-verified" set. Still a pointer. The count of grounded,
//                verified briefs is a separate platform-wide figure (`verifiedBriefs`) and is never mixed in.
//
// THE AXES. Data class is the surface the instrument is tagged to (regulations, operations, market_intel,
// research; an instrument with no tag is its own class, never dropped). Geography is the instrument's
// jurisdiction (an instrument with none is its own bucket). Mode is the transport mode of the instrument's
// SOURCE (sources.transport_modes, read by index-data.ts since COV-1): an instrument whose source carries no mode
// falls in the `untagged` mode, which the page names as a gap instead of inventing a split. An instrument that
// serves two modes is counted once in each mode and once in the "all modes" cell.
//
// PLAIN ESM, relative imports only (the no-npm test glob).

import { TRANSPORT_MODES, normaliseMode } from "../contracts/vocabularies.mjs";

export const MATRIX_SCHEMA_VERSION = 1;

/** The "no filter" token for each axis. */
export const ALL = "all";
export const UNTAGGED = "untagged";
export const UNKNOWN_GEOGRAPHY = "UNKNOWN"; // upper case like every geography code, so a link round trips through parseCoverageQuery

/** Data classes in display order. Mirrors COVERAGE_SURFACES in index-data.ts (a test asserts they agree). */
export const DATA_CLASSES = Object.freeze([
  { code: "regulations", label: "Regulations" },
  { code: "operations", label: "Operations" },
  { code: "market_intel", label: "Market Intel" },
  { code: "research", label: "Research" },
]);
const UNTAGGED_CLASS = Object.freeze({ code: UNTAGGED, label: "Not tagged to a surface" });
const UNTAGGED_MODE = Object.freeze({ code: UNTAGGED, label: "Mode not tagged" });

export const DEFINITIONS = Object.freeze({
  denominator:
    "Instruments the discovery census catalogued as relevant to freight sustainability, in this cell. A catalogued instrument is a pointer to a primary source, not a grounded brief.",
  numerator:
    "Catalogued instruments whose identity resolved to a registered primary source and that scored firm-core relevance (dual-verified). Still a pointer, not a grounded brief.",
  numerator_one_line:
    "A cell's figure is the catalogued instruments that are dual-verified (firm-core relevance and a resolved, registered primary source) over all instruments catalogued in that cell.",
  verified_briefs:
    "Grounded, verified briefs on the platform, counted separately and never mixed into the cells.",
  untagged_mode:
    "An instrument takes the transport modes its source carries in the registry; one whose source carries none sits in the untagged mode.",
});

const DATA_CLASS_CODES = new Set(DATA_CLASSES.map((c) => c.code));

/** An entry is in the numerator when it is dual-verified: firm-core relevance AND identity verified. */
export function isNumerator(entry) {
  return entry.relevance === "firm" && entry.identity === "verified";
}

function classesOf(entry) {
  const known = Array.isArray(entry.surfaces) ? entry.surfaces.filter((s) => DATA_CLASS_CODES.has(s)) : [];
  return known.length ? [...new Set(known)] : [UNTAGGED];
}

function modesOf(entry) {
  const raw = Array.isArray(entry.modes) ? entry.modes : [];
  const canon = [...new Set(raw.map((m) => normaliseMode(m)).filter((m) => m && m !== "multimodal"))];
  return canon.length ? canon : [UNTAGGED];
}

function geographyOf(entry) {
  const j = typeof entry.jurisdiction === "string" ? entry.jurisdiction.trim().toUpperCase() : "";
  return j || UNKNOWN_GEOGRAPHY;
}

export const cellKey = (mode, dataClass, geography) => `${mode}|${dataClass}|${geography}`;

/** FNV-1a 32-bit, hex. Deterministic, dependency-free, client-safe: the matrix version is a content hash. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function bump(map, key, isNum) {
  const cur = map.get(key) ?? { numerator: 0, denominator: 0 };
  cur.denominator += 1;
  if (isNum) cur.numerator += 1;
  map.set(key, cur);
}

/**
 * Build the matrix.
 *
 * @param {Array<{id?: string, jurisdiction: string|null, surfaces: string[], relevance: string, identity: string,
 *                modes?: string[], checkedAt?: string|null}>} entries
 * @param {{ generatedAt: string, verifiedBriefs?: number|null, labelOf?: (code: string) => string }} options
 */
export function buildCoverageMatrix(entries, options) {
  const generatedAt = options?.generatedAt;
  if (typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("buildCoverageMatrix needs a valid generatedAt ISO instant (the clock is injected, never read)");
  }
  const labelOf = typeof options.labelOf === "function" ? options.labelOf : (c) => c;
  const list = Array.isArray(entries) ? entries : [];

  const cells = new Map(); // (mode|class|geo) -> counts, including mode "all"
  const byGeo = new Map();
  const byClass = new Map();
  const byMode = new Map();
  let taggedMode = 0;
  let numeratorTotal = 0;
  let asOf = null;

  for (const e of list) {
    const num = isNumerator(e);
    const classes = classesOf(e);
    const modes = modesOf(e);
    const geo = geographyOf(e);
    if (num) numeratorTotal += 1;
    if (!(modes.length === 1 && modes[0] === UNTAGGED)) taggedMode += 1;
    if (typeof e.checkedAt === "string" && !Number.isNaN(Date.parse(e.checkedAt))) {
      if (asOf === null || Date.parse(e.checkedAt) > Date.parse(asOf)) asOf = e.checkedAt;
    }
    bump(byGeo, geo, num);
    for (const c of classes) {
      bump(byClass, c, num);
      bump(cells, cellKey(ALL, c, geo), num);
      for (const m of modes) bump(cells, cellKey(m, c, geo), num);
    }
    for (const m of modes) bump(byMode, m, num);
  }

  const classOrder = [...DATA_CLASSES, UNTAGGED_CLASS].filter((c) => byClass.has(c.code));
  const modeOrder = [
    ...Object.values(TRANSPORT_MODES).filter((m) => byMode.has(m.code)).sort((a, b) => a.order - b.order).map((m) => ({ code: m.code, label: m.label })),
    ...(byMode.has(UNTAGGED) ? [UNTAGGED_MODE] : []),
  ];
  const geographies = [...byGeo.entries()]
    .map(([code, c]) => ({
      code,
      label: code === UNKNOWN_GEOGRAPHY ? "Jurisdiction not recorded" : labelOf(code),
      numerator: c.numerator,
      denominator: c.denominator,
    }))
    .sort((a, b) => b.denominator - a.denominator || a.label.localeCompare(b.label));

  const cellList = [...cells.entries()]
    .map(([key, c]) => {
      const [mode, dataClass, geography] = key.split("|");
      return { key, mode, dataClass, geography, numerator: c.numerator, denominator: c.denominator };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const canonical = cellList.map((c) => `${c.key}=${c.numerator}/${c.denominator}`).join(";");

  return {
    schemaVersion: MATRIX_SCHEMA_VERSION,
    version: `cv${MATRIX_SCHEMA_VERSION}-${fnv1a(canonical)}`,
    generatedAt,
    dataAsOf: asOf,
    totals: { numerator: numeratorTotal, denominator: list.length },
    verifiedBriefs: Number.isFinite(options.verifiedBriefs) ? options.verifiedBriefs : null,
    modeTagging: { tagged: taggedMode, total: list.length },
    dataClasses: classOrder.map((c) => ({ ...c, ...byClass.get(c.code) })),
    modes: modeOrder.map((m) => ({ ...m, ...byMode.get(m.code) })),
    geographies,
    cells: cellList,
    definitions: DEFINITIONS,
  };
}

/** A matrix with nothing in it, for a read that failed or an empty census. Same shape, so callers never branch on shape. */
export function emptyCoverageMatrix(generatedAt) {
  return buildCoverageMatrix([], { generatedAt });
}

// ─────────────────────────────── query, links, view ───────────────────────────────

const QUERY_KEYS = Object.freeze({ mode: "mode", dataClass: "data_class", geography: "geography" });

function pick(params, key) {
  const v = typeof params?.get === "function" ? params.get(key) : params?.[key];
  const one = Array.isArray(v) ? v[0] : v;
  return typeof one === "string" && one.trim() ? one.trim() : null;
}

/** Parse the three axes from URLSearchParams or a plain object (Next searchParams). Missing means "all". */
export function parseCoverageQuery(params) {
  const mode = pick(params, QUERY_KEYS.mode);
  const dataClass = pick(params, QUERY_KEYS.dataClass);
  const geography = pick(params, QUERY_KEYS.geography);
  return {
    mode: mode ? (normaliseMode(mode) ?? mode.toLowerCase()) : ALL,
    dataClass: dataClass ? dataClass.toLowerCase() : ALL,
    geography: geography ? geography.toUpperCase() : ALL,
  };
}

/** The static, linkable URL for a query. Only non-default axes appear, so the all-view is just `/dashboard/coverage`. */
export function coverageHref(query = {}, base = "/dashboard/coverage") {
  const sp = [];
  if (query.mode && query.mode !== ALL) sp.push(`${QUERY_KEYS.mode}=${encodeURIComponent(query.mode)}`);
  if (query.dataClass && query.dataClass !== ALL) sp.push(`${QUERY_KEYS.dataClass}=${encodeURIComponent(query.dataClass)}`);
  if (query.geography && query.geography !== ALL) sp.push(`${QUERY_KEYS.geography}=${encodeURIComponent(query.geography)}`);
  return sp.length ? `${base}?${sp.join("&")}` : base;
}

function sumCells(cells) {
  return cells.reduce((a, c) => ({ numerator: a.numerator + c.numerator, denominator: a.denominator + c.denominator }), { numerator: 0, denominator: 0 });
}

/**
 * The view for one query: which geography rows to show, each with one cell per data-class column, and the
 * state of the selected cell. A cell with no catalogued instrument is `present: false`: a real gap that the
 * page renders as the "not covered" state with a request action, never as a zero.
 */
export function buildCoverageView(matrix, query) {
  const q = { mode: query?.mode ?? ALL, dataClass: query?.dataClass ?? ALL, geography: query?.geography ?? ALL };
  const index = new Map(matrix.cells.map((c) => [c.key, c]));
  const modeKnown = q.mode === ALL || matrix.modes.some((m) => m.code === q.mode);
  const classKnown = q.dataClass === ALL || matrix.dataClasses.some((c) => c.code === q.dataClass);
  const geoKnown = q.geography === ALL || matrix.geographies.some((g) => g.code === q.geography);

  const columns = q.dataClass === ALL ? matrix.dataClasses : matrix.dataClasses.filter((c) => c.code === q.dataClass);
  const geoRows = q.geography === ALL ? matrix.geographies : matrix.geographies.filter((g) => g.code === q.geography);

  const rows = geoRows.map((g) => {
    const cells = columns.map((c) => {
      const hit = index.get(cellKey(q.mode, c.code, g.code));
      const cellQuery = { mode: q.mode, dataClass: c.code, geography: g.code };
      return {
        dataClass: c.code,
        dataClassLabel: c.label,
        present: !!hit,
        numerator: hit ? hit.numerator : 0,
        denominator: hit ? hit.denominator : 0,
        href: coverageHref(cellQuery),
        query: cellQuery,
      };
    });
    return { geography: g.code, label: g.label, cells, ...sumCells(cells.filter((c) => c.present)) };
  }).filter((r) => r.cells.some((c) => c.present) || q.geography !== ALL);

  const selected =
    q.dataClass !== ALL && q.geography !== ALL
      ? (() => {
          const hit = index.get(cellKey(q.mode, q.dataClass, q.geography));
          return {
            query: q,
            present: !!hit,
            numerator: hit ? hit.numerator : 0,
            denominator: hit ? hit.denominator : 0,
            validAxes: modeKnown && classKnown && geoKnown,
          };
        })()
      : null;

  const scoped = sumCells(rows.flatMap((r) => r.cells.filter((c) => c.present)));
  return { query: q, validAxes: modeKnown && classKnown && geoKnown, columns, rows, selected, scoped };
}

// ─────────────────────────────────── export ───────────────────────────────────

const CSV_COLUMNS = Object.freeze(["version", "generated_at", "data_as_of", "mode", "data_class", "geography_code", "geography", "numerator", "denominator"]);

function csvEscape(value) {
  let s = value === null || value === undefined ? "" : String(value);
  // Spreadsheet formula injection: a cell that starts with = + - @ is read as a formula. Labels are ours, but the
  // export is a public artefact, so the guard is unconditional.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The CSV for a query. Provenance travels as COLUMNS (version, generated_at, data_as_of), not as a comment line,
 * so it survives a spreadsheet round trip (spec 00 section 3.6: it survives export as a column).
 * Rows are the cells whose mode equals the query's mode (the "all" mode by default).
 */
export function matrixToCsv(matrix, query) {
  const q = { mode: query?.mode ?? ALL, dataClass: query?.dataClass ?? ALL, geography: query?.geography ?? ALL };
  const classLabel = new Map(matrix.dataClasses.map((c) => [c.code, c.label]));
  const geoLabel = new Map(matrix.geographies.map((g) => [g.code, g.label]));
  const modeLabel = new Map([[ALL, "All modes"], ...matrix.modes.map((m) => [m.code, m.label])]);
  const rows = matrix.cells
    .filter((c) => c.mode === q.mode && (q.dataClass === ALL || c.dataClass === q.dataClass) && (q.geography === ALL || c.geography === q.geography))
    .sort((a, b) => b.denominator - a.denominator || (a.key < b.key ? -1 : 1));
  const lines = [CSV_COLUMNS.join(",")];
  for (const c of rows) {
    lines.push(
      [
        matrix.version,
        matrix.generatedAt,
        matrix.dataAsOf ?? "not recorded",
        modeLabel.get(c.mode) ?? c.mode,
        classLabel.get(c.dataClass) ?? c.dataClass,
        c.geography,
        geoLabel.get(c.geography) ?? c.geography,
        c.numerator,
        c.denominator,
      ].map(csvEscape).join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** The download name for a query's CSV. */
export function csvFilename(matrix, query) {
  const part = (v) => (v && v !== ALL ? String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-") : null);
  const bits = ["coverage", part(query?.dataClass), part(query?.geography), part(query?.mode), matrix.generatedAt.slice(0, 10)].filter(Boolean);
  return `${bits.join("-")}.csv`;
}

// ──────────────────────────── one-line denominators ────────────────────────────

/**
 * The denominator line a surface shows: numerator and denominator beside each other, the separate verified-brief
 * count, and the link to the cell. `counts` is the CoverageCounts getCoverageIndex(surface) returns.
 */
export function surfaceDenominator(surface, counts) {
  const cls = DATA_CLASSES.find((c) => c.code === surface);
  if (!cls || !counts || !Number.isFinite(counts.total)) return null;
  return {
    surface,
    label: cls.label,
    numerator: counts.dualVerified ?? 0,
    denominator: counts.total,
    verifiedBriefs: Number.isFinite(counts.verifiedBriefs) ? counts.verifiedBriefs : null,
    href: coverageHref({ dataClass: surface }),
  };
}

const n = (v) => Number(v).toLocaleString("en-US");

export function formatDenominatorLine(d) {
  const briefs = d.verifiedBriefs === null ? "" : ` ${n(d.verifiedBriefs)} verified briefs are on the platform.`;
  return `Coverage: ${n(d.numerator)} of ${n(d.denominator)} catalogued ${d.label} instruments are dual-verified.${briefs}`;
}

/** The portfolio-add line: coverage of the cell the thing being added sits in. */
export function formatPortfolioCoverageLine(d) {
  return `Coverage for this: ${n(d.numerator)} of ${n(d.denominator)} catalogued ${d.label} instruments are dual-verified.`;
}
