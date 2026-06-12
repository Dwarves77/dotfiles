/** SPOT-CHECK: for a few verified-legacy items needing redo, regenerate BOTH ways and compare —
 *  generateBriefFromStored (reuse saved pool, 0 Browserless) vs generateBrief (fresh scrape) — so we
 *  decide whether stored-only is good enough for the first-build conformance redo before committing the
 *  whole set. Snapshots the original full_brief first (reversible). DRY-RUN lists candidates; --apply runs.
 *  Order per item: snapshot -> FROM-STORED (brief+section+ground, capture metrics) -> FRESH (same). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const N = (() => { const a = process.argv.find((x) => x.startsWith("--n=")); return a ? parseInt(a.slice(4), 10) : 3; })();
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBrief, generateBriefFromStored, sectionBrief, groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");

const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status,full_brief,format_type,severity,topic_tags").eq("id", id).single()).data;
const claimCount = async (id) => (await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", id)).count;

// candidates: open skill-conformance-audit flag + provenance verified (legacy-verified target) + has stored pool
const flags = await readAll("integrity_flags", "subject_ref", { match: (q) => q.eq("created_by", "skill-conformance-audit").eq("status", "open") });
const flagged = new Set(flags.map((f) => f.subject_ref));
const pool = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const poolItems = new Set(pool.filter((p) => (p.result_content_excerpt || "").length > 200).map((p) => p.intelligence_item_id));
const verified = await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified") });
const candidates = verified.filter((it) => flagged.has(it.id) && poolItems.has(it.id)).slice(0, N);

console.log(`\n===== SPOT-CHECK stored-vs-fresh (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`candidates (verified + needs-redo + has stored pool): ${candidates.length}`);
for (const it of candidates) console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(12)} ${it.item_type.padEnd(16)} ${(it.title || "").slice(0, 44)}`);
if (!APPLY) { console.log(`\nDRY-RUN — pass --apply [--n=N]. Will regen each BOTH ways + compare.`); process.exit(0); }

const report = [];
for (const it of candidates) {
  const key = it.legacy_id || it.id.slice(0, 8);
  const before = await prov(it.id);
  const snapshot = before?.full_brief || "";
  console.log(`\n── ${key} (${it.item_type}) ──`);
  // FROM STORED
  let stored = { ok: false };
  try {
    const g = await generateBriefFromStored(it.id);
    if (g.ok) { await sectionBrief(it.id); await groundBrief(it.id); }
    const a = await prov(it.id);
    stored = { ok: g.ok, detail: g.detail, len: (a?.full_brief || "").length, prov: a?.provenance_status, claims: await claimCount(it.id), fmt: a?.format_type, sev: a?.severity, topics: a?.topic_tags };
  } catch (e) { stored = { ok: false, detail: e.message.slice(0, 80) }; }
  console.log(`  STORED: ok=${stored.ok} len=${stored.len} prov=${stored.prov} claims=${stored.claims} fmt=${stored.fmt} topics=${JSON.stringify(stored.topics)} :: ${stored.detail || ""}`);
  // FRESH
  let fresh = { ok: false };
  try {
    const g = await generateBrief(it.id);
    if (g.ok) { await sectionBrief(it.id); await groundBrief(it.id); }
    const a = await prov(it.id);
    fresh = { ok: g.ok, detail: g.detail, len: (a?.full_brief || "").length, prov: a?.provenance_status, claims: await claimCount(it.id), fmt: a?.format_type, sev: a?.severity, topics: a?.topic_tags };
  } catch (e) { fresh = { ok: false, detail: e.message.slice(0, 80) }; }
  console.log(`  FRESH : ok=${fresh.ok} len=${fresh.len} prov=${fresh.prov} claims=${fresh.claims} fmt=${fresh.fmt} topics=${JSON.stringify(fresh.topics)} :: ${fresh.detail || ""}`);
  report.push({ key, type: it.item_type, snapshotLen: snapshot.length, stored, fresh });
  writeFileSync(resolve(ROOT, `scripts/_diag/_spotcheck_${key}.md`), `# ORIGINAL\n${snapshot}\n`);
}
writeFileSync(resolve(ROOT, "scripts/_diag/_spotcheck.json"), JSON.stringify(report, null, 1));
console.log(`\nsummary -> scripts/_diag/_spotcheck.json (originals snapshotted to _spotcheck_<key>.md)`);
console.log(`\nVERDICT GUIDE: prefer STORED if its prov=verified + claims>0 + conformant fields (fmt/topics) match FRESH. If STORED is thin/unverified vs FRESH, that item needs a fresh scrape.`);
