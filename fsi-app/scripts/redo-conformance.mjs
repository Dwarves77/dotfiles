/** CORPUS SKILL-CONFORMANCE REDO — regenerate the flagged items under the FIXED canonical pipeline so
 *  every brief conforms to the current skill contract (metadata persisted, grounded, structural).
 *
 *  Path per item: stored-first (generateBriefFromStored, 0 Browserless) -> section -> ground; on a
 *  bad/thin stored pool (generate ok:false) FRESH-FALLBACK to generateBrief (Browserless web_search+fetch)
 *  -> section -> ground. The metadata WRITE is the win (severity/format_type/etc. persisted); a ground
 *  failure is orthogonal (item stays quarantined but its brief metadata is now conformant).
 *
 *  Resumable: processes only currently-OPEN skill-conformance-audit flags, so a resumed run skips items a
 *  periodic `audit-skill-conformance.mjs --apply` already resolved. Circuit-breaker: STOP if the first
 *  CB_LIMIT consecutive items fail to generate the SAME way (guards against burning budget on a systematic
 *  break). Flag resolution is NOT done here — run the canonical auditor --apply (the conformance SoT)
 *  periodically / at end to flip now-conformant flags. Light retry on transient network errors only.
 *
 *  DRY-RUN default (prints the queue + plan). --apply runs. --limit=N caps the slice. --legacy=a,b targets. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, appendFileSync } from "node:fs";
import { createJiti } from "jiti";
import { readAll, readClient } from "../scripts/lib/db.mjs";
import { withRetry, isGenericRetryable, createProgressReporter } from "../scripts/lib/batch-primitives.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const LEGACY = (() => { const a = process.argv.find((x) => x.startsWith("--legacy=")); return a ? a.slice(9).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const EXCLUDE = (() => { const a = process.argv.find((x) => x.startsWith("--exclude=")); return a ? a.slice(10).split(",").map((s) => s.trim()).filter(Boolean) : []; })();
const CB_LIMIT = 6; // consecutive generate-failures -> circuit-break
const LOG = resolve(ROOT, "scripts/_diag/_redo.log");
const log = (m) => { console.log(m); try { appendFileSync(LOG, m + "\n"); } catch { /* */ } };

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBrief, generateBriefFromStored, sectionBrief, groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const sb = readClient();

// queue = open skill-conformance-audit flags (the DB-driven redo queue, resumable)
const flags = await readAll("integrity_flags", "subject_ref", { match: (q) => q.eq("created_by", "skill-conformance-audit").eq("status", "open") });
const flagged = new Set(flags.map((f) => f.subject_ref));
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false) });
let queue = items.filter((it) => flagged.has(it.id));
if (LEGACY) queue = queue.filter((it) => LEGACY.includes(it.legacy_id) || LEGACY.some((w) => it.id.startsWith(w)));
if (EXCLUDE.length) queue = queue.filter((it) => !(EXCLUDE.includes(it.legacy_id) || EXCLUDE.some((w) => it.id.startsWith(w))));
queue = queue.slice(0, LIMIT === Infinity ? queue.length : LIMIT);

log(`\n===== CONFORMANCE REDO (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
log(`open flags: ${flagged.size}; processing this run: ${queue.length}${LIMIT !== Infinity ? ` (--limit=${LIMIT})` : ""}`);
const byType = {}; for (const it of queue) byType[it.item_type] = (byType[it.item_type] || 0) + 1;
log(`by item_type: ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(", ")}`);
if (!APPLY) { log(`\nDRY-RUN — pass --apply [--limit=N]. stored-first -> fresh-fallback; circuit-break after ${CB_LIMIT} same-failures. Resolve flags via auditor --apply.`); process.exit(0); }

const retry = (fn) => withRetry(fn, { maxRetries: 1, isRetryable: isGenericRetryable });
const reporter = createProgressReporter({ total: queue.length, label: "redo" });
const results = [];
// Reversibility: snapshot each item's FULL prior row (all columns) BEFORE regenerating, so the prior
// brief + metadata is recoverable for re-edit/revert. Append-only JSONL keyed by run stamp.
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const SNAP = resolve(ROOT, `scripts/_snapshots/redo-prior-${RUN_STAMP}.jsonl`);
let consecFail = 0; let lastFailSig = null;
for (const it of queue) {
  const key = it.legacy_id || it.id.slice(0, 8);
  // snapshot prior state (full row) before any write
  try {
    const { data: prior } = await sb.from("intelligence_items").select("*").eq("id", it.id).single();
    if (prior) appendFileSync(SNAP, JSON.stringify({ ts: new Date().toISOString(), table: "intelligence_items", prior }) + "\n");
  } catch { /* snapshot best-effort; do not block the redo */ }
  let path = "stored", gen, sec, grd, err = null;
  try {
    gen = await retry(() => generateBriefFromStored(it.id))();
    if (!gen.ok) { path = "fresh"; gen = await retry(() => generateBrief(it.id))(); }
    if (gen.ok) { sec = await retry(() => sectionBrief(it.id))(); grd = await retry(() => groundBrief(it.id))(); }
  } catch (e) { err = (e.message || String(e)).slice(0, 160); }
  const genOk = !!gen?.ok;
  const out = { key, id: it.id, type: it.item_type, path, genOk, sectionOk: sec?.ok ?? null, groundOk: grd?.ok ?? null, detail: err || gen?.detail || "", grd: grd?.detail?.slice(0, 80) };
  results.push(out);
  reporter.tick({ name: key }, { status: genOk ? (grd?.ok ? "verified" : "meta-ok/ground-fail") : "GEN-FAIL" });
  log(`  ${key.padEnd(14)} ${path.padEnd(6)} gen=${genOk} section=${out.sectionOk} ground=${out.groundOk} :: ${(err || gen?.detail || "").slice(0, 90)}`);
  // circuit-breaker: count consecutive generate-failures with the same signature
  if (!genOk) {
    const sig = (err || gen?.detail || "fail").slice(0, 40);
    consecFail = sig === lastFailSig ? consecFail + 1 : 1; lastFailSig = sig;
    if (consecFail >= CB_LIMIT) {
      log(`\n!! CIRCUIT-BREAKER: ${consecFail} consecutive generate-failures with signature "${sig}". STOPPING.`);
      writeFileSync(resolve(ROOT, "scripts/_diag/_redo.json"), JSON.stringify(results, null, 1));
      reporter.complete();
      process.exit(2);
    }
  } else { consecFail = 0; lastFailSig = null; }
}
writeFileSync(resolve(ROOT, "scripts/_diag/_redo.json"), JSON.stringify(results, null, 1));
reporter.complete();
const genFail = results.filter((r) => !r.genOk).length;
const metaOk = results.filter((r) => r.genOk).length;
const verified = results.filter((r) => r.groundOk).length;
log(`\nSUMMARY: metadata-persisted ${metaOk}/${results.length}  (verified ${verified}, ground-deferred ${metaOk - verified})  | generate-failed ${genFail}`);
log(`Next: run \`node scripts/audit-skill-conformance.mjs --apply\` to resolve now-conformant flags. Re-run this to retry the generate-failed (resumable).`);
