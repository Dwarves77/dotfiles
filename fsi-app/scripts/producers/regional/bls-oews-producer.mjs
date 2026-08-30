#!/usr/bin/env node
// bls-oews-producer.mjs — WO-17 $0 producer: US freight/logistics occupation median wages (BLS OEWS)
// into regional_data_facts, envelope-first (never new free text).
//
// Usage: node scripts/producers/regional/bls-oews-producer.mjs [--apply]
//   (no flag)   dry run: fetch, parse, compute the upsert plan, print it, write nothing (DEFAULT)
//   --apply     execute the plan through the guarded write path (scripts/lib/db.mjs)
//
// KILL SWITCH — default OFF, same contract as eurostat-nrg-pc-205-producer.mjs (see that file's header
// for the rationale). Checked before any work, including --dry.
const ENABLED = false;

// $0, NO KEY REQUIRED: BLS Public Data API v2 accepts unregistered requests (public-domain data). Per
// this lane's hard rule 4 ("if a key is required, STOP and report"), no BLS registration key is obtained
// or assumed — the request below is unauthenticated. NETWORK NOTE: this producer's own run was not
// exercised against the live endpoint this session — outbound access to api.bls.gov is blocked by this
// sandbox's egress policy (same agent-proxy organization-policy denial as the Eurostat producer). The
// parser (bls-oews-parser.mjs) is exercised end-to-end against a committed fixture instead; the series-ID
// construction is built from BLS's PUBLISHED convention, not verified live this session — see that
// module's header and this lane's report for the exact caveat.
const BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOewsResponse, buildOewsSeriesId, OEWS_OCCUPATIONS } from "../../../src/lib/regional/bls-oews-parser.mjs";
import { runEnvelopeProducer } from "./run-envelope-producer.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

async function fetchAndParse() {
  const seriesid = OEWS_OCCUPATIONS.map((o) => buildOewsSeriesId(o.socCode));
  const res = await fetch(BLS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seriesid }),
  });
  if (!res.ok) throw new Error(`bls-oews-producer: fetch failed ${res.status} ${res.statusText}`);
  const js = await res.json();
  return parseOewsResponse(js, { regionCode: "US", dimension: "labor_markets" });
}

if (!ENABLED) {
  console.log("bls-oews-producer: DISABLED by kill switch (ENABLED=false) — no-op, exit 0.");
  process.exit(0);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("bls-oews-producer: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

await runEnvelopeProducer({
  producerName: "bls-oews-producer",
  enabled: ENABLED,
  sourceKey: "bls",
  fetchAndParse,
  cite: {
    skill: "wo-17-operations-facts-eu-us",
    reason: "$0 BLS OEWS freight/logistics occupation wage producer, envelope-first, per docs/plans/master-execution-plan-2026-08-17.md WO-17.",
  },
});
