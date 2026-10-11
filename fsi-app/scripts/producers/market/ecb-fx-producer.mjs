#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";
// DAG authorship at write time (lane W4-DAG, 2026-09-06: "market_series has no edges" — the W3-W4
// plan-completion audit's own finding). See author-market-series-delta.mjs's own header for the full
// contract; this producer is the wiring, not a second implementation.
import { authorMarketSeriesDeltaEdges, assertEdgesAuthoredAndRecordSummary } from "./author-market-series-delta.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";

const PRODUCER_NAME = "ecb-fx";

// ── Gate 1: the reviewed-code-change switch. False at authorship (lane P2); flipped TRUE 2026-09-02 by
// Lane PROD (system-completion train) in the same commit as migration 281 — see the REVIEWED-CHANGE LOG
// above for what this does and does not authorise. Gate 2 (the runtime kill switch) still defaults off.
const ENABLED = true;

const KILL_SWITCH_ENV = "MARKET_PRODUCER_ECB_FX_ENABLED";
const REGISTRY_ENTRY = producerFor("ecb-fx");

const ECB_XML_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

// The registry's own notes, verbatim closed set — see header. code -> display label.
export const CURRENCIES = Object.freeze({
  USD: "US dollar",
  GBP: "Pound sterling",
  CNY: "Chinese yuan renminbi",
  JPY: "Japanese yen",
});

loadLocalEnvFile();

// ── Attribute parsing, QUOTE- AND ORDER-AGNOSTIC. ──────────────────────────────────────────────────────
// REGRESSION, STATED PLAINLY (producers run #22, 2026-09-04 00:50 UTC): the previous revision of this
// parser matched attributes with a literal `="..."` (double-quote-only) pattern and a fixed
// currency-then-rate attribute order. The LIVE document (fetched by the coordinator from a GitHub
// Codespace, 2026-09-04 00:58 UTC, HTTP 200, text/xml, 1547 bytes, plain curl, no special headers) uses
// SINGLE-quoted attributes and tab indentation — `<Cube time='2026-09-03'>`, `<Cube currency='USD'
// rate='1.1615'/>` — which the double-quote-only regex never matches at all. XML 1.0 (and this document)
// permits either quote character per attribute; the parser's assumption that ECB always uses one specific
// style was never a documented fact, just an unverified guess baked into the regex literal. Run #22's own
// evidence: "[parse] no <Cube time=\"YYYY-MM-DD\"> element found" / "parsed 0 row(s), 1 warning(s)" /
// "nothing to plan — exiting" — a clean, honest refusal (never a fabricated row), but wrong: the document
// WAS a valid ECB daily-rates document, just quoted differently than the regex assumed.
// FIX: parse each <Cube ...> tag's attributes into a name -> value map, accepting EITHER quote character
// per attribute (a single document may even mix styles, harmlessly) and ANY attribute order — never
// re-introducing a fixed "currency then rate" or "this exact quote char" assumption. ATTR_RE below is the
// same "extract raw attrs, then read named keys out of the map regardless of order" shape
// oil-bulletin-workbook.mjs already uses for OOXML attribute parsing (Id=/Target=/name=/r:id=/r=/t=) —
// applied here because the earlier fixed-pattern approach is exactly what broke on ECB's real formatting.
const ATTR_RE = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** @param {string} attrString raw text between a tag's name and its closing `>`/`/>` @returns {Record<string,string>} */
function parseTagAttrs(attrString) {
  const attrs = {};
  for (const m of String(attrString ?? "").matchAll(ATTR_RE)) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return attrs;
}

// Every opening <Cube ...> tag (self-closing or not) — attribute TEXT captured raw; parseTagAttrs above
// reads named attributes out of it quote- and order-agnostically. Matches the bare wrapper <Cube>, the
// dated <Cube time='...'>, and each self-closing <Cube currency='...' rate='...'/> alike; each is told
// apart below by WHICH named attributes it actually carries, never by tag position.
const CUBE_TAG_RE = /<Cube\b([^>]*)>/g;

// Envelope-authenticity checks — kept, not weakened, by the quote-agnostic rewrite above: a document still
// has to carry the ECB's gesmes namespace, name its sender as the European Central Bank, and carry EXACTLY
// ONE dated <Cube time="..."> (never zero, never more than one — this producer reads only the single daily
// -rates document, never ECB's separate multi-day history file, see header) before any currency row is
// trusted. Namespace/date-attribute quoting is itself quote-agnostic (single OR double), same rule as
// every other attribute in this file.
const GESMES_NAMESPACE_RE = /xmlns:gesmes\s*=\s*(?:"http:\/\/www\.gesmes\.org\/xml\/2002-08-01"|'http:\/\/www\.gesmes\.org\/xml\/2002-08-01')/;
const SENDER_NAME_RE = /<gesmes:name>\s*European Central Bank\s*<\/gesmes:name>/;
const DATE_VALUE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CCY_CODE_RE = /^[A-Z]{3}$/;

/**
 * Parse the ECB daily reference-rate XML into market_series-shaped rows. Pure — no fs, no fetch, no
 * clock read (as_at_date/reference_period come from the document's own <Cube time="..."> date).
 *
 * @param {string} xmlText
 * @returns {{ rows: Array<object>, warnings: string[] }}
 */
export function parseEcbFxXml(xmlText) {
  const warnings = [];
  const text = String(xmlText ?? "");

  // ORDER, DELIBERATE: locate the dated Cube(s) FIRST — a document with no Cube tags at all (e.g. empty
  // input) is most usefully diagnosed as "no dated Cube found" rather than "no gesmes namespace", even
  // though both are technically true; a document that DOES have a well-formed, singular dated Cube but is
  // missing the envelope-identity markers is then diagnosed specifically (namespace, then sender) below —
  // see the malformed-document tests in market-ecb-fx-parser.test.mjs for both classes.
  const dateCubeValues = [];
  const currencyCubeAttrs = [];
  for (const m of text.matchAll(CUBE_TAG_RE)) {
    const attrs = parseTagAttrs(m[1]);
    if (attrs.time !== undefined) dateCubeValues.push(attrs.time);
    else if (attrs.currency !== undefined) currencyCubeAttrs.push(attrs);
  }

  if (dateCubeValues.length === 0) {
    return { rows: [], warnings: ['no <Cube time="YYYY-MM-DD"> element found — not a recognisable ECB daily-rates document'] };
  }
  if (dateCubeValues.length > 1) {
    return {
      rows: [],
      warnings: [
        `${dateCubeValues.length} dated <Cube time="..."> elements found (${dateCubeValues.join(", ")}) — expected exactly one; this ` +
          "producer reads only the single daily-rates document, never ECB's separate multi-day history file",
      ],
    };
  }

  // Envelope-authenticity checks — kept, not weakened, by the quote-agnostic rewrite: a document that
  // merely LOOKS like the ECB shape (has a lone dated Cube) still has to carry the ECB's gesmes namespace
  // and name its sender as the European Central Bank before any currency row is trusted.
  if (!GESMES_NAMESPACE_RE.test(text)) {
    return {
      rows: [],
      warnings: [
        'no xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" namespace declaration found — not a recognisable ECB daily-rates document',
      ],
    };
  }
  if (!SENDER_NAME_RE.test(text)) {
    return {
      rows: [],
      warnings: ["no <gesmes:name>European Central Bank</gesmes:name> sender element found — not a recognisable ECB daily-rates document"],
    };
  }

  const rawDate = dateCubeValues[0];
  if (!DATE_VALUE_RE.test(rawDate)) {
    return { rows: [], warnings: [`<Cube time="${rawDate}"> is not a well-formed YYYY-MM-DD date — not a recognisable ECB daily-rates document`] };
  }
  const date = rawDate;

  const rows = [];
  const seen = new Set();
  for (const attrs of currencyCubeAttrs) {
    const ccy = attrs.currency;
    const rateRaw = attrs.rate;

    if (!CCY_CODE_RE.test(ccy ?? "")) {
      warnings.push(`bad currency code "${ccy}" (rate "${rateRaw}") — not 3 uppercase letters — row skipped`);
      continue;
    }

    if (seen.has(ccy)) {
      warnings.push(`duplicate <Cube currency="${ccy}"> in the document — first occurrence kept, later one(s) ignored`);
      continue;
    }
    seen.add(ccy);

    const label = CURRENCIES[ccy];
    if (!label) {
      warnings.push(`currency "${ccy}" is not in this lane's closed vocabulary (${Object.keys(CURRENCIES).join(", ")}) — row skipped, not fabricated`);
      continue;
    }

    const rate = Number(rateRaw);
    if (!Number.isFinite(rate) || rate <= 0) {
      warnings.push(`bad rate "${rateRaw}" for currency "${ccy}" — row skipped`);
      continue;
    }

    rows.push({
      series_key: `${REGISTRY_ENTRY.keyPrefix}:eur-${ccy.toLowerCase()}`,
      label: `EUR/${ccy} — ECB euro foreign exchange reference rate (${label})`,
      value_numeric: rate,
      unit: `${ccy}/EUR`,
      currency: ccy,
      derivation: "observed",
      origin_class: "official",
      source_key: REGISTRY_ENTRY?.sourceKey ?? "ecb",
      source_ref: `ECB euro foreign exchange reference rates, ${date}`,
      n_observations: null,
      method_version: null,
      as_at_date: date,
      reference_period: date,
    });
  }

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push(`<Cube time="${date}"> found but no recognised-currency rate elements inside it`);
  }

  return { rows, warnings };
}

/**
 * Pure gating decision — no I/O, so it is directly unit-testable without spawning the CLI or touching
 * the network/DB. main() below is the only caller that supplies real env/argv.
 *
 * @returns {{ canWrite: boolean, reason: string }}
 */
export function decideApply({ apply, enabled, killSwitchOn, hasCreds }) {
  if (!apply) return { canWrite: false, reason: "dry run (no --apply) — parse + plan only, nothing written" };
  if (!enabled) {
    return {
      canWrite: false,
      reason:
        `REFUSING — the source-level ENABLED constant in ecb-fx-producer.mjs is false. Arming this ` +
        `producer is a later, separate, reviewed commit (not a runtime flag) — re-run without --apply to ` +
        `see the plan.`,
    };
  }
  if (!killSwitchOn) {
    return { canWrite: false, reason: `REFUSING — kill switch ${KILL_SWITCH_ENV} is OFF (set it to "1" to arm this producer)` };
  }
  if (!hasCreds) {
    return { canWrite: false, reason: "REFUSING — --apply requires DB creds (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — none found" };
  }
  return { canWrite: true, reason: "all gates satisfied" };
}

function readStdinSync() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const inputIdx = args.indexOf("--input");
  return {
    apply: args.includes("--apply"),
    inputPath: inputIdx >= 0 ? args[inputIdx + 1] : null,
    // --trace (lane M5, 2026-09-18): logs every DAG-authorship step to stderr, see
    // author-market-series-delta.mjs's own header ("TRACE + GATE") for what it records.
    trace: args.includes("--trace"),
  };
}

class NetworkError extends Error {}

async function fetchEcbFxXml() {
  let res;
  try {
    res = await fetch(ECB_XML_URL, { headers: { accept: "application/xml, text/xml" } });
  } catch (err) {
    throw new NetworkError(`ecb-fx-producer: live fetch threw (${err.message}) for ${ECB_XML_URL}`);
  }
  if (!res.ok) throw new NetworkError(`ecb-fx-producer: live fetch failed ${res.status} ${res.statusText} for ${ECB_XML_URL}`);
  const text = await res.text();
  return { text, status: res.status, contentType: res.headers.get("content-type") ?? null };
}

/**
 * Evidence line for a parse refusal (run #22's own failure logged NONE of this — just the warning text —
 * which is exactly why the "single- vs double-quoted attribute" root cause took a coordinator's own live
 * re-fetch to diagnose instead of being visible in the producer's own log). Carries whatever is actually
 * known about the source: HTTP status + content-type for a live fetch, byte count and the first 200 chars
 * of the body always (fs/stdin sources included, where there is no HTTP metadata to report). Pure — no
 * fs/fetch/clock of its own, so it is directly unit-testable against any string + any (or no) meta.
 *
 * @param {string} xmlText @param {{status:number,contentType:string|null}|null} sourceMeta
 * @returns {string}
 */
export function formatSourceEvidence(xmlText, sourceMeta) {
  const text = String(xmlText ?? "");
  const byteCount = Buffer.byteLength(text, "utf8");
  const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
  const parts = [];
  if (sourceMeta?.status !== undefined && sourceMeta?.status !== null) parts.push(`HTTP ${sourceMeta.status}`);
  if (sourceMeta?.contentType) parts.push(`content-type "${sourceMeta.contentType}"`);
  parts.push(`${byteCount} byte(s)`);
  parts.push(`first 200 chars: ${JSON.stringify(snippet)}`);
  return parts.join(", ");
}

const cite = {
  skill: "market-series-spine (WO-16, lane P2)",
  reason: "ECB daily FX reference rates upsert into market_series, keyed (series_key, reference_period), full envelope per row.",
};

async function main() {
  const { apply, inputPath, trace } = parseArgs(process.argv);

  let xmlText;
  let sourceMeta = null; // { status, contentType } — set only for a live HTTP fetch; null for --input/stdin
  if (inputPath) {
    xmlText = readFileSync(inputPath, "utf8");
  } else if (!process.stdin.isTTY) {
    xmlText = readStdinSync();
  }
  if (!xmlText || !xmlText.trim()) {
    try {
      const fetched = await fetchEcbFxXml();
      xmlText = fetched.text;
      sourceMeta = { status: fetched.status, contentType: fetched.contentType };
    } catch (err) {
      if (err instanceof NetworkError) {
        console.error(err.message);
        process.exit(3);
      }
      throw err;
    }
  }

  if (!xmlText || !xmlText.trim()) {
    console.error("ecb-fx-producer: no input — live fetch, --input <path>, and stdin all came back empty (exit 2).");
    process.exit(2);
  }

  const { rows: parsedRows, warnings } = parseEcbFxXml(xmlText);
  for (const w of warnings) console.warn(`[parse] ${w}`);
  console.log(`ecb-fx-producer: parsed ${parsedRows.length} row(s), ${warnings.length} warning(s)${apply ? "" : " (DRY RUN)"}`);

  if (parsedRows.length === 0) {
    // A refusal with no evidence is a diagnostic dead end (run #22's own log was exactly this: the parse
    // warning alone, nothing about what was actually fetched — see formatSourceEvidence's own header).
    console.warn(`[parse] evidence: ${formatSourceEvidence(xmlText, sourceMeta)}`);
    console.log("nothing to plan — exiting.");
    process.exit(0);
  }

  const decision = decideApply({
    apply,
    enabled: ENABLED,
    killSwitchOn: process.env[KILL_SWITCH_ENV] === "1",
    hasCreds: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  if (apply && !decision.canWrite) {
    console.error(`ecb-fx-producer: ${decision.reason} (exit 1).`);
    process.exit(1);
  }

  // Existing rows for this producer's OWN namespace only (series_key LIKE 'ecb-fx:%') — never a full-table
  // read, and never touches another producer's series (namespace ownership per the registry's own header).
  const existing = decision.canWrite
    ? (await readAll("market_series", "id, series_key, reference_period")).filter((r) => r.series_key.startsWith(`${REGISTRY_ENTRY.keyPrefix}:`))
    : [];

  const { toCreate, toUpdate, skippedNoReferencePeriod } = planMarketSeriesUpsert(existing, parsedRows);
  for (const r of skippedNoReferencePeriod) {
    console.warn(`[plan] skipped ${r.series_key}: no reference_period (would multiply duplicate rows under the UNIQUE key)`);
  }
  console.log(`ecb-fx-producer: plan — ${toCreate.length} to create, ${toUpdate.length} to update, ${skippedNoReferencePeriod.length} skipped`);

  if (!decision.canWrite) {
    for (const r of toCreate) console.log(`  would create  ${r.series_key} @ ${r.reference_period}  ${r.value_numeric} ${r.unit}`);
    for (const u of toUpdate) console.log(`  would update  id=${u.id}  ${u.patch.value_numeric} ${u.patch.unit}`);
    console.log(`DRY RUN — nothing written (${decision.reason}).`);
    process.exit(0);
  }

  let created = 0, updated = 0;
  for (const r of toCreate) {
    const res = await guardedInsert("market_series", r, { cite });
    console.log(`created  ${r.series_key} @ ${r.reference_period}  (snapshot ${res.snapshot})`);
    created += 1;
  }
  for (const u of toUpdate) {
    await guardedUpdate("market_series", (qb) => qb.eq("id", u.id), { ...u.patch, updated_at: new Date().toISOString() }, { cite });
    console.log(`updated  id=${u.id}`);
    updated += 1;
  }

  console.log(`done — ${created} created, ${updated} updated (${parsedRows.length} rows parsed).`);

  // DAG authorship at write time (see author-market-series-delta.mjs's own header) — every series_key
  // this run's parsed rows touched. Never fatal to this producer's own already-committed write.
  const touchedSeriesKeys = new Set(parsedRows.map((r) => r.series_key));
  const authorCounts = await authorMarketSeriesDeltaEdges(touchedSeriesKeys, "apply", { trace });
  console.log(
    `ecb-fx-producer: DAG authorship (market_series_delta): authored=${authorCounts.authored} ` +
    `already=${authorCounts.skippedAlready} insufficient-history=${authorCounts.insufficientHistory} ` +
    `unit-mismatch=${authorCounts.unitMismatch} refused=${authorCounts.refused} ` +
    `unknown-method=${authorCounts.unknownMethod} errored=${authorCounts.errored}`
  );

  // The run is the gate (lane M5), and its outcome is recorded for the producers family (lane M9d).
  // See assertEdgesAuthoredAndRecordSummary's own header for the full contract.
  assertEdgesAuthoredAndRecordSummary(PRODUCER_NAME, created + updated, authorCounts, parsedRows.length);

  process.exit(0);
}

// Only run main() when this file is the actual entrypoint — importing it for its exports (parseEcbFxXml,
// decideApply, CURRENCIES) from a test must never trigger a live network fetch as a side effect.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
