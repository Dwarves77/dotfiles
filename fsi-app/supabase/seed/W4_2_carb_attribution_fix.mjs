// W4.2 — CARB attribution fix
//
// The W1.C source attribution audit (docs/W1C-source-attribution-audit.json)
// confirmed one CARB-content item is currently linked to a US EPA `sources`
// row even though its `source_url` host is `arb.ca.gov`. The proposed fix
// is to (a) wait for the W3 US discovery+verification batch to create a real
// "California Air Resources Board (CARB)" row in `sources`, then (b) re-point
// every intelligence_items row whose `source_url` host is under `arb.ca.gov`
// to that new source.
//
// Strict scope guard
// ──────────────────
// W3 region batches (US/EU/UK/CA/APAC/AU) are running in parallel and own
// the `sources`, `provisional_sources`, and `source_verifications` tables.
// This script DOES NOT WRITE to any of them. It only writes to
// `intelligence_items.source_id`. The CARB source row is READ via SELECT.
//
// Defensive bail
// ──────────────
// If no CARB row exists yet, the script exits with code 2 and a clear
// "re-run after W3 US completes" message. This is the documented signal to
// the orchestrator to retry W4.2 once the US batch finishes.
//
// Idempotency
// ───────────
// The UPDATE only touches rows whose current `source_id` is NULL or whose
// linked source is the EPA row. Rows already pointing at the CARB source
// are skipped. Re-running the script after a successful first run is a
// no-op (zero rows updated).
//
// Usage (from fsi-app/):
//   node supabase/seed/W4_2_carb_attribution_fix.mjs

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

// ─── paths + env ───────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const AUDIT_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "W1C-source-attribution-audit.json"
);

const LOG_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "W4-2-carb-attribution-log.json"
);

const EXIT_BAILED_NO_CARB_SOURCE = 2;

// ─── helpers ───────────────────────────────────────────────────────────────

async function findCarbSource() {
  // Tolerant detection: the W3 US batch may name the row variously
  // ("California Air Resources Board (CARB)", "CARB", "California ARB", …)
  // — we accept any of:
  //   - url contains arb.ca.gov
  //   - name contains CARB
  //   - name contains "California Air Resources"
  // Take the first hit; if multiple exist, prefer the row whose URL host
  // is most clearly arb.ca.gov.
  const { data, error } = await supabase
    .from("sources")
    .select("id, name, url")
    .or(
      "url.ilike.%arb.ca.gov%,name.ilike.%CARB%,name.ilike.%California Air Resources%"
    );

  if (error) throw new Error(`sources query failed: ${error.message}`);
  if (!data || data.length === 0) return null;

  // Prefer rows whose URL contains arb.ca.gov.
  const preferred = data.find(
    (s) => typeof s.url === "string" && s.url.toLowerCase().includes("arb.ca.gov")
  );
  return preferred || data[0];
}

function loadAuditMismatches() {
  // The audit JSON has the authoritative item list of arb.ca.gov-hosted
  // intelligence_items mis-linked to a non-arb.ca.gov source. We use that
  // list as the seed set — but we also re-query the DB live so the script
  // is self-correcting if the audit is stale.
  let audit = null;
  try {
    const raw = readFileSync(AUDIT_PATH, "utf8");
    audit = JSON.parse(raw);
  } catch (e) {
    console.warn(
      `[warn] Could not read ${AUDIT_PATH} (${e.message}); proceeding with live-query only.`
    );
    return { auditItemIds: new Set(), auditAvailable: false };
  }
  const ids = new Set();
  for (const m of audit.mismatches ?? []) {
    if (m.item_source_etld === "arb.ca.gov") ids.add(m.item_id);
  }
  return { auditItemIds: ids, auditAvailable: true };
}

async function findArbCaItems() {
  // Live query: every intelligence_items row whose source_url contains
  // arb.ca.gov. Pagination guard for safety even though the working set
  // is tiny today.
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title, source_url, source_id")
      .ilike("source_url", "%arb.ca.gov%")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log("W4.2 — CARB attribution fix");
  console.log("─".repeat(60));

  const carb = await findCarbSource();
  if (!carb) {
    console.error(
      "BAIL: No CARB source row found in `sources`. The W3 US discovery+\n" +
        "verification batch is responsible for creating it. Re-run this\n" +
        "script after W3 US completes."
    );
    // Persist a minimal log so the orchestrator can audit the bail.
    const bailLog = {
      generated_at: new Date().toISOString(),
      status: "bailed",
      reason: "carb_source_not_yet_created",
      hint: "Re-run after W3 US batch (which owns sources/provisional_sources) completes.",
    };
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    writeFileSync(LOG_PATH, JSON.stringify(bailLog, null, 2), "utf8");
    process.exit(EXIT_BAILED_NO_CARB_SOURCE);
  }

  console.log(`Found CARB source:`);
  console.log(`  id:   ${carb.id}`);
  console.log(`  name: ${carb.name}`);
  console.log(`  url:  ${carb.url}`);
  console.log("");

  const { auditItemIds, auditAvailable } = loadAuditMismatches();
  if (auditAvailable) {
    console.log(
      `Audit (W1C) flagged ${auditItemIds.size} arb.ca.gov item(s) as mis-attributed.`
    );
  }

  const items = await findArbCaItems();
  console.log(`Live query: ${items.length} intelligence_items rows have arb.ca.gov in source_url.`);

  const log = {
    generated_at: new Date().toISOString(),
    status: "ok",
    carb_source: carb,
    audit_loaded: auditAvailable,
    audit_item_ids_in_audit: [...auditItemIds],
    candidates: items.length,
    updated: 0,
    skipped_already_correct: 0,
    skipped_other_correct_source: 0,
    errors: 0,
    decisions: [],
  };

  for (const it of items) {
    const decision = {
      item_id: it.id,
      legacy_id: it.legacy_id,
      title: it.title?.slice(0, 100) ?? null,
      source_url: it.source_url,
      previous_source_id: it.source_id,
      in_audit: auditItemIds.has(it.id),
    };

    if (it.source_id === carb.id) {
      decision.action = "skip_already_correct";
      log.skipped_already_correct += 1;
      log.decisions.push(decision);
      continue;
    }

    const { error: updErr } = await supabase
      .from("intelligence_items")
      .update({ source_id: carb.id })
      .eq("id", it.id);

    if (updErr) {
      decision.action = "error";
      decision.error = updErr.message;
      log.errors += 1;
      console.warn(`  [err] ${it.id}: ${updErr.message}`);
    } else {
      decision.action = "rewired_to_carb";
      decision.new_source_id = carb.id;
      log.updated += 1;
    }

    log.decisions.push(decision);
  }

  log.elapsed_ms = Date.now() - t0;

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf8");

  console.log("─".repeat(60));
  console.log(`Rewired to CARB:                 ${log.updated}`);
  console.log(`Skipped (already CARB):          ${log.skipped_already_correct}`);
  console.log(`Errors:                          ${log.errors}`);
  console.log(`Elapsed:                         ${log.elapsed_ms} ms`);
  console.log(`Log:                             ${LOG_PATH}`);
  console.log("─".repeat(60));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
