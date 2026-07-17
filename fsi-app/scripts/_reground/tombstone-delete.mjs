#!/usr/bin/env node
// tombstone-delete.mjs — TOMBSTONE-THEN-DELETE (operator amendment 2026-07-16). For each item, under its lease:
// write its IDENTITY to disposition_ledger (permanent institutional memory: item_key, canonical_instrument_key,
// archive_reason, snapshot pointer, disposition) FIRST, then guarded-delete the item — fail-closed (no tombstone,
// no delete). Reaches zero-archived without losing the dedup memory. Reusable for the archive-endgame buckets and
// for duplicate merges (disposition=merged_into + --merged-into=<id>).
// Usage: node tombstone-delete.mjs <itemId|key>... --disposition=<reason> [--merged-into=<id>] [--holder=session-A] [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const DISP = (() => { const a = process.argv.find((x) => x.startsWith("--disposition=")); return a ? a.slice(14) : null; })();
const MERGED = (() => { const a = process.argv.find((x) => x.startsWith("--merged-into=")); return a ? a.slice(14) : null; })();
const HOLDER = (() => { const a = process.argv.find((x) => x.startsWith("--holder=")); return a ? a.slice(9) : "session-A"; })();
const BUCKET = (() => { const a = process.argv.find((x) => x.startsWith("--bucket=")); return a ? a.slice(9) : null; })();
const EMPTY_ONLY = process.argv.includes("--empty-only"); // mechanical content gate: brief_len=0 AND claim_ct=0
// GROUP-② tombstone rule (operator ruling 2026-07-17): a confirm-archive source-description (content-bearing) may
// be tombstone-deleted ONLY where its source row verifiably EXISTS and is ACTIVE — the content must survive
// somewhere (the source row) before the item stops being the place it survives. --require-active-source enforces
// it in the tool: any item lacking an active source row is REFUSED (register the source first, or HOLD).
const REQUIRE_ACTIVE_SOURCE = process.argv.includes("--require-active-source");
const keys = process.argv.slice(2).filter((x) => !x.startsWith("--"));

// ARCHIVE-ENDGAME deletable-reason allowlist (operator ruling 2026-07-16). A bucket may be DELETED only when its
// content SURVIVES ELSEWHERE (as a registered source, or as a surviving duplicate/merge target) or the row is a
// pure non-item artifact. Accurate-but-archived reasons (off_vertical, non_regulatory_source, Superseded, Repealed)
// are NEVER in this map — never delete accurate data. A --bucket outside this map is REFUSED (mechanical gate, not
// judgment). The value is the disposition string written to disposition_ledger.
const DELETABLE_REASONS = {
  reclassified_to_source: "tombstone_delete_reclassified",    // content survives as a registered source
  source_not_item:        "tombstone_delete_source_not_item", // a source, not an item
  portal_artifact:        "tombstone_delete_artifact",        // portal/index page, not an item
  error_page_artifact:    "tombstone_delete_artifact",        // captured error page, not an item
  duplicate_instrument:   "tombstone_delete_duplicate",       // duplicate of another instrument
  duplicate_of_verified:  "tombstone_delete_duplicate",       // duplicate of a verified item
  duplicate:              "tombstone_delete_duplicate",        // duplicate
};

if (!BUCKET && (!keys.length || !DISP)) { console.error("usage: tombstone-delete.mjs (<key>... --disposition=<reason> | --bucket=<archive_reason>) [--merged-into=<id>] [--holder=session-A] [--apply]"); process.exit(1); }
if (BUCKET && !DELETABLE_REASONS[BUCKET]) { console.error(`REFUSED: bucket '${BUCKET}' is not in the deletable-reason allowlist (content-survives / duplicate / pure-artifact only). Accurate-but-archived reasons are never bucket-deleted.`); process.exit(1); }

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedInsert, guardedDelete } = await jiti.import("../lib/db.mjs");
const { acquireLease, releaseLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

const all = await readAll("intelligence_items", "id,legacy_id,title,canonical_instrument_key,source_url,source_id,is_archived,archive_reason,full_brief", {});
let targets, effDisp;
if (BUCKET) {
  // CENSUS GATE: only items the archive census verdicted 'archive_correct' are eligible.
  // A 'review_valuable' row in the same bucket is NOT deleted here — it routes to the per-item review lane.
  const census = await readAll("corpus_census", "intelligence_item_id,haiku_verdict", { orderBy: "intelligence_item_id" });
  const correct = new Set(census.filter((c) => c.haiku_verdict === "archive_correct").map((c) => c.intelligence_item_id));
  targets = all.filter((x) => x.is_archived && x.archive_reason === BUCKET && correct.has(x.id));
  // MECHANICAL CONTENT GATE (operator ruling 2026-07-17, "label is not proof"): title-level classification
  // cannot authorize an irreversible delete — only content-level emptiness can. --empty-only enforces it in the
  // TOOL: a row survives to deletion ONLY if it carries brief_len=0 AND zero grounded claims. Any content-bearing
  // row in the bucket is SKIPPED (routes to per-item review), never deleted on the strength of its archive_reason.
  if (EMPTY_ONLY) {
    const prov = await readAll("section_claim_provenance", "intelligence_item_id", {});
    const withClaims = new Set(prov.map((p) => p.intelligence_item_id));
    const before = targets.length;
    const skipped = targets.filter((x) => (x.full_brief || "").length > 0 || withClaims.has(x.id));
    targets = targets.filter((x) => (x.full_brief || "").length === 0 && !withClaims.has(x.id));
    console.log(`  --empty-only gate: ${targets.length} provably-empty kept, ${skipped.length} content-bearing SKIPPED to review (of ${before} census-correct in bucket)`);
    for (const s of skipped) console.log(`    SKIP(content) ${s.id.slice(0, 8)} ${s.legacy_id || ""} brief=${(s.full_brief || "").length}ch — routes to per-item review`);
  }
  effDisp = DISP || DELETABLE_REASONS[BUCKET];
} else {
  targets = keys.map((k) => all.find((x) => x.id === k || x.id.startsWith(k) || (x.legacy_id || "") === k || (x.legacy_id || "").startsWith(k))).filter(Boolean);
  effDisp = DISP;
}
console.log(`\n===== TOMBSTONE-THEN-DELETE (${APPLY ? "APPLY" : "DRY-RUN"})${BUCKET ? ` bucket=${BUCKET}` : ""} disposition=${effDisp}${MERGED ? ` merged_into=${MERGED.slice(0, 8)}` : ""} =====`);
console.log(`  ${targets.length} target(s)${BUCKET ? " (census archive_correct only)" : ""}`);
for (const it of targets) console.log(`  ${it.id.slice(0, 8)} ${it.legacy_id || ""} | arch=${it.is_archived} brief=${(it.full_brief || "").length}ch | ${String(it.title).slice(0, 50)}`);
if (!APPLY) { console.log(`\n(dry-run — --apply to tombstone + guarded-delete ${targets.length} item(s))`); process.exit(0); }

// GROUP-② gate: build the active-source set once (content-survives precondition for a source-description delete).
let activeSrc = null;
if (REQUIRE_ACTIVE_SOURCE) {
  const srcs = await readAll("sources", "id,status", {});
  activeSrc = new Set(srcs.filter((s) => s.status === "active").map((s) => s.id));
}

let done = 0;
for (const it of targets) {
  if (REQUIRE_ACTIVE_SOURCE && !(it.source_id && activeSrc.has(it.source_id))) {
    console.log(`  REFUSE ${it.id.slice(0, 8)}: no ACTIVE source row (content would not survive) — register source first or HOLD, NOT deleted`);
    continue;
  }
  const lease = await acquireLease(sb, it.id, HOLDER, "A");
  if (!lease.acquired) { console.log(`  SKIP ${it.id.slice(0, 8)}: leased by ${lease.cur_holder}`); continue; }
  try {
    // snapshot pointer: keep a durable content pointer (the source snapshot survives in raw_fetches).
    let snapPtr = it.source_id || null;
    const cite = { skill: "remediation-discipline", reason: `archive-endgame tombstone-then-delete (operator ruling 2026-07-16): record identity to disposition_ledger then guarded-delete verified-correct archive ${it.legacy_id || it.id.slice(0, 8)} (${effDisp})` };
    // 1. TOMBSTONE FIRST (fail-closed: guardedInsert throws -> delete never runs)
    await guardedInsert("disposition_ledger", {
      intelligence_item_id: it.id, item_key: it.legacy_id || null, canonical_instrument_key: it.canonical_instrument_key || null,
      title: it.title || null, source_url: it.source_url || null, archive_reason: it.archive_reason || null,
      disposition: effDisp, merged_into_item_id: MERGED || null, snapshot_pointer: snapPtr, disposition_by: HOLDER,
    }, { cite });
    // 2. GUARDED DELETE (cascades sections/claims via FK)
    await guardedDelete("intelligence_items", [it.id], { cite });
    done++; console.log(`  tombstoned + deleted ${it.id.slice(0, 8)} (${it.legacy_id || ""})`);
  } catch (e) { console.log(`  FAILED ${it.id.slice(0, 8)}: ${e.message}`); }
  finally { await releaseLease(sb, it.id, HOLDER).catch(() => {}); }
}
console.log(`\ntombstoned + deleted ${done}/${targets.length}.`);
process.exit(0);
