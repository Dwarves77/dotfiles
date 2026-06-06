/** CLEANUP (guarded, snapshotted): remove the DUPLICATE sources created 2026-06-06 by the capped-read
 *  bug in registerSource (it couldn't see same-host sources past row 1000, so it re-inserted 27 dupes
 *  of already-active sources). GOVERNING: remediation-discipline (clean up self-created pollution).
 *
 *  Deletes ONLY my-tagged rows that are duplicates:
 *    - PURE DUP: the host has an active source I did NOT create (the pre-existing one stays).
 *    - INTERNAL DUP: I inserted the same host twice (keep one).
 *  KEEPS my-tagged rows that are the SOLE active source for their host (genuine new registrations).
 *  SAFETY: aborts if any deletion would leave a host with zero active sources (would re-create an orphan).
 *  DRY-RUN default; --apply to delete. Reads paginated. Zero Browserless. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedDelete } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const host = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return "?"; } };
const isMine = (n) => /source-registration remediation 2026-06-06/.test(n || "");

const all = await readAll("sources", "id,url,status,notes");
const byHost = {};
for (const r of all) (byHost[host(r.url)] ||= []).push(r);

const toDelete = new Set();
// pure dups: my active rows whose host has a non-mine active source
for (const r of all) {
  if (!isMine(r.notes)) continue;
  const h = host(r.url);
  const activeNonMine = byHost[h].some((x) => x.id !== r.id && x.status === "active" && !isMine(x.notes));
  if (activeNonMine) toDelete.add(r.id);
}
// internal dups: among my rows on a host, keep exactly one if no non-mine active exists
for (const [h, rows] of Object.entries(byHost)) {
  const mineActive = rows.filter((r) => isMine(r.notes) && r.status === "active" && !toDelete.has(r.id));
  const nonMineActive = rows.some((r) => !isMine(r.notes) && r.status === "active");
  if (!nonMineActive && mineActive.length > 1) for (const r of mineActive.slice(1)) toDelete.add(r.id);
}

// SAFETY: every affected host must retain ≥1 active source after deletion.
const del = [...toDelete];
for (const h of new Set(del.map((id) => host((all.find((r) => r.id === id) || {}).url)))) {
  const remaining = byHost[h].filter((r) => r.status === "active" && !toDelete.has(r.id));
  if (remaining.length === 0) {
    console.error(`ABORT: deleting dupes for ${h} would leave 0 active sources (would re-orphan). No deletions performed.`);
    process.exit(2);
  }
}

const kept = all.filter((r) => isMine(r.notes) && !toDelete.has(r.id));
console.log(`\n===== DUP-SOURCE CLEANUP (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`my-tagged sources: ${all.filter((r) => isMine(r.notes)).length}  |  to delete (dupes): ${del.length}  |  keep (sole/legit): ${kept.length}`);
console.log(`keep: ${kept.map((r) => host(r.url)).join(", ") || "(none)"}`);

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to delete ${del.length} duplicate source rows.`); process.exit(0); }
if (!del.length) { console.log("nothing to delete."); process.exit(0); }

const r = await guardedDelete("sources", del, {
  cite: { skill: "remediation-discipline", reason: "remove duplicate sources self-created by the capped-read bug in registerSource (pre-existing active source retained per host)" },
});
console.log(`\nDELETED ${r.deleted}/${del.length}  snapshot=${r.snapshot.split(/[\\/]/).pop()}`);
process.exit(0);
