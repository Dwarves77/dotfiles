#!/usr/bin/env node

const ENABLED = true; // Gate 1 — see the reviewed-change note above. Dated 2026-09-02.
const KILL_SWITCH_ENV = "REGIONAL_PRODUCER_EUROSTAT_LC_LCI_LEV_ENABLED"; // Gate 2 — default OFF.

// ec.europa.eu -- ONE HOME (lane L35, F46 external-host-home). This file is the safe import target of
// the two Eurostat regional producers: it guards its own top-level run behind IS_MAIN (below), so
// importing its exports triggers no side effect, unlike its sibling eurostat-nrg-pc-205-producer.mjs
// (which runs runEnvelopeProducer unconditionally at module load -- [CONFIRMED] by reading that file;
// out of this lane's scope to fix, noted in the session log). The sibling imports this constant instead
// of templating the host string again.
export const EUROSTAT_DISSEMINATION_API_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateLcLciLevForRegion,
  EU_MEMBER_GEO_CODES,
  LC_LCI_LEV_REQUEST_FILTER,
} from "../../../src/lib/regional/eurostat-lc-lci-lev-parser.mjs";
import { runEnvelopeProducer } from "./run-envelope-producer.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";

const PRODUCER_NAME = "eurostat-lc-lci-lev";

loadLocalEnvFile();

function buildLcLciLevUrl(geo) {
  const { unit, lcstruct, nace_r2 } = LC_LCI_LEV_REQUEST_FILTER;
  return (
    `${EUROSTAT_DISSEMINATION_API_BASE}/lc_lci_lev` +
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
  const result = await runEnvelopeProducer({
    producerName: "eurostat-lc-lci-lev-producer",
    enabled: ENABLED,
    sourceKey: "eurostat",
    fetchAndParse,
    cite: {
      skill: "system-completion-train-dp-surf-task-3",
      reason:
        "Eurostat lc_lci_lev EU labour-cost producer, closing the BLS/Eurostat region disjointness " +
        "(coordinator follow-up, 2026-09-02) so the 'EU' region carries both a labor_markets and an " +
        "operational_cost fact as sourced regional evidence. Envelope-first per WO-17/ADR-023.",
    },
  });

  // See eurostat-nrg-pc-205-producer.mjs's own copy of this note (lane M9d, brief-m9d Amendment 1 item C.2).
  writeProducerSummary({
    producer: PRODUCER_NAME,
    status: "ok",
    rows_changed: (result.inserted ?? 0) + (result.updated ?? 0),
    edges_authored: null, // regional_data_facts rows carry no derivation edges (ADR-043)
    counts: result,
  });
}
