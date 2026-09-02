#!/usr/bin/env node
// eurostat-lc-lci-lev-producer.mjs — WO-17-shaped $0 producer: Eurostat `lc_lci_lev` (EU labour cost
// levels, EUR/hour, annual) into regional_data_facts as a `labor_markets` fact for the 'EU' region. Lane
// DP-SURF, system-completion train, 2026-09-02 (coordinator follow-up task 3: "the BLS/Eurostat
// disjointness (US wages, EU energy) means no region has both facts — close it").
//
// WHY THIS PRODUCER EXISTS. bls-oews-producer.mjs writes `labor_markets` facts ONLY for region_code='US'
// (BLS OEWS is a US-only survey). eurostat-nrg-pc-205-producer.mjs writes `operational_cost` facts ONLY
// for region_code='EU' (an EU-aggregate electricity price). No region has EVER carried both a
// labor_markets AND an operational_cost fact, so `automate_vs_hire`'s propagation method
// (src/lib/propagation/methods/automate-vs-hire.ts) and seed-derived-values.mjs's automate-vs-hire seed
// path have had ZERO regions to compute for, by construction — not a bug in either of those, a genuine
// coverage gap in the two source producers. This producer closes the 'EU' half of that gap: once it
// writes a `labor_markets` fact for 'EU', that region carries BOTH facts and automate_vs_hire has real
// input to compute from. (The 'US' half — an EU-shaped energy-price fact for the US region — is NOT
// addressed here; it is a separate, symmetric gap this task was not scoped to close. Named, not fixed.)
//
// SOURCE + PARSE PATTERN — SAME AS eurostat-nrg-pc-205-producer.mjs, PER COORDINATOR INSTRUCTION. Same
// Eurostat dissemination JSON-stat 2.0 API, same $0/no-key licence (source_key='eurostat', CC BY 4.0),
// same `decodeJsonStat` (reused directly from eurostat-nrg-pc-205-parser.mjs — see
// eurostat-lc-lci-lev-parser.mjs's header). ONE STRUCTURAL DIFFERENCE, discovered and documented rather
// than glossed over: `lc_lci_lev` publishes NO EU-wide aggregate for this measure (confirmed live this
// session — see the parser's header for the two independent fetches that proved it), so this producer
// cannot do what nrg_pc_205's does (one query, one geo, one row). It instead fetches EACH of the 'EU'
// region's own constituent member states (migration 106's regions.iso_codes for code='EU':
// DE/NL/BE/FR/IT/ES) SEPARATELY — one HTTP call per country, not a single multi-geo query — and the
// parser's `aggregateLcLciLevForRegion` reduces those six fetches to ONE `labor_markets` fact for 'EU'
// via a documented simple mean (derivation:'calculated', origin_class:'derived' — NOT 'observed'/
// 'official', because this specific number is OUR computation over six of Eurostat's own published
// figures, not one Eurostat published itself). WHY PER-GEO FETCHES, NOT ONE geo=DE&geo=NL&... QUERY: this
// lane's own exploratory fetches this session (tool-mediated, not a raw curl) returned only the LAST
// repeated `geo=` parameter's data rather than the union of all of them — inconclusive as to whether that
// is a genuine Eurostat API behaviour or an artifact of the fetch tool used to explore it, so the producer
// commits to the shape ACTUALLY CONFIRMED working (one geo per request) rather than an unverified
// shortcut. Six small requests against a $0, unauthenticated, open API is a negligible cost either way.
//
// KILL SWITCHES — THREE GATES, one more than the two other regional producers (bls-oews-producer.mjs,
// eurostat-nrg-pc-205-producer.mjs), by deliberate choice: this producer's output is a COMPUTED aggregate
// (a mean across six fetches, the first of that shape in this codebase's regional producers) rather than
// a directly-published pass-through figure, so it gets the SAME three-gate posture
// scripts/producers/market/ecb-fx-producer.mjs already uses for its own higher-scrutiny write, not the
// two-gate baseline ADR-023 states as the floor:
//   1. `ENABLED` (below) — the reviewed-code-change gate (ADR-023 §4, CLAUDE.md rule 11). REVIEWED-CHANGE
//      NOTE, dated 2026-09-02 (coordinator follow-up, this commit): armed `true` from authorship, unlike
//      ecb-fx's `false`-at-authorship posture, because the coordinator's own instruction for this task
//      ("ENABLED = true with an ADR-023 reviewed-change note") IS that review — the same posture
//      eurostat-nrg-pc-205-producer.mjs/bls-oews-producer.mjs record for their own 2026-08-30 arming
//      ("Setting it true here IS that review"). The parser is proven against a committed fixture
//      (eurostat-lc-lci-lev-parser.npmtest.mjs) and against the live JSON-stat SHAPE this session
//      confirmed by direct fetch (dimension codes, not sample numeric values — see that file's header);
//      it has NOT yet been run --apply against the live database by this lane (no DB creds in this
//      sandbox — same constraint every producer in this repo is authored under, ADR-023's own Context).
//      ADR-023 §5's own rule stands regardless of this constant: first live run is dry, inspected, THEN
//      applied — arming ENABLED does not skip that step, it only permits it to happen.
//   2. `REGIONAL_PRODUCER_EUROSTAT_LC_LCI_LEV_ENABLED` — the runtime env kill switch, DEFAULT OFF (unset
//      or any value other than "1" = off), checked ONLY when --apply is requested (a --dry run always
//      proceeds regardless, matching ecb-fx-producer.mjs's own "--dry never needs a flag flip" contract —
//      the parser/aggregator must stay testable with zero environment setup). This workflow env var is
//      NOT set in .github/workflows/producers.yml by this commit (that file is explicitly out of this
//      lane's write set — "the coordinator adds the step"); until it is, --apply against this producer
//      refuses everywhere, including CI, which is the intended fail-closed default for a producer whose
//      first live run has not yet happened.
//   3. `--apply` on the command line (vs. the default dry run) — ADR-023 §4's own second gate ("is THIS
//      run allowed to write?").
// Passing --apply while gate 2 is off REFUSES with an explanatory message and exits 1 — never a silent
// downgrade to a dry run, matching ecb-fx-producer.mjs's decideApply() contract exactly (mirrored below
// as decideApply, so this producer's own gating is unit-testable the same way).
//
// Usage:
//   node scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs             # dry run (DEFAULT)
//   node scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs --apply     # write (needs ALL 3 gates)
// Exit 0 done (including a clean dry run) · 1 refused (a gate is off on --apply) · 2 no DB creds
// (--apply only).

const ENABLED = true; // Gate 1 — see the reviewed-change note above. Dated 2026-09-02.
const KILL_SWITCH_ENV = "REGIONAL_PRODUCER_EUROSTAT_LC_LCI_LEV_ENABLED"; // Gate 2 — default OFF.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateLcLciLevForRegion,
  EU_MEMBER_GEO_CODES,
  LC_LCI_LEV_REQUEST_FILTER,
} from "../../../src/lib/regional/eurostat-lc-lci-lev-parser.mjs";
import { runEnvelopeProducer } from "./run-envelope-producer.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

function buildLcLciLevUrl(geo) {
  const { unit, lcstruct, nace_r2 } = LC_LCI_LEV_REQUEST_FILTER;
  return (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lc_lci_lev" +
    `?format=JSON&lang=EN&geo=${geo}&unit=${unit}&lcstruct=${lcstruct}&nace_r2=${nace_r2}`
  );
}

/** One HTTP call per EU_MEMBER_GEO_CODES entry (see file header for why not one multi-geo query). A
 *  single country's fetch failing does not abort the run — it is excluded from the mean (the parser's own
 *  documented behaviour for an absent geo), logged, and the aggregate still runs over whichever countries
 *  resolved. Exported so a test can exercise it with a fake fetch, without a network call. */
export async function fetchAllMemberStates(fetchImpl = fetch) {
  const jsByGeo = {};
  for (const geo of EU_MEMBER_GEO_CODES) {
    let res;
    try {
      res = await fetchImpl(buildLcLciLevUrl(geo));
    } catch (err) {
      console.warn(`eurostat-lc-lci-lev-producer: fetch threw for geo=${geo} (${err.message}) — excluded from the mean.`);
      continue;
    }
    if (!res.ok) {
      console.warn(`eurostat-lc-lci-lev-producer: fetch failed ${res.status} ${res.statusText} for geo=${geo} — excluded from the mean.`);
      continue;
    }
    jsByGeo[geo] = await res.json();
  }
  return jsByGeo;
}

async function fetchAndParse() {
  const jsByGeo = await fetchAllMemberStates();
  return aggregateLcLciLevForRegion(jsByGeo, { geoCodes: EU_MEMBER_GEO_CODES, regionCode: "EU", dimension: "labor_markets" });
}

/**
 * Pure gating decision, mirroring ecb-fx-producer.mjs's decideApply() exactly (same three-gate shape —
 * see file header). No I/O, directly unit-testable without spawning the CLI or touching the network/DB.
 * @returns {{ canWrite: boolean, reason: string }}
 */
export function decideApply({ apply, enabled, killSwitchOn, hasCreds }) {
  if (!apply) return { canWrite: false, reason: "dry run (no --apply) — parse + plan only, nothing written" };
  if (!enabled) {
    return {
      canWrite: false,
      reason:
        "REFUSING — the source-level ENABLED constant in eurostat-lc-lci-lev-producer.mjs is false. " +
        "Arming this producer is a later, separate, reviewed commit (not a runtime flag) — re-run without --apply to see the plan.",
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

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  const apply = process.argv.slice(2).includes("--apply");

  const decision = decideApply({
    apply,
    enabled: ENABLED,
    killSwitchOn: process.env[KILL_SWITCH_ENV] === "1",
    hasCreds: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  if (apply && !decision.canWrite) {
    console.error(`eurostat-lc-lci-lev-producer: ${decision.reason}`);
    process.exit(decision.reason.includes("DB creds") ? 2 : 1);
  }

  // dry mode (or --apply with every gate satisfied) both proceed into the shared orchestrator, which
  // itself re-derives dry/apply from argv and performs the actual guarded write only when apply + every
  // ADR-023-baseline gate (ENABLED, argv --apply) holds. Gate 2 (the env kill switch) was already
  // enforced above — runEnvelopeProducer has no parameter for a third gate, so it is checked here, before
  // the shared orchestrator ever runs, never inside it.
  await runEnvelopeProducer({
    producerName: "eurostat-lc-lci-lev-producer",
    enabled: ENABLED,
    sourceKey: "eurostat",
    fetchAndParse,
    cite: {
      skill: "system-completion-train-dp-surf-task-3",
      reason:
        "Eurostat lc_lci_lev EU labour-cost producer, closing the BLS/Eurostat region disjointness " +
        "(coordinator follow-up, 2026-09-02) so the 'EU' region carries both a labor_markets and an " +
        "operational_cost fact for automate_vs_hire to compute from. Envelope-first per WO-17/ADR-023.",
    },
  });
}
