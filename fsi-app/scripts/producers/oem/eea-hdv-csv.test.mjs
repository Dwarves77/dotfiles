// eea-hdv-csv.test.mjs -- lane S8-E1. Proves the streaming CSV reader and the aggregator for the EEA heavy-duty
// vehicle CO2 monitoring extract, against the committed real sample (fixtures/eea-hdv-sample.csv, header beside it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { csvRecords, aggregateHdvCsv, EEA_HDV_COLUMNS, EeaHdvFormatError } from "./eea-hdv-csv.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(join(HERE, "fixtures", "eea-hdv-sample.csv"));

async function collect(iter) {
  const out = [];
  for await (const r of iter) out.push(r);
  return out;
}

/** Split a Buffer into chunks of `n` bytes (the chunk boundary can fall inside a quote, a CRLF or a multibyte char). */
function* chunksOf(buf, n) {
  for (let i = 0; i < buf.length; i += n) yield buf.subarray(i, i + n);
}

test("csvRecords: quotes, doubled quotes, commas and newlines inside quotes, CRLF and LF, BOM, no final newline", async () => {
  const text = "﻿a,b,c\r\n1,\"x,y\",3\r\n4,\"line1\r\nline2\",\"he said \"\"hi\"\"\"\n7,8,9";
  const recs = await collect(csvRecords([text]));
  assert.deepEqual(recs, [
    ["a", "b", "c"],
    ["1", "x,y", "3"],
    ["4", "line1\r\nline2", "he said \"hi\""],
    ["7", "8", "9"],
  ]);
});

test("csvRecords: the result does not depend on where the chunk boundaries fall (every split size 1..13 bytes, multibyte char included)", async () => {
  const text = "﻿name,addr\r\nMüller,\"a,\r\nb\"\r\nplain,x\r\n";
  const whole = await collect(csvRecords([Buffer.from(text, "utf8")]));
  assert.equal(whole.length, 3);
  for (let n = 1; n <= 13; n++) {
    const split = await collect(csvRecords(chunksOf(Buffer.from(text, "utf8"), n)));
    assert.deepEqual(split, whole, `chunk size ${n}`);
  }
});

test("csvRecords: dropTail omits an unterminated last record (a byte-limited read never counts a half record)", async () => {
  const recs = await collect(csvRecords(["a,b\r\n1,2\r\n3,"], { dropTail: true }));
  assert.deepEqual(recs, [["a", "b"], ["1", "2"]]);
  const kept = await collect(csvRecords(["a,b\r\n1,2\r\n3,"]));
  assert.deepEqual(kept, [["a", "b"], ["1", "2"], ["3", ""]]);
});

test("the real sample parses to one header of 461 columns and 71 equally wide records", async () => {
  const recs = await collect(csvRecords(chunksOf(SAMPLE, 4096)));
  assert.equal(recs.length, 72);
  assert.equal(recs[0].length, 461);
  assert.equal(recs[0][0], "Match", "the BOM is stripped from the first header cell");
  assert.ok(recs.slice(1).every((r) => r.length === 461), "every record has the header's width, quoted commas included");
});

test("aggregateHdvCsv: the real sample is 71 matched unique vehicles of one manufacturer, none zero-emission", async () => {
  const out = await aggregateHdvCsv(chunksOf(SAMPLE, 8192));
  assert.equal(out.truncated, false);
  assert.equal(out.totals.records, 71);
  assert.equal(out.totals.counted, 71);
  assert.deepEqual(out.totals.excluded, {});
  assert.equal(out.groups.length, 1);
  const [g] = out.groups;
  assert.equal(g.manufacturer, "DAF Trucks N.V.");
  assert.equal(g.zev, "No");
  assert.equal(g.hybrid, "No");
  assert.equal(g.dual_fuel, "No");
  assert.equal(g.engine_fuel, "Diesel CI");
  assert.equal(g.ms_fuel, "Diesel");
  assert.equal(g.ms_electric, "No");
  assert.equal(g.units, 71);
  assert.deepEqual(g.countries, ["AT", "BE", "DE", "FR", "IT", "NL", "RO"]);
  assert.deepEqual(Object.keys(g.units_by_year).sort(), ["2022", "2023"], "registrations are counted per registration year");
  assert.equal(Object.values(g.units_by_year).reduce((a, b) => a + b, 0), 71);
  assert.equal(g.undated_units, 0);
  assert.match(g.first_registration, /^2022\d{4}$/);
  assert.match(g.last_registration, /^2023\d{4}$/);
  assert.ok(g.first_registration <= g.last_registration);
});

test("aggregateHdvCsv: groups by every powertrain column, sums units, and excludes rows that are not a matched unique record", async () => {
  const cols = EEA_HDV_COLUMNS;
  const head = cols.join(",");
  const row = (o) => cols.map((c) => o[c] ?? "").join(",");
  const base = { Match: "Match", UniqueData: "Yes", OEM_ManufacturerName: "Acme AG", OEM_ZeroEmissionVehicle: "No", OEM_HybridElectricHDV: "No", OEM_DualFuelVehicle: "No", OEM_Engine_FuelType: "Diesel CI", MS_FuelType: "Diesel", MS_Electric: "No", MS_RegistrationCountry: "DE", MS_RegistrationDateClean_YYYYMMDD: "20220101" };
  const text = [
    head,
    row(base),
    row({ ...base, MS_RegistrationDateClean_YYYYMMDD: "20230630", MS_RegistrationCountry: "FR" }),
    row({ ...base, OEM_Engine_FuelType: "NG PI" }),
    row({ ...base, UniqueData: "No" }),
    row({ ...base, Match: "Only OEM" }),
    row({ ...base, MS_RegistrationDateClean_YYYYMMDD: "not-a-date" }),
    "short,row",
  ].join("\r\n");
  const out = await aggregateHdvCsv([text]);
  assert.equal(out.totals.records, 7);
  assert.equal(out.totals.counted, 4);
  assert.deepEqual(out.totals.excluded, { "UniqueData=No": 1, "Match=Only OEM": 1 });
  assert.equal(out.totals.malformed, 1, "a record narrower than the header is counted, never guessed at");
  const diesel = out.groups.find((g) => g.engine_fuel === "Diesel CI");
  assert.equal(diesel.units, 3);
  assert.equal(diesel.first_registration, "20220101");
  assert.equal(diesel.last_registration, "20230630", "an unparseable date is ignored for the range, the unit still counts");
  assert.deepEqual(diesel.units_by_year, { 2022: 1, 2023: 1 });
  assert.equal(diesel.undated_units, 1, "a unit with no parseable date counts in units and in no year");
  assert.equal(out.groups.find((g) => g.engine_fuel === "NG PI").units, 1);
});

test("aggregateHdvCsv: a header missing a needed column is refused by name, with nothing aggregated", async () => {
  await assert.rejects(aggregateHdvCsv(["Match,UniqueData\r\n1,2\r\n"]), (e) => {
    assert.ok(e instanceof EeaHdvFormatError);
    assert.match(e.message, /OEM_ManufacturerName/);
    assert.match(e.message, /OEM_ZeroEmissionVehicle/);
    return true;
  });
  await assert.rejects(aggregateHdvCsv([""]), EeaHdvFormatError, "an empty body is a format error, not zero vehicles");
});

test("aggregateHdvCsv: maxBytes stops the read, drops the half record and says the result is truncated", async () => {
  const full = await aggregateHdvCsv(chunksOf(SAMPLE, 1000));
  const cut = await aggregateHdvCsv(chunksOf(SAMPLE, 1000), { maxBytes: 20000 });
  assert.equal(cut.truncated, true);
  assert.ok(cut.totals.records > 0 && cut.totals.records < full.totals.records, `${cut.totals.records} of ${full.totals.records}`);
  assert.equal(cut.groups[0].units, cut.totals.counted);
});
