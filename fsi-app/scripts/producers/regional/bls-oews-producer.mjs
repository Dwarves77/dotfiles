#!/usr/bin/env node

const ENABLED = true;

// $0, NO KEY REQUIRED: BLS Public Data API v2 accepts unregistered requests (public-domain data). Per
// this lane's hard rule 4 ("if a key is required, STOP and report"), no BLS registration key is obtained
// or assumed — the request below is unauthenticated. NETWORK NOTE: this producer's own run was not
// exercised against the live endpoint this session — outbound access to api.bls.gov is blocked by this
// sandbox's egress policy (same agent-proxy organization-policy denial as the Eurostat producer). The
// parser (bls-oews-parser.mjs) is exercised end-to-end against a committed fixture instead; the series-ID
// construction is built from BLS's PUBLISHED convention, not verified live this session — see that
// module's header and this lane's report for the exact caveat.
const BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

import {
  parseOewsResponse,
  buildOewsSeriesId,
  OEWS_OCCUPATIONS,
  ANNUAL_MEDIAN_WAGE_DATATYPE,
  HOURLY_MEDIAN_WAGE_DATATYPE,
} from "../../../src/lib/regional/bls-oews-parser.mjs";
import { runEnvelopeProducer } from "./run-envelope-producer.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";
import { isMainModule } from "../../lib/is-main.mjs";

const PRODUCER_NAME = "bls-oews";

loadLocalEnvFile();

// Requests BOTH the annual-median and hourly-median series per occupation (2026-09-02 coordinator
// follow-up: "BLS OEWS wage fact is hourly" (an hourly wage is the unit regional wage evidence is
// read in; this producer previously supplied only the annual figure). See bls-oews-parser.mjs's header for the datatype-code
// confirmation and why HOURLY MEDIAN (08), not hourly MEAN (03), was chosen to match the annual figure's
// own measure family). Both are kept, not one swapped for the other — the annual fact still backs whatever
// already reads a `dimension:'labor_markets'` row without caring about its unit (the /operations matrix
// coverage view, region-grid fact counts); a reader of the hourly figure must never mistake the annual row for it.
async function fetchAndParse() {
  const seriesid = OEWS_OCCUPATIONS.flatMap((o) => [
    buildOewsSeriesId(o.socCode, ANNUAL_MEDIAN_WAGE_DATATYPE),
    buildOewsSeriesId(o.socCode, HOURLY_MEDIAN_WAGE_DATATYPE),
  ]);
  const res = await fetch(BLS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seriesid }),
  });
  if (!res.ok) throw new Error(`bls-oews-producer: fetch failed ${res.status} ${res.statusText}`);
  const js = await res.json();
  return parseOewsResponse(js, { regionCode: "US", dimension: "labor_markets" });
}

// Guarded (F44/F67, F44-2c): the whole run body moves inside isMainModule so merely importing this file
// triggers nothing. Previously `runEnvelopeProducer` ran unconditionally at module load (F44-2c,
// [CONFIRMED], app-audit-a4bc-scripts-completion-2026-09-30.md).
async function main() {
  if (!ENABLED) {
    console.log("bls-oews-producer: DISABLED by kill switch (ENABLED=false) — no-op, exit 0."); // glyph:verbatim (pre-existing message text, relocated unchanged)
    process.exit(0);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("bls-oews-producer: no DB creds — cannot run here (exit 2)."); // glyph:verbatim (pre-existing message text, relocated unchanged)
    process.exit(2);
  }

  const result = await runEnvelopeProducer({
    producerName: "bls-oews-producer",
    enabled: ENABLED,
    sourceKey: "bls",
    fetchAndParse,
    cite: {
      skill: "wo-17-operations-facts-eu-us",
      reason: "$0 BLS OEWS freight/logistics occupation wage producer, envelope-first, per docs/plans/master-execution-plan-2026-08-17.md WO-17.",
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

if (isMainModule(import.meta.url)) await main();
