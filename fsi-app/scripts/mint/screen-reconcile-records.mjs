#!/usr/bin/env node
// screen-reconcile-records.mjs — archive, reversibly, any LIVE record-grade item the relevance screen says
// is off-vertical; list the ambiguous ones for a ruling (Lane POP, 2026-09-02).
//
// WHY THIS EXISTS. Population-turn runs #9–#11 (2026-09-02) minted ~130 record-grade items from the
// `would_mint` census pool WITHOUT the relevance screen the operator ruled on 2026-08-31 (1,729 mint /
// 1,676 off-vertical / 256 need-fetch; Addendum 71). Screened afterwards, about half were off-vertical:
// Coast Guard safety zones, FAA airworthiness directives, federal pay rules, VAT derogation decisions,
// EC vehicle type-approval SIs — ADR-020's August incident, repeated by the runtime. The export gate
// (export-census-rows.mjs → partitionByScreen) stops the recurrence; this script is the runtime's own
// reconciliation for what already landed, and for any future drift between the corpus and the screen.
//
// WHAT IT DOES. Reads every live record-grade item, joins it to its census row by URL (for the census
// title and id — the id is what the operator's reviewed verdicts are keyed by), computes the verdict the
// one shared way (lib/screen-verdict.mjs), then:
//   off_vertical → archived through the guarded path (guardedUpdateByIds + archivePatch: is_archived,
//                  archive_reason = 'off_vertical', snapshot per chunk). Reversible: nothing is deleted.
//   ambiguous    → left live, listed in the summary for a ruling (the reviewed verdicts decide these;
//                  a row with no reviewed entry stays exactly where it is until someone rules).
//   on_vertical  → untouched.
// Dry by default (lists); --apply writes. Idempotent: an archived item is never a candidate again.
//
// USAGE:
//   node scripts/mint/screen-reconcile-records.mjs            # dry: what would be archived / needs a ruling
//   node scripts/mint/screen-reconcile-records.mjs --apply    # archive off-vertical records through the guarded path
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { screenVerdictFor } from "./lib/screen-verdict.mjs";
import { loadReviewedVerdicts } from "./export-census-rows.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const ARCHIVE_REASON = "off_vertical";
export const CITE = Object.freeze({
  skill: "record-tier-population-plan",
  reason:
    "Archive (reversibly) record-grade items the relevance screen rules off-vertical: population-turn runs " +
    "#9–#11 (2026-09-02) minted from the would_mint pool without the screen the operator ruled on 2026-08-31 " +
    "(ADR-020 scope). Verdict computed by scripts/mint/lib/screen-verdict.mjs (rules, then reviewed verdicts " +
    "where the rules said ambiguous); ambiguous items are left live and listed for a ruling.",
});

/** Pure: verdict for every live record item, given its census row (may be null) and the reviewed map. */
export function classifyLiveRecords(items, censusByUrl, reviewed = {}) {
  const out = [];
  for (const it of items ?? []) {
    const census = censusByUrl.get(it.source_url) ?? null;
    const v = screenVerdictFor(
      { id: census?.id ?? null, title: census?.title ?? it.title ?? "", document_url: it.source_url, surface_tags: census?.surface_tags ?? [] },
      reviewed,
    );
    out.push({ id: it.id, title: it.title, source_url: it.source_url, census_id: census?.id ?? null, ...v });
  }
  return out;
}

/**
 * @param {{ apply?: boolean }} opts
 * @param {{ readAll: Function, fetchRowsIn: Function, readClient: Function, guardedUpdateByIds: Function, archivePatch: Function, reviewed?: object }} deps
 */
export async function main({ apply = false } = {}, deps) {
  const { readAll, fetchRowsIn, readClient, guardedUpdateByIds, archivePatch } = deps;
  const reviewed = deps.reviewed ?? loadReviewedVerdicts();
  console.log(`[screen-reconcile] mode = ${apply ? "APPLY" : "DRY-RUN"}`);
  const items = await readAll("intelligence_items", "id, title, source_url, item_grade, is_archived", {
    match: (q) => q.eq("item_grade", "record").eq("is_archived", false),
  });
  const urls = [...new Set(items.map((i) => i.source_url).filter(Boolean))];
  const census = await fetchRowsIn(readClient(), "census_worklist", "id, document_url, title, surface_tags", "document_url", urls);
  const censusByUrl = new Map();
  for (const c of census) if (!censusByUrl.has(c.document_url)) censusByUrl.set(c.document_url, c);

  const classified = classifyLiveRecords(items, censusByUrl, reviewed);
  const off = classified.filter((c) => c.verdict === "off_vertical");
  const ambiguous = classified.filter((c) => c.verdict === "ambiguous");
  const on = classified.length - off.length - ambiguous.length;
  console.log(`[screen-reconcile] live record-grade items: ${classified.length} — on_vertical ${on}, off_vertical ${off.length}, ambiguous ${ambiguous.length}`);
  for (const o of off) console.log(`   ARCHIVE ${o.id} [${o.provenance}:${o.rule ?? "reviewed"}] ${String(o.title).slice(0, 90)}`);
  for (const a of ambiguous) console.log(`   RULING NEEDED ${a.id} ${String(a.title).slice(0, 90)}`);

  const summary = { mode: apply ? "apply" : "dry-run", live: classified.length, on_vertical: on, off_vertical: off.length, ambiguous: ambiguous.length, archived: 0, needs_ruling: ambiguous.map((a) => ({ id: a.id, census_id: a.census_id, title: a.title })) };
  if (!apply || !off.length) return summary;

  const res = await guardedUpdateByIds(
    "intelligence_items",
    off.map((o) => o.id),
    archivePatch("intelligence_items", ARCHIVE_REASON),
    { cite: CITE, select: "id", applyMatch: (q) => q.eq("item_grade", "record").eq("is_archived", false) },
  );
  const after = await readAll("intelligence_items", "id, is_archived, archive_reason", { match: (q) => q.in("id", off.map((o) => o.id)) });
  const archived = after.filter((r) => r.is_archived && r.archive_reason === ARCHIVE_REASON).length;
  console.log(`[screen-reconcile] archived ${archived} of ${off.length} (touched ${res.updated} in ${res.chunks} chunk(s), ${res.halvings} halvings)`);
  if (archived !== off.length) {
    console.error(`[screen-reconcile] MISMATCH — ${off.length} off-vertical items, ${archived} read back archived`);
    process.exitCode = 1;
  }
  return { ...summary, archived };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[screen-reconcile] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, readClient, guardedUpdateByIds, archivePatch } = await import("../lib/db.mjs");
  const { fetchRowsIn } = await import("./export-census-rows.mjs");
  main({ apply: process.argv.includes("--apply") }, { readAll, fetchRowsIn, readClient, guardedUpdateByIds, archivePatch }).catch((e) => {
    console.error("[screen-reconcile] fatal:", e);
    process.exit(1);
  });
}
