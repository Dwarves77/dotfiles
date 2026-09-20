#!/usr/bin/env node
// eurostat-nrg-pc-205-producer.mjs — WO-17 $0 producer: EU non-household electricity prices
// (Eurostat dataset nrg_pc_205) into regional_data_facts, envelope-first (never new free text).
//
// Usage: node scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs [--apply]
//   (no flag)   dry run: fetch, parse, compute the upsert plan, print it, write nothing (DEFAULT)
//   --apply     execute the plan through the guarded write path (scripts/lib/db.mjs)
//
// KILL SWITCH — default OFF (WO-17 contract; CLAUDE.md rule 11's "every recurring worker must check a
// kill switch before doing work"). This is a REVIEWED-CODE-CHANGE gate, not a runtime flag: flipping it
// shows up in `git diff`, so a scheduled invocation can never silently turn this producer on. It is
// checked BEFORE any work, including --dry, so "kill switch off" means the producer does nothing at all,
// not just "does nothing to the database".
// ARMED 2026-08-30. Was false from authoring until now: Waves 4-7 built this producer, the envelope
// columns it writes and the matrix layer that renders them, and shipped all three with the producer
// off, so /operations showed a built location with nothing in it. The producer was not unsafe, it was
// unrun — the sandbox that authored it cannot reach ec.europa.eu / api.bls.gov (HTTP 000 under the
// org egress policy), so there was no environment in which it COULD run. It now runs on a schedule
// from .github/workflows/producers.yml, on a GitHub runner that can reach the source.
// This flag stays a reviewed-code-change gate, not a runtime flag: flipping it shows in `git diff`,
// which is what stops a scheduled invocation from ever silently turning a producer on. Setting it
// true here IS that review. The remaining runtime gate is the workflow's own dry/apply mode.
const ENABLED = true;

// $0, NO KEY: Eurostat's dissemination API is open, unauthenticated (see the parser module header for
// the licence-register confirmation). NETWORK NOTE: this producer's own --dry/--apply run was not
// exercised against the live endpoint this session — outbound access to ec.europa.eu is blocked by this
// sandbox's egress policy (agent-proxy: "connect_rejected... organization policy", confirmed via
// `curl -sS http://127.0.0.1:.../__agentproxy/status`). The parser (eurostat-nrg-pc-205-parser.mjs) is
// exercised end-to-end against a committed fixture instead; see that module's tests for the parse-layer
// proof and this lane's report for a fixture-driven dry-run demonstration.
const EUROSTAT_URL =
  `${EUROSTAT_DISSEMINATION_API_BASE}/nrg_pc_205` +
  "?format=JSON&lang=EN&geo=EU27_2020&unit=KWH&currency=EUR&tax=I_TAX";
// (see eurostat-lc-lci-lev-producer.mjs for EUROSTAT_DISSEMINATION_API_BASE's F46 one-home note)

import { parseNrgPc205 } from "../../../src/lib/regional/eurostat-nrg-pc-205-parser.mjs";
import { runEnvelopeProducer } from "./run-envelope-producer.mjs";
// F46 (lane L35): ec.europa.eu's one home is eurostat-lc-lci-lev-producer.mjs (safe to import -- guards
// its own run behind IS_MAIN); this producer composes off its exported base instead of a local literal.
import { EUROSTAT_DISSEMINATION_API_BASE } from "./eurostat-lc-lci-lev-producer.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";

const PRODUCER_NAME = "eurostat-nrg-pc-205";

loadLocalEnvFile();

async function fetchAndParse() {
  const res = await fetch(EUROSTAT_URL);
  if (!res.ok) throw new Error(`eurostat-nrg-pc-205-producer: fetch failed ${res.status} ${res.statusText}`);
  const js = await res.json();
  return parseNrgPc205(js, { geo: "EU27_2020", regionCode: "EU" });
}

if (!ENABLED) {
  console.log("eurostat-nrg-pc-205-producer: DISABLED by kill switch (ENABLED=false) — no-op, exit 0.");
  process.exit(0);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("eurostat-nrg-pc-205-producer: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const result = await runEnvelopeProducer({
  producerName: "eurostat-nrg-pc-205-producer",
  enabled: ENABLED,
  sourceKey: "eurostat",
  fetchAndParse,
  cite: {
    skill: "wo-17-operations-facts-eu-us",
    reason: "$0 Eurostat nrg_pc_205 electricity-price producer, envelope-first, per docs/plans/master-execution-plan-2026-08-17.md WO-17.",
  },
});

// Recorded on this run's normal completion (lane M9d, brief-m9d Amendment 1 item C.2). No assertion of
// this producer's own analogous to assertEdgesAuthored exists (that gate is market_series-only, lane M5),
// so edges_authored is whatever authorAutomateVsHireForRegions actually authored this run, null when the
// producer never reached that step (disabled, or a dry run with candidates:0, both real "ok" outcomes).
writeProducerSummary({
  producer: PRODUCER_NAME,
  status: "ok",
  rows_changed: (result.inserted ?? 0) + (result.updated ?? 0),
  edges_authored: result.authorCounts ? result.authorCounts.authored : null,
  counts: result,
});
