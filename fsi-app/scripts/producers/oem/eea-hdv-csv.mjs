// eea-hdv-csv.mjs -- the reader for the EEA heavy-duty vehicle CO2 monitoring extract (lane S8-E1, 2026-10-08).
//
// THE DATASET. EEA "CO2 emissions from heavy-duty vehicles", the vehicle-level extract
// HDV_CO2Emission_VehicleExtract_24042025.csv: one record per registered vehicle, 461 columns, quoted fields that
// can hold commas, a UTF-8 byte order mark and CRLF line ends, about 4 GB in total (Content-Length 4029364100 on
// 2026-10-08). Everything here is therefore a STREAM: csvRecords parses chunks as they arrive, aggregateHdvCsv folds
// the records into a few small groups and never holds the file. Pure apart from the iteration of its input; no fs,
// no network, no clock.
//
// WHAT IS READ. Eleven columns, named in EEA_HDV_COLUMNS, found by header name (never by position), so a reordered
// or widened extract still reads and a missing one is refused by name. The columns are the ones the committed real
// sample (fixtures/eea-hdv-sample.csv) shows: the manufacturer, the zero-emission / hybrid / dual-fuel flags, the
// engine and registration fuel types, the electric flag, the registration country and date, and the Match and
// UniqueData markers. The sample proves the value "Match" for Match and "Yes" for UniqueData; a record with any other
// value in either column is EXCLUDED and counted under its raw value ("Match=<value>", "UniqueData=<value>"), because
// what such a record means is not in the sample and is not guessed.
//
// WHAT IS NOT READ. No Wh/kg, no C-rate, no pack size and no announcement date exist in this extract; the
// oem_tech_roadmaps columns that need them stay NULL (eea-hdv-map.mjs).

export class EeaHdvFormatError extends Error {}

/** The columns the aggregator needs, by header name. */
export const EEA_HDV_COLUMNS = Object.freeze([
  "Match",
  "UniqueData",
  "OEM_ManufacturerName",
  "OEM_ZeroEmissionVehicle",
  "OEM_HybridElectricHDV",
  "OEM_DualFuelVehicle",
  "OEM_Engine_FuelType",
  "MS_FuelType",
  "MS_Electric",
  "MS_RegistrationCountry",
  "MS_RegistrationDateClean_YYYYMMDD",
]);

const UNQUOTED_STOP = /[,"\r\n]/g;

/**
 * An incremental RFC 4180 reader. push(text) returns the records completed by that text; end() returns the final
 * record, if any. A quote opens a quoted field only at the start of a field; inside quotes a doubled quote is one
 * quote and a comma or newline is data; a quote in the middle of an unquoted field is data. Blank lines are skipped.
 */
function makeParser({ dropTail }) {
  let field = "";
  let record = [];
  let inQuotes = false;
  let quoteSeen = false; // a quote inside a quoted field, waiting for the next char to say escape or close
  let pendingCR = false;
  let atStart = true;

  const endRecord = (out) => {
    if (record.length === 0 && field === "") return; // blank line
    record.push(field);
    field = "";
    out.push(record);
    record = [];
  };

  return {
    push(text) {
      const out = [];
      const n = text.length;
      if (n === 0) return out;
      let i = 0;
      if (atStart) {
        atStart = false;
        if (text.charCodeAt(0) === 0xfeff) i = 1;
      }
      while (i < n) {
        if (inQuotes) {
          if (quoteSeen) {
            if (text[i] === '"') { field += '"'; quoteSeen = false; i += 1; continue; }
            inQuotes = false; // the quote closed the field; this char is read as unquoted
            quoteSeen = false;
          } else {
            const q = text.indexOf('"', i);
            if (q === -1) { field += text.slice(i); i = n; continue; }
            field += text.slice(i, q);
            quoteSeen = true;
            i = q + 1;
            continue;
          }
        }
        if (pendingCR) {
          pendingCR = false;
          if (text[i] === "\n") { i += 1; continue; }
        }
        const ch = text[i];
        if (ch === ",") { record.push(field); field = ""; i += 1; continue; }
        if (ch === "\n") { endRecord(out); i += 1; continue; }
        if (ch === "\r") { endRecord(out); pendingCR = true; i += 1; continue; }
        if (ch === '"' && field === "") { inQuotes = true; i += 1; continue; }
        UNQUOTED_STOP.lastIndex = i;
        const m = UNQUOTED_STOP.exec(text);
        const j = m ? m.index : n;
        if (j === i) { field += ch; i += 1; continue; } // a quote in the middle of an unquoted field is data
        field += text.slice(i, j);
        i = j;
      }
      return out;
    },
    end() {
      if (inQuotes && !quoteSeen) {
        if (dropTail()) return [];
        throw new EeaHdvFormatError("unterminated quoted field at the end of the input");
      }
      if (record.length === 0 && field === "") return [];
      if (dropTail()) return [];
      record.push(field);
      const last = record;
      record = [];
      field = "";
      return [last];
    },
  };
}

/**
 * Stream the records of a CSV body. `chunks` is any sync or async iterable of strings or byte arrays; a chunk
 * boundary may fall anywhere, inside a quote, a CRLF or a multibyte character. `dropTail` (a boolean, or a function
 * read at the end of the input) omits a final record that has no terminating newline, which is what a byte-limited
 * read must do so a half record is never counted.
 * @returns {AsyncGenerator<string[]>}
 */
export async function* csvRecords(chunks, { dropTail = false } = {}) {
  const decoder = new TextDecoder("utf-8");
  const parser = makeParser({ dropTail: typeof dropTail === "function" ? dropTail : () => dropTail });
  for await (const chunk of chunks) {
    const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    for (const r of parser.push(text)) yield r;
  }
  const rest = decoder.decode();
  if (rest) for (const r of parser.push(rest)) yield r;
  for (const r of parser.end()) yield r;
}

/** Pass chunks through until `maxBytes` have been read; cut the chunk that crosses the limit and say so in `state`. */
async function* limitBytes(chunks, maxBytes, state) {
  let total = 0;
  for await (const c of chunks) {
    const buf = typeof c === "string" ? Buffer.from(c, "utf8") : c;
    if (total + buf.length > maxBytes) {
      yield buf.subarray(0, maxBytes - total);
      state.truncated = true;
      return;
    }
    total += buf.length;
    yield buf;
  }
}

const DATE_RE = /^(19|20)\d{6}$/;

/**
 * Fold the extract into groups: one per distinct (manufacturer, zero-emission flag, hybrid flag, dual-fuel flag,
 * engine fuel, registration fuel, electric flag), with the number of vehicles, the vehicles per registration year (units_by_year; undated_units counts those with no parseable date), the first and last registration date
 * seen (YYYYMMDD strings, null when none parsed) and the registration countries.
 *
 * @param {AsyncIterable<string|Uint8Array>|Iterable<string|Uint8Array>} chunks
 * @param {{ maxBytes?: number }} [opts] stop after this many bytes; the half record at the cut is dropped and the
 *   result is marked truncated, which the producer treats as unfit to apply
 * @returns {Promise<{ truncated: boolean, totals: { records: number, counted: number, excluded: Record<string, number>, malformed: number }, groups: object[] }>}
 */
export async function aggregateHdvCsv(chunks, { maxBytes } = {}) {
  const state = { truncated: false };
  const source = maxBytes ? limitBytes(chunks, maxBytes, state) : chunks;
  const totals = { records: 0, counted: 0, excluded: {}, malformed: 0 };
  const groups = new Map();
  let header = null;
  let col = null;

  for await (const rec of csvRecords(source, { dropTail: () => state.truncated })) {
    if (header === null) {
      header = rec;
      col = Object.fromEntries(EEA_HDV_COLUMNS.map((name) => [name, header.indexOf(name)]));
      const missing = EEA_HDV_COLUMNS.filter((name) => col[name] === -1);
      if (missing.length) {
        throw new EeaHdvFormatError(`the header has no column ${missing.join(", ")}: this is not the EEA HDV vehicle extract this producer reads`);
      }
      continue;
    }
    totals.records += 1;
    if (rec.length !== header.length) { totals.malformed += 1; continue; }

    const match = rec[col.Match];
    if (match !== "Match") { const k = `Match=${match}`; totals.excluded[k] = (totals.excluded[k] ?? 0) + 1; continue; }
    const unique = rec[col.UniqueData];
    if (unique !== "Yes") { const k = `UniqueData=${unique}`; totals.excluded[k] = (totals.excluded[k] ?? 0) + 1; continue; }

    totals.counted += 1;
    const g = {
      manufacturer: rec[col.OEM_ManufacturerName],
      zev: rec[col.OEM_ZeroEmissionVehicle],
      hybrid: rec[col.OEM_HybridElectricHDV],
      dual_fuel: rec[col.OEM_DualFuelVehicle],
      engine_fuel: rec[col.OEM_Engine_FuelType],
      ms_fuel: rec[col.MS_FuelType],
      ms_electric: rec[col.MS_Electric],
    };
    const key = Object.values(g).join("\u0000");
    let agg = groups.get(key);
    if (!agg) {
      agg = { ...g, units: 0, units_by_year: {}, undated_units: 0, first_registration: null, last_registration: null, countries: new Set() };
      groups.set(key, agg);
    }
    agg.units += 1;
    const date = rec[col.MS_RegistrationDateClean_YYYYMMDD];
    if (DATE_RE.test(date)) {
      const year = date.slice(0, 4);
      agg.units_by_year[year] = (agg.units_by_year[year] ?? 0) + 1;
      if (agg.first_registration === null || date < agg.first_registration) agg.first_registration = date;
      if (agg.last_registration === null || date > agg.last_registration) agg.last_registration = date;
    } else {
      agg.undated_units += 1;
    }
    const country = rec[col.MS_RegistrationCountry];
    if (country) agg.countries.add(country);
  }

  if (header === null) throw new EeaHdvFormatError("the body is empty: no header record");

  const list = [...groups.values()]
    .map((a) => ({ ...a, countries: [...a.countries].sort() }))
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.zev.localeCompare(b.zev) || a.engine_fuel.localeCompare(b.engine_fuel) || a.ms_fuel.localeCompare(b.ms_fuel));
  return { truncated: state.truncated, totals, groups: list };
}
