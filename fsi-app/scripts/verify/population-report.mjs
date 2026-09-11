#!/usr/bin/env node
// population-report.mjs — is each store BUILT, or is it built AND FILLED?
//
// WHY THIS EXISTS. Waves 4-7 built three stores, the producers that fill them, and the readers that
// display them — and shipped with all three stores empty, because the sandbox those waves ran in
// cannot reach the upstream sources (ec.europa.eu, energy.ec.europa.eu, api.bls.gov: all HTTP 000
// under the org egress policy, confirmed 2026-08-30). Nothing in the repo made that visible. The
// suite passed, the fitness functions passed, tsc passed, and three surfaces rendered a location
// with nothing in it. Every gate this codebase has answers "is the code correct?" — none answered
// "is there anything to show?", so the emptiness had to be noticed by a person asking. That is
// exactly the kind of check that gets skipped on the day it matters.
//
// NOT A PASS/FAIL TEST, deliberately. Mid-build, empty is the CORRECT state for a store whose
// producer has not been armed yet — you build the place to put the information before you populate
// it. A check that went red for being mid-build would be switched off within a week. What this does
// instead is make the state legible: every store, its row count, the number that actually decides
// whether its reader shows anything, and the named producer that would fill it.
//
// `--strict` flips it to a hard gate, for the one caller where empty IS a failure: the step that
// runs immediately after a producer's `--apply` in .github/workflows/producers.yml.
//
// $0: read-only, count-only. No writes, no model calls, no metered anything.

import { readClient, readAll } from "../lib/db.mjs";
import { STUB_BRIEF_MARKER } from "../../src/lib/intake/record-facts.mjs";
import { isMainModule } from '../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard

/**
 * Each entry names the store, the reader that renders it, and `fill` — the column whose non-null
 * count decides whether that reader has anything real to show. Row count alone is the wrong
 * question: regional_data_facts carried 75 rows the entire time while holding ZERO enveloped
 * values, so the matrix's indexed layer showed nothing despite a non-zero count. `fill` is the
 * honest number, and the gap between the two is the whole point of this report.
 *
 * An entry may instead supply `totalQuery(sb)`/`filledQuery(sb)` — async functions returning
 * `{count, error}` — for a store where "filled" isn't a plain non-null-column count (brief coverage,
 * below, needs a text-pattern match, not a null check). `fill` stays required even then, as the
 * human-readable label countStore's row prints next to the number.
 */
export const STORES = Object.freeze([
  { table: "market_series", fill: "value_numeric",
    reader: "/market — series board (WO-16)",
    producer: "scripts/producers/market/eu-weekly-oil-bulletin.mjs" },
  { table: "emission_factors", fill: "ttw_co2e",
    reader: "/admin/factors (WO-18)",
    producer: "scripts/gen/emission-factors-{epa,desnz}.mjs" },
  { table: "regional_data_facts", fill: "value_numeric",
    reader: "/operations — region-dimension matrix, indexed layer (WO-9 layer 2)",
    producer: "scripts/producers/regional/{eurostat-nrg-pc-205,bls-oews}-producer.mjs" },
  { table: "state_cost_facts", fill: "value",
    reader: "/operations — By-state roster (WO-10)",
    producer: "(seeded; no recurring producer)" },
  { table: "published_price_statistics", fill: "value_display",
    reader: "/market/[slug] PriceBoard + /market list key figure (WO-13)",
    producer: "scripts/producers/market/refresh-published-price-statistics.mjs" },
  { table: "theme_briefs", fill: "brief_md",
    reader: "/research/[slug] — cluster synthesis card (WO-25)",
    producer: "flywheel U6 theme-brief pass" },
  // ── DATECHAIN lane, 2026-09-11 — the three date-chain stores + brief coverage, named directly by
  // the operator's 2026-09-09 ruling ("briefs need to exist for all items as well"). These four were
  // the exact gap this population-report guard was invented to catch and did not: built-but-empty
  // stores the CI/build gates never questioned. See docs/ops/runbooks/date-chain-2026-09-11.md.
  { table: "item_timelines", fill: "milestone_date",
    reader: "item detail page — §14 Confirmed Regulatory Timeline widget",
    producer: "canonical-pipeline.ts harvestItemTimeline() (per-generation) + scripts/backfill-item-timelines.mjs (corpus sweep, revived from _archive/ this lane)" },
  { table: "item_forward_events", fill: "event_date",
    reader: "/api/admin/forward-events — upcoming-obligations queue",
    producer: "mint-item.ts / apply-staged-update.ts (per-item, rule 16(b)) + scripts/forward-events/dispatch-extraction.mjs (corpus backfill, this lane)" },
  { table: "intelligence_items", fill: "compliance_deadline",
    reader: "item summary card — compliance deadline field",
    producer: "src/lib/forward-events/compliance-deadline-sync.mjs, called from mint-item.ts / apply-staged-update.ts and scripts/forward-events/dispatch-extraction.mjs" },
  { table: "intelligence_items", fill: `full_brief (non-stub; stub = "${STUB_BRIEF_MARKER}")`,
    reader: "every item detail page — the full_brief body itself",
    producer: "canonical-pipeline.ts generateBrief() — a subscription-lane intake pass, see the runbook's command 3",
    totalQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false),
    filledQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false).not("full_brief", "ilike", `%${STUB_BRIEF_MARKER}%`) },
  // -- W9 PART1 lane, 2026-09-11: three entries guarding the "connected at birth" wiring tasks 1.1-1.3
  // add (rule 17: nothing mints alone). Each watches a specific wiring gap the ruling in section 0 of
  // docs/plans/brief-chain-build-plan-2026-09-11.md named by measurement, not guess.
  //
  // RED means: at least one live item was minted (or still stands from before the wiring landed) without
  // the connection this entry checks for, with zero of the corpus showing the connection made at all.
  { table: "entity_refs", fill: "distinct live items carrying an entity_refs row",
    reader: "the entity spine (migration 282/283): jurisdiction linkage a live item's own connections read",
    producer: "src/lib/entities/link-item-entities.mjs, called from mint-item.ts post-insert (task 1.1) and apply-staged-update.ts, plus scripts/entities/backfill-entities.mjs for the corpus catch-up",
    // RED means: no live item anywhere has an entity_refs row, so the mint-time write (task 1.1) is
    // either not wired or has never fired. `filled` is the distinct entity_refs.ref_id count for
    // ref_table='intelligence_items', not a count re-verified against the live corpus by id: PostgREST
    // gives entity_refs.ref_id no FK to embed through (a generic (ref_table, ref_id) pair, by migration
    // 283's own design note), and cross-checking it would mean an .in() filter carrying every id in the
    // corpus, exactly the unbounded-URL defect class F39 exists to catch (IN-CHUNK, 2026-09-06). The read
    // goes through readAll (scripts/lib/db.mjs), paginated, never a raw .select() that CAP-1000 would
    // silently truncate once entity_refs passes 1,000 rows. Distinctness is the same Set-based collapse
    // scripts/entities/backfill-entities.mjs already uses (multiple jurisdiction roles per item).
    totalQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false),
    filledQuery: async (sb) => {
      try {
        const rows = await readAll("entity_refs", "ref_id", { match: (q) => q.eq("ref_table", "intelligence_items"), client: sb });
        return { count: new Set(rows.map((r) => r.ref_id)).size, error: null };
      } catch (e) {
        return { count: null, error: { message: e.message } };
      }
    } },
  { table: "intelligence_items", fill: "format_type",
    reader: "item detail page + surface routing: format_type selects which of the five section templates renders",
    producer: "mint-item.ts (stamped at birth from item_type, task 1.2) + canonical-pipeline.ts synthesiseAndWriteBrief (forced post-generation) + scripts/maintenance/backfill-format-type.mjs (corpus catch-up for the 128 rows minted before task 1.2, task 2.4)",
    // RED means: every live item has a null format_type, so task 1.2's birth stamp is either not wired
    // or has never fired (the pre-1.2 backlog alone cannot make this ROWS_NO_VALUES, since every item
    // minted after 1.2 lands with format_type set).
    totalQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false),
    filledQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false).not("format_type", "is", null) },
  { table: "intelligence_items", fill: "canonical_instrument_key CELEX Decisions typed as regulation",
    reader: "/regulations surface: a CELEX Decision is a binding act (Article 288 TFEU) and belongs on the regulation format, not initiative's market-signal one (task 1.3's export-census-rows.mjs mapping)",
    producer: "scripts/mint/export-census-rows.mjs classifyItemTypeFromCelexKey() (new mints, task 1.3) + task 5.5's corpus retype of the 351 live rows minted before task 1.3 landed",
    // RED means: every live item whose canonical_instrument_key is CELEX-Decision-shaped (sector 2/3/4,
    // letter D) is still typed something other than regulation, the pre-1.3 backlog task 5.5 owns.
    // `total` matches on the KEY SHAPE alone, not item_type, deliberately: filtering total to
    // item_type='initiative' would make this entry's row count itself go to zero the moment task 5.5
    // retypes the backlog, landing on EMPTY (rows===0), which classify() never reports as FILLED, so a
    // fixed corpus would read as permanently red. Matching on the key across every type keeps `total`
    // stable (the key never changes) while `filled` (item_type='regulation' among that same set) climbs
    // from 0 to the full 351 as task 5.5 lands, the same growing-good-count shape compliance_deadline uses.
    totalQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false).regexMatch("canonical_instrument_key", "^[234]\\d{4}D"),
    filledQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false).regexMatch("canonical_instrument_key", "^[234]\\d{4}D").eq("item_type", "regulation") },
]);

/**
 * The three states, as a pure function of two counts. Separated out so the distinction that matters
 * — ROWS_NO_VALUES, the one that fooled us — is pinned by a test rather than living inline in a
 * console.log where nothing can assert on it.
 * @returns {"EMPTY"|"ROWS_NO_VALUES"|"FILLED"}
 */
export function classify({ rows, filled }) {
  if (rows === 0) return "EMPTY";
  if (filled === 0) return "ROWS_NO_VALUES";
  return "FILLED";
}

/** Pure renderer: results -> printable lines. Injectable so the CLI's output is testable. */
export function renderReport(results) {
  const out = ["", "POPULATION REPORT — built, or built and filled?", ""];
  const w = Math.max(...results.map((r) => r.table.length));
  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) {
    const state = classify(r);
    out.push(`  ${pad(r.table, w)}  rows=${pad(r.rows, 5)} ${pad(`${r.fill}=${r.filled}`, 22)} ${state}`);
    if (state !== "FILLED") {
      out.push(`  ${pad("", w)}  -> reader "${r.reader}" has nothing to show`);
      out.push(`  ${pad("", w)}  -> fill it with: ${r.producer}`);
    }
  }
  const unfilled = results.filter((r) => classify(r) !== "FILLED");
  out.push("");
  out.push(
    `  ${results.length - unfilled.length}/${results.length} stores filled.` +
      (unfilled.length ? `  UNFILLED: ${unfilled.map((r) => r.table).join(", ")}` : "  All readers have data.")
  );
  out.push("");
  out.push("  Empty is a legitimate mid-build state — the store and its reader get built before the");
  out.push("  producer is armed. This report exists so that state stays visible rather than being");
  out.push("  rediscovered later by someone wondering why a page looks blank.");
  out.push("");
  return out;
}

/** Count one store. Injectable client so this is exercisable without a database. `totalQuery`/
 *  `filledQuery` (see STORES' own doc comment) override the default plain-count / not-null-count
 *  queries for a store whose "filled" isn't a bare null check. */
export async function countStore(sb, { table, fill, totalQuery, filledQuery }) {
  const total = totalQuery ? await totalQuery(sb) : await sb.from(table).select("*", { count: "exact", head: true });
  if (total.error) throw new Error(`${table}: ${total.error.message}`);
  const filled = filledQuery ? await filledQuery(sb) : await sb.from(table).select("*", { count: "exact", head: true }).not(fill, "is", null);
  if (filled.error) throw new Error(`${table}.${fill}: ${filled.error.message}`);
  return { rows: total.count ?? 0, filled: filled.count ?? 0 };
}

export async function collect(sb, stores = STORES) {
  const results = [];
  for (const s of stores) results.push({ ...s, ...(await countStore(sb, s)) });
  return results;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
// Guarded so importing this module for its pure parts never opens a database connection.
if (isMainModule(import.meta.url)) {
  const strict = process.argv.includes("--strict");
  const results = await collect(readClient());
  console.log(renderReport(results).join("\n"));
  const unfilled = results.filter((r) => classify(r) !== "FILLED");
  if (strict && unfilled.length) {
    console.error(`::error::--strict: ${unfilled.length} store(s) still unfilled after this run.`);
    process.exit(1);
  }
}
