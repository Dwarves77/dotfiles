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
const ENABLED = false;

// $0, NO KEY: Eurostat's dissemination API is open, unauthenticated (see the parser module header for
// the licence-register confirmation). NETWORK NOTE: this producer's own --dry/--apply run was not
// exercised against the live endpoint this session — outbound access to ec.europa.eu is blocked by this
// sandbox's egress policy (agent-proxy: "connect_rejected... organization policy", confirmed via
// `curl -sS http://127.0.0.1:.../__agentproxy/status`). The parser (eurostat-nrg-pc-205-parser.mjs) is
// exercised end-to-end against a committed fixture instead; see that module's tests for the parse-layer
// proof and this lane's report for a fixture-driven dry-run demonstration.
const EUROSTAT_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_205" +
  "?format=JSON&lang=EN&geo=EU27_2020&unit=KWH&currency=EUR&tax=I_TAX";

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNrgPc205 } from "../../../src/lib/regional/eurostat-nrg-pc-205-parser.mjs";
import { runEnvelopeProducer } from "./run-envelope-producer.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

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

await runEnvelopeProducer({
  producerName: "eurostat-nrg-pc-205-producer",
  enabled: ENABLED,
  sourceKey: "eurostat",
  fetchAndParse,
  cite: {
    skill: "wo-17-operations-facts-eu-us",
    reason: "$0 Eurostat nrg_pc_205 electricity-price producer, envelope-first, per docs/plans/master-execution-plan-2026-08-17.md WO-17.",
  },
});
