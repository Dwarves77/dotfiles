// Revert the batch grow-pass over-registration: delete the 135 provisional sources it created in the
// 13:58–14:04 window. They introduced one-tier-per-host / claims-tier / ledger regressions (a host already
// at tier A got a new provisional row at tier B). guardedDelete snapshots first (reversible). DRY by default.
import { readClient, readAll, guardedDelete } from "../lib/db.mjs";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\//, "");
try { process.loadEnvFile(ROOT + ".env.local"); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const sources = await readAll("sources", "id,url,status,created_at,auto_run_enabled");
// grow window: provisional rows created after 13:55 today (cluster was 13:58–14:04). Safety: also require
// status=provisional AND auto_run_enabled=false (grow's exact insert shape) so nothing else is caught.
// ABSOLUTE window (not rolling — the cluster was 2026-06-20 13:58–14:04 UTC; 135 rows). Pinning it makes
// the revert deterministic regardless of when this runs, and avoids touching the 376 pre-existing
// provisional sources (e.g. 2026-06-06 batch).
const WIN_LO = "2026-06-20T13:55", WIN_HI = "2026-06-20T14:10";
const targets = sources.filter((s) => s.status === "provisional" && s.auto_run_enabled === false && s.created_at >= WIN_LO && s.created_at <= WIN_HI);
console.log(`grow-window provisional sources to revert: ${targets.length}`);
const span = targets.map((t) => Date.parse(t.created_at)).sort();
if (span.length) console.log(`  created_at window: ${new Date(span[0]).toISOString().slice(11, 19)} .. ${new Date(span[span.length - 1]).toISOString().slice(11, 19)}`);
console.log(`  sample: ${targets.slice(0, 6).map((t) => { try { return new URL(t.url).host; } catch { return t.url; } }).join(", ")}`);
if (!APPLY) { console.log("\nDRY-RUN — pass --apply to guardedDelete (snapshots first)."); process.exit(0); }
const r = await guardedDelete("sources", targets.map((t) => t.id), { cite: { skill: "remediation-discipline", reason: "revert batch grow-pass over-registration (135 provisional sources) that broke one-tier-per-host/claims-tier/ledger; grow must run per-item in the workflow, not as a 251-item batch" } });
console.log(`\nDELETED ${r.deleted} provisional sources. snapshot: ${r.snapshot}`);
process.exit(0);
