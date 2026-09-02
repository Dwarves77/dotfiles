#!/usr/bin/env node
// ecb-fx-producer.mjs — the second market_series producer (WO-16's registry, keyPrefix "ecb-fx"). Lane
// P2, build/wave-p2: "the one declared-stub producer with a genuinely free, keyless API" (of the three
// stubs series-registry.mjs names — eex-eua, ecb-fx, eia-v2 — EEX is licensed [see the header note
// below] and EIA v2 needs an API key an operator must register for; ECB's daily reference-rate feed
// needs neither).
//
// SOURCE + LICENCE. https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml — the ECB's own
// "today's rates" XML, unauthenticated, no API key, published once per TARGET business day around
// 16:00 CET. This is the SAME feed named by series-registry.mjs's ecb-fx entry (sourceUrl points at the
// human-readable page for this feed) and it has been effectively unchanged in shape since ECB started
// publishing it (well-documented public format: a gesmes:Envelope wrapping one dated Cube of per-currency
// Cube rate elements). LICENCE: the ECB's standing published notice is "reproduction is permitted
// provided the source is acknowledged" (https://www.ecb.europa.eu/home/disclaimer/html/index.en.html —
// the ECB's legal/copyright notice, which covers ecb.europa.eu content generally; this feed carries no
// separate dataset-specific licence page as of the last time it was read).
//   *** [UNCONFIRMED THIS SESSION] *** — sandbox egress to every ecb.europa.eu host (www, data-api,
//   sdw-wsrest) returned a 403 policy denial from the agent-proxy this session (confirmed via
//   `curl -sS $HTTPS_PROXY/__agentproxy/status`, recentRelayFailures: connect_rejected,
//   "www.ecb.europa.eu:443"). The licence text above and the XML shape below are stated from the
//   publisher's well-documented, long-stable public format, NOT from a fetch performed this session.
//   Per the lane's gate: build against the documented shape, ship the fixture, SAY the live shape is
//   unverified pending a runner/browser fetch — do NOT fake verification. Whoever next runs this
//   producer where ecb.europa.eu is reachable (a GitHub runner, same posture as
//   fetch-oil-bulletin.mjs's own header) should diff the live response against ECB_FIXTURE_XML in
//   src/__tests__/market-ecb-fx-parser.test.mjs BEFORE that first --apply — ENABLED itself was already
//   flipped true 2026-09-02 (see the REVIEWED-CHANGE LOG below), so the shape check now gates the first
//   dispatched --apply run directly rather than a future ENABLED flip.
// ENDPOINT CHOICE, DEFENDED. ECB also publishes a richer SDMX data-api (data-api.ecb.europa.eu) for the
// same series with historical range queries. This producer uses the plain eurofxref-daily.xml instead:
// it is the feed series-registry.mjs's own sourceUrl already points readers at, it needs no query-string
// construction or SDMX dataflow/key knowledge, it returns exactly one day's rates (which is all a daily
// cadence producer needs), and its shape has been stable across decades of public use — the same
// "smaller, stabler surface over a richer API" call fetch-oil-bulletin.mjs's header makes for resolving
// "Prices wo taxes" by name rather than assuming sheet order.
//
// XML SHAPE (documented; see the UNCONFIRMED note above):
//   <?xml version="1.0" encoding="UTF-8"?>
//   <gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
//                     xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
//     <gesmes:subject>Reference rates</gesmes:subject>
//     <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
//     <Cube>
//       <Cube time="2026-08-28">
//         <Cube currency="USD" rate="1.1801"/>
//         <Cube currency="JPY" rate="164.63"/>
//         ... (~30 currencies)
//       </Cube>
//     </Cube>
//   </gesmes:Envelope>
// Exactly one dated Cube block per file (unlike the ECB's separate multi-day history file, which this
// producer does not use). parseEcbFxXml below reads it with hand-rolled regex, zero npm dependencies —
// the same "no XML-parsing dependency" posture oil-bulletin-workbook.mjs takes for the (much larger)
// .xlsx XML parts, because this file is a few KB and the shape is two element types.
//
// CLOSED CURRENCY VOCABULARY. series-registry.mjs's own ecb-fx notes name the intended set: "Daily EUR
// reference rates against major currencies (USD, GBP, CNY, JPY, …)." CURRENCIES below is exactly that
// set (registry's own four, verbatim) — not the ~30 the live file carries. A currency in the XML that is
// not in CURRENCIES is a WARNING (skipped, not fabricated into a series this lane never scoped), same
// posture as the oil-bulletin parser's unrecognised-product handling.
//
// ENVELOPE. Every row: derivation="observed" (a directly published central-bank reference rate, not a
// calculation), origin_class="official" (the ECB is a public EU institution). unit is "<CCY>/EUR" (units
// of the quote currency per 1 EUR, matching the rate's own definition on the ECB page); currency is the
// quote currency itself (the ISO 4217 code the numeric value is denominated in — mirrors the oil-bulletin
// convention where `currency` names the monetary unit of `value_numeric`, not the base). reference_period
// and as_at_date are both the rate date from the document's own <Cube time="..."> attribute — never
// `new Date()` (pure parser, no clock read, same rule the oil-bulletin parser states).
//
// THIRD GATE — SOURCE REGISTRATION. market_series.source_key is a live FK to
// public.data_sources(source_key) (migration 268). 'ecb' was NOT a registered row when this producer was
// first authored (grepped src/lib/contracts/source-licence.mjs 2026-08-31: zero hits for "ecb", "eex",
// "icap", "EUA"). CLOSED 2026-09-02 (Lane PROD, system-completion train,
// docs/plans/system-completion-plan-2026-09-02.md §2 "Lane PROD"): migration
// supabase/migrations/281_data_sources_ecb.sql inserts the 'ecb' row directly (redistribution='permitted',
// embeddable=true, verified_on NULL, blocker text carrying the [UNCONFIRMED] flag — see that migration's
// own header for why it is a hand-written INSERT rather than the sanctioned source-licence.mjs
// regenerated-block flow, and for the resulting SOURCE_LICENCES/data_sources divergence recorded there as
// a follow-up). Once 281 is APPLIED to the live database, this gate resolves and an --apply attempt no
// longer fails closed on 23503 (foreign_key_violation) for this reason; until then it still does. This
// gate is orthogonal to, and independent of, the two runtime safety gates below.
//
// REVIEWED-CHANGE LOG (ADR-023 §4 gate 1 — "flipping ENABLED is a REVIEWED CODE CHANGE, shows in `git
// diff`"). 2026-09-02, Lane PROD (system-completion train): ENABLED flipped false -> true in the SAME
// commit as migration 281, per direct instruction in
// docs/plans/system-completion-plan-2026-09-02.md §2 "Lane PROD" ("`ENABLED = true` on ecb-fx with the
// ADR-023 reviewed-change note"). This is the reviewed-code-change half of ADR-023's two-gate contract
// landing — it is NOT, by itself, permission for a live write: ADR-023 §5 ("First live run is dry,
// inspected, then applied") still governs, and this producer has parser tests against a committed
// fixture, never a live endpoint (see the [UNCONFIRMED] note above — the XML shape is documented, not
// live-read this session). THE STATE AFTER THIS COMMIT, PLAINLY: gate 1 (ENABLED) is now ON; gate 2 (the
// runtime kill switch, MARKET_PRODUCER_ECB_FX_ENABLED) still defaults OFF — unset in every environment
// until an operator sets it for a specific dispatched run; gate 3 (source registration) resolves once
// migration 281 is applied. A write still needs ALL THREE — this commit closes gates 1 and (pending
// apply) 3, and deliberately leaves gate 2 for the dispatched dry-then-apply sequence ADR-023 §5 and the
// system-completion plan's "not a lane — operator-only" dispatch list both call for.
//
// THREE INDEPENDENT SAFETY GATES, ALL MUST BE SATISFIED TO WRITE — same contract eu-weekly-oil-bulletin.mjs
// states for its two, plus the source-registration gate above (the shape eurostat-nrg-pc-205-producer.mjs
// introduced first, for the same reason: a runtime env var alone is not a reviewed-code-change gate):
//   1. ENABLED (below) — a plain top-level `const`. TRUE as of 2026-09-02 (see the reviewed-change log
//      above) — flipping it back to false, or true again after a future false, is itself a REVIEWED CODE
//      CHANGE (shows in `git diff`), so no scheduled/automated invocation can ever silently arm or
//      re-arm this producer. Checked FIRST, before ANY work that could write (but see the --input/dry
//      carve-out below — a dry run still runs regardless of this constant).
//   2. --apply on the command line + MARKET_PRODUCER_ECB_FX_ENABLED=1 in the environment (the runtime
//      kill switch; unset/any other value = OFF — this is the gate that is STILL off by default even
//      with ENABLED now true). A --dry run (the default) always parses + plans + reports regardless of
//      ENABLED or the env switch, so the parser and planner stay testable and this lane's dry-run proof
//      needs no flag flips — mirrors eu-weekly-oil-bulletin.mjs's own carve-out.
//   3. Source registration (public.data_sources has an 'ecb' row) — migration 281, applied. Enforced by
//      the live FK, not by this file's own logic; decideApply below does not model it, so a --apply run
//      with gates 1-2 satisfied but 281 not yet applied fails at the guarded INSERT itself (23503), not
//      at decideApply's REFUSING message. See the THIRD GATE note above.
// Passing --apply while gate 1 or 2 is off REFUSES with an explanatory message and exits 1 — never a
// silent downgrade to dry-run, and never a partial write. Gate 3 fails closed at the database instead.
//
// THIS SCRIPT FETCHES LIVE BY DEFAULT (unlike eu-weekly-oil-bulletin.mjs, which reads a normalized CSV
// produced by a separate fetch-oil-bulletin.mjs). ECB's daily XML is small (~5–10 KB) and needs no
// binary-archive extraction step the way the .xlsx workbook did, so fetch + parse are staged as two
// plain functions (fetchEcbFxXml, parseEcbFxXml) inside this ONE file rather than a second script — this
// lane's write set names exactly one new producer script. --input <path> (or stdin) overrides the live
// fetch with a local XML file, for testing and for the "sandbox cannot reach ecb.europa.eu" case above.
//
// Usage:
//   node scripts/producers/market/ecb-fx-producer.mjs                       # dry run, live fetch (DEFAULT)
//   node scripts/producers/market/ecb-fx-producer.mjs --input path/to.xml   # dry run, local file
//   cat rates.xml | node scripts/producers/market/ecb-fx-producer.mjs       # dry run, stdin
//   node scripts/producers/market/ecb-fx-producer.mjs --apply               # write (needs ALL THREE gates armed)
// Exit 0 done (including a clean dry run) · 1 refused (a gate is off on --apply, or no DB creds on
// --apply) · 2 bad/empty input · 3 network failure (live fetch, --apply or --dry alike).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";

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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected, or no creds needed for --dry */ }

const TIME_RE = /<Cube\s+time="(\d{4}-\d{2}-\d{2})"/;
const CCY_RE = /<Cube\s+currency="([A-Z]{3})"\s+rate="([0-9]*\.?[0-9]+)"\s*\/>/g;

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

  const timeMatch = TIME_RE.exec(text);
  if (!timeMatch) {
    return { rows: [], warnings: ['no <Cube time="YYYY-MM-DD"> element found — not a recognisable ECB daily-rates document'] };
  }
  const date = timeMatch[1];

  const rows = [];
  const seen = new Set();
  for (const m of text.matchAll(CCY_RE)) {
    const ccy = m[1];
    const rateRaw = m[2];

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
  return res.text();
}

const cite = {
  skill: "market-series-spine (WO-16, lane P2)",
  reason: "ECB daily FX reference rates upsert into market_series, keyed (series_key, reference_period), full envelope per row.",
};

async function main() {
  const { apply, inputPath } = parseArgs(process.argv);

  let xmlText;
  if (inputPath) {
    xmlText = readFileSync(inputPath, "utf8");
  } else if (!process.stdin.isTTY) {
    xmlText = readStdinSync();
  }
  if (!xmlText || !xmlText.trim()) {
    try {
      xmlText = await fetchEcbFxXml();
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
