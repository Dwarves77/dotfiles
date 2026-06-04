/**
 * source-merge-canonical-url.mjs — guarded data-op. Merges the SAFE duplicate set only:
 * active sources sharing the SAME canonical URL (unambiguously the same resource). Entity
 * dupes (same name, different URLs = defect b) are NOT touched — they need the
 * institution-identity decision. Reuses the supersession shape: loser -> status='suspended'
 * + note referencing the winner; intelligence_items.source_id repointed loser -> winner.
 *
 * DISCIPLINE: dry-run default (--execute --confirm). Per-row guards (WHERE source_id=loser /
 * WHERE status='active') + read-back asserts + halt-on-mismatch. Reversible ledger
 * (scripts/_diag/source-merge-log.json). Winner: HIGH conf > non-null role > most items >
 * lowest base_tier > lowest id.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeUrl } from "../src/lib/sources/url-canonicalize.ts";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");
const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r);
const confRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const log = { mode: EXECUTE ? "EXECUTE" : "DRY-RUN", clusters: [], halted: false };
let mergedLosers = 0, repointed = 0, halted = false;
try {
  const rows = (await q(`SELECT s.id, s.name, s.url, s.source_role, s.base_tier, s.classification_confidence conf,
     (SELECT count(*)::int FROM intelligence_items i WHERE i.source_id=s.id) items
     FROM sources s WHERE s.status='active'`)).rows;
  for (const r of rows) r.canon = canonicalizeUrl(r.url);
  const byCanon = new Map(); for (const r of rows) (byCanon.get(r.canon) || byCanon.set(r.canon, []).get(r.canon)).push(r);
  const clusters = [...byCanon.values()].filter((v) => v.length > 1);
  const pickWinner = (v) => [...v].sort((a, b) =>
    (confRank[b.conf] || 0) - (confRank[a.conf] || 0) ||
    ((b.source_role ? 1 : 0) - (a.source_role ? 1 : 0)) ||
    (b.items - a.items) || (a.base_tier - b.base_tier) || (a.id < b.id ? -1 : 1))[0];

  console.log(`===== SOURCE MERGE (same canonical URL) — ${log.mode} — ${clusters.length} clusters =====`);
  for (const v of clusters) {
    const w = pickWinner(v);
    const losers = v.filter((r) => r.id !== w.id);
    const entry = { canon: w.canon, winner: w.id, losers: [] };
    for (const l of losers) {
      const items = (await q(`SELECT id FROM intelligence_items WHERE source_id=$1`, [l.id])).rows.map((x) => x.id);
      if (EXECUTE) {
        const blocked = [];
        for (const itemId of items) {
          try {
            const u = await q(`UPDATE intelligence_items SET source_id=$2 WHERE id=$1 AND source_id=$3 RETURNING source_id`, [itemId, w.id, l.id]);
            if (u.rowCount !== 1 || u.rows[0].source_id !== w.id) { blocked.push({ itemId, reason: "read-back mismatch" }); continue; }
            repointed++;
          } catch (e) {
            blocked.push({ itemId, reason: e.code === "42501" ? "provenance-flip guard (#43): needs reconciler credential" : `${e.code || ""} ${e.message}` });
          }
        }
        if (blocked.length) {
          // Cannot move all of this loser's items -> leave the cluster INTACT (do not suspend),
          // flag it. (e.g. an 'unverified' item whose repoint trips the #43 provenance guard.)
          entry.losers.push({ id: l.id, name: l.name, blocked, repointedItems: [] });
          entry.blocked = true;
          console.log(`  BLOCKED loser ${l.id.slice(0,8)} (${blocked.length} item(s) guard-blocked) — cluster left intact, flagged`);
          continue;
        }
        const su = await q(`UPDATE sources SET status='suspended',
            notes = coalesce(notes,'') || $2 WHERE id=$1 AND status='active' RETURNING status`,
          [l.id, ` [merged into ${w.id.slice(0,8)} by source-dedup 2026-06-03 — same canonical URL]`]);
        if (su.rowCount !== 1 || su.rows[0].status !== 'suspended') { halted = true; console.error(`  HALT: suspend ${l.id} failed`); break; }
      } else { repointed += items.length; }
      mergedLosers++;
      entry.losers.push({ id: l.id, name: l.name, repointedItems: items });
      console.log(`  ${EXECUTE ? "MERGED" : "WOULD"} loser ${l.id.slice(0,8)} -> winner ${w.id.slice(0,8)}  (${items.length} items repointed)  [${w.canon}]`);
    }
    log.clusters.push(entry);
    if (halted) break;
  }
  log.halted = halted;
  console.log(`\n  losers ${EXECUTE ? "suspended" : "to suspend"}: ${mergedLosers}   items repointed: ${repointed}   halted: ${halted}`);
  writeFileSync(resolve(__dirname, "_diag", "source-merge-log.json"), JSON.stringify(log, null, 0));
  console.log(`  ledger -> scripts/_diag/source-merge-log.json  (reversal: set losers status='active', repoint items back)`);
  console.log(EXECUTE ? (halted ? "\n  HALTED — partial; inspect ledger." : "\n  DONE (executed).") : "\n  DRY-RUN only. Re-run with  --execute --confirm.");
} finally { await c.end(); }
