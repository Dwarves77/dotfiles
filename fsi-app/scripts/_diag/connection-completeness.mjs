/**
 * connection-completeness.mjs — READ-ONLY.
 * The "not a single part is unconnected" proof. For EVERY public table, derive
 * its write-side and read-side connection state from BOTH (a) the whole codebase
 * (src/, scripts/, supabase/seed/, migrations, .github) and (b) every Postgres
 * function/trigger body (the RPC/trigger layer that a .from() grep undercounts).
 * Then run the reverse orphan scan: every .from("X")/.rpc("Y") reference checked
 * against what actually exists. Output: a per-table verdict with ZERO unknowns,
 * written to docs/audits/connection-completeness-2026-06-03.md.
 */
import pg from "pg";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r.rows);

// ---------- file corpus ----------
const SCAN_DIRS = ["src", "scripts", join("supabase", "seed"), join("supabase", "migrations"), ".github"];
const EXT = /\.(ts|tsx|js|mjs|cjs|sql|yml|yaml)$/;
const files = [];
function walk(d) {
  let ents; try { ents = readdirSync(d); } catch { return; }
  for (const e of ents) {
    if (e === "node_modules" || e === ".next" || e === "_diag") continue;
    const p = join(d, e); let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p);
    else if (EXT.test(e)) files.push(p);
  }
}
for (const d of SCAN_DIRS) walk(resolve(ROOT, d));
const corpus = files.map((p) => ({ p, rel: relative(ROOT, p).replace(/\\/g, "/"), txt: readFileSync(p, "utf8") }));
const zoneOf = (rel) =>
  rel.startsWith("supabase/migrations/") ? "migration"
  : rel.startsWith("supabase/seed/") || rel.startsWith("scripts/") ? "ops"
  : rel.startsWith(".github/") ? "cron"
  : rel.startsWith("src/") ? "runtime" : "other";

// ---------- schema: tables, rows, triggers, functions ----------
const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).map((r) => r.table_name);
const tableSet = new Set(tables);
const rows = {};
for (const t of tables) { try { rows[t] = (await q(`SELECT count(*)::int n FROM "${t}"`))[0].n; } catch { rows[t] = null; } }

// every non-internal trigger -> its function
const trg = await q(`SELECT t.tgname, t.tgrelid::regclass::text tbl, p.proname fn
  FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal`);
const trgByTbl = {}; const trigFns = new Set();
for (const r of trg) { (trgByTbl[r.tbl.replace(/^public\./, "")] ||= []).push(r); trigFns.add(r.fn); }

// every public function body (for RPC-body + trigger-body table refs)
const fns = await q(`SELECT p.proname name, pg_get_functiondef(p.oid) src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind IN ('f') `).catch(() => []);
// which functions are called via .rpc("name") anywhere in runtime code
const rpcCalledRuntime = new Set();
for (const f of corpus) {
  if (zoneOf(f.rel) !== "runtime") continue;
  for (const m of f.txt.matchAll(/\.rpc\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)) rpcCalledRuntime.add(m[1]);
}

// ---------- per-table connection derivation ----------
// helpers: detect writer/reader references to table T in a text blob
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function refsInText(txt, t) {
  const e = esc(t);
  // supabase client style: .from("T") ... (insert|update|upsert|delete|select) within ~240 chars
  const fromIdx = [...txt.matchAll(new RegExp(`\\.from\\(\\s*["'\`]${e}["'\`]\\s*\\)`, "g"))].map((m) => m.index);
  let cw = false, cr = false;
  for (const i of fromIdx) {
    const win = txt.slice(i, i + 240);
    if (/\.(insert|update|upsert|delete)\s*\(/.test(win)) cw = true;
    if (/\.(select)\s*\(/.test(win)) cr = true;
    // a bare .from() with neither in-window (chained later) counts as a read intent
    if (!/\.(insert|update|upsert|delete|select)\s*\(/.test(win)) cr = true;
  }
  // raw SQL
  const rw = new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?"?${e}"?\\b`, "i").test(txt);
  const rr = new RegExp(`\\b(from|join)\\s+(public\\.)?"?${e}"?\\b`, "i").test(txt);
  return { w: cw || rw, r: cr || rr, rawW: rw, rawR: rr, fromCount: fromIdx.length };
}

const report = [];
for (const t of tables) {
  const zonesW = new Set(), zonesR = new Set();
  const wFiles = [], rFiles = [];
  for (const f of corpus) {
    const { w, r } = refsInText(f.txt, t);
    const z = zoneOf(f.rel);
    if (w) { zonesW.add(z); if (z !== "migration" && wFiles.length < 4) wFiles.push(f.rel); }
    if (r) { zonesR.add(z); if (z !== "migration" && rFiles.length < 4) rFiles.push(f.rel); }
  }
  // function-body writers/readers (trigger + rpc layer)
  let fnW = null, fnR = null, fnWIsTrigger = false, fnWIsRuntimeRpc = false, fnRIsRuntimeRpc = false;
  for (const fn of fns) {
    const e = esc(t);
    const bw = new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?"?${e}"?\\b`, "i").test(fn.src);
    const br = new RegExp(`\\b(from|join)\\s+(public\\.)?"?${e}"?\\b`, "i").test(fn.src);
    if (bw) { fnW = (fnW ? fnW : []) ; fnW.push(fn.name); if (trigFns.has(fn.name)) fnWIsTrigger = true; if (rpcCalledRuntime.has(fn.name)) fnWIsRuntimeRpc = true; }
    if (br) { fnR = (fnR ? fnR : []) ; fnR.push(fn.name); if (rpcCalledRuntime.has(fn.name)) fnRIsRuntimeRpc = true; }
  }
  if (fnWIsTrigger) zonesW.add("trigger");
  if (fnWIsRuntimeRpc) zonesW.add("runtime");      // RPC that writes, reachable from app
  if (fnRIsRuntimeRpc) zonesR.add("runtime");      // RPC that reads, reachable from app

  const hasRuntimeW = zonesW.has("runtime"), hasOpsW = zonesW.has("ops"), hasTrigW = zonesW.has("trigger"), hasMigW = zonesW.has("migration");
  const hasRuntimeR = zonesR.has("runtime"), hasOpsR = zonesR.has("ops");
  const anyW = zonesW.size > 0, anyR = zonesR.size > 0;

  // verdict
  let verdict;
  const liveW = hasRuntimeW || hasTrigW;       // something writes it in normal operation
  const liveR = hasRuntimeR;                    // something reads it into a surface/RPC
  if (liveW && liveR) verdict = "CONNECTED-LIVE";
  else if (liveW && !anyR) verdict = "WRITE-ONLY";                 // goes in, nothing reads
  else if (!anyW && liveR) verdict = "READ-ONLY (no writer)";      // reads, never written
  else if (!liveW && (hasOpsW || hasMigW) && liveR) verdict = "BATCH-WRITE / READ-LIVE"; // populated in batch, read live
  else if (liveW && !liveR && anyR) verdict = "WRITE-LIVE / READ-OPS-ONLY";
  else if (!anyW && !anyR) verdict = rows[t] > 0 ? "INVESTIGATE (rows, no code ref)" : "ISOLATED (no refs, empty)";
  else if ((hasOpsW || hasMigW) && !anyR) verdict = "SEED/BACKUP (write-only, no reader)";
  else verdict = "OTHER";

  report.push({
    t, rows: rows[t],
    w: [...zonesW].join("/") || "—", r: [...zonesR].join("/") || "—",
    trig: (trgByTbl[t] || []).length,
    fnW: fnW ? [...new Set(fnW)].join(",") : "", fnR: fnR ? [...new Set(fnR)].filter((x) => rpcCalledRuntime.has(x)).join(",") : "",
    verdict, wFiles, rFiles,
  });
}

// ---------- reverse orphan scan ----------
const orphanFrom = new Map(), orphanRpc = new Map();
const knownFns = new Set(fns.map((f) => f.name));
for (const f of corpus) {
  if (zoneOf(f.rel) !== "runtime" && zoneOf(f.rel) !== "ops") continue;
  for (const m of f.txt.matchAll(/\.from\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g))
    if (!tableSet.has(m[1])) (orphanFrom.get(m[1]) || orphanFrom.set(m[1], []).get(m[1])).push(f.rel);
  for (const m of f.txt.matchAll(/\.rpc\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g))
    if (!knownFns.has(m[1])) (orphanRpc.get(m[1]) || orphanRpc.set(m[1], []).get(m[1])).push(f.rel);
}

// ---------- console summary ----------
const order = ["CONNECTED-LIVE","BATCH-WRITE / READ-LIVE","TRIGGER","WRITE-LIVE / READ-OPS-ONLY","WRITE-ONLY","READ-ONLY (no writer)","SEED/BACKUP (write-only, no reader)","INVESTIGATE (rows, no code ref)","ISOLATED (no refs, empty)","OTHER"];
const byV = {}; for (const r of report) (byV[r.verdict] ||= []).push(r);
console.log(`\n===== CONNECTION COMPLETENESS — ${report.length} tables, ${corpus.length} files scanned, ${fns.length} fns =====`);
for (const v of Object.keys(byV).sort((a,b)=>(order.indexOf(a)<0?99:order.indexOf(a))-(order.indexOf(b)<0?99:order.indexOf(b))))
  console.log(`  ${String(byV[v].length).padStart(3)}  ${v}`);

const flagV = new Set(["WRITE-ONLY","READ-ONLY (no writer)","INVESTIGATE (rows, no code ref)","ISOLATED (no refs, empty)","OTHER","WRITE-LIVE / READ-OPS-ONLY","SEED/BACKUP (write-only, no reader)"]);
console.log(`\n----- DISCONNECTED / ATTENTION (every table not CONNECTED-LIVE or BATCH-READ-LIVE) -----`);
console.log(`  table                                 rows  W-zones     R-zones     verdict`);
for (const r of report.filter((x) => flagV.has(x.verdict)).sort((a,b)=>(b.rows||0)-(a.rows||0)))
  console.log(`  ${r.t.padEnd(36)} ${String(r.rows).padStart(5)}  ${r.w.padEnd(11)} ${r.r.padEnd(11)} ${r.verdict}`);

console.log(`\n----- ORPHAN REFERENCES (code points at a table/RPC that does not exist) -----`);
if (!orphanFrom.size && !orphanRpc.size) console.log("  none — every .from()/.rpc() target exists");
for (const [k, v] of orphanFrom) console.log(`  .from("${k}")  -> NO SUCH TABLE  (${[...new Set(v)].slice(0,3).join(", ")})`);
for (const [k, v] of orphanRpc) console.log(`  .rpc("${k}")  -> NO SUCH FUNCTION  (${[...new Set(v)].slice(0,3).join(", ")})`);

// ---------- markdown deliverable ----------
let md = `# Connection Completeness — fsi-app — 2026-06-03 (READ-ONLY)\n\n`;
md += `Mechanical re-derivation of write-side + read-side connection state for **every** public table, from the whole codebase (${corpus.length} files) AND every Postgres function/trigger body (${fns.length} fns) — the RPC/trigger layer a \`.from()\` grep undercounts. Reverse orphan scan included. Goal: zero unknowns.\n\n`;
md += `**Zone legend:** runtime = src/ (app+lib, incl. RPCs reachable via .rpc) · ops = scripts/ + supabase/seed · trigger = pg trigger fn body · migration = DDL/backfill.\n\n`;
md += `## Verdict tally\n\n| count | verdict |\n|---|---|\n`;
for (const v of Object.keys(byV).sort((a,b)=>byV[b].length-byV[a].length)) md += `| ${byV[v].length} | ${v} |\n`;
md += `\n## Every table\n\n| table | rows | W-zones | R-zones | trig | runtime RPC reader | verdict |\n|---|---|---|---|---|---|---|\n`;
for (const r of report.sort((a,b)=>order.indexOf(a.verdict)-order.indexOf(b.verdict)||(b.rows||0)-(a.rows||0)))
  md += `| \`${r.t}\` | ${r.rows} | ${r.w} | ${r.r} | ${r.trig} | ${r.fnR || "—"} | **${r.verdict}** |\n`;
md += `\n## Disconnected / attention set\n\nEvery table not \`CONNECTED-LIVE\` / \`BATCH-WRITE / READ-LIVE\` / trigger-maintained:\n\n`;
for (const r of report.filter((x) => flagV.has(x.verdict)).sort((a,b)=>(b.rows||0)-(a.rows||0))) {
  md += `- **\`${r.t}\`** (${r.rows} rows) — ${r.verdict}. W=${r.w}, R=${r.r}.`;
  if (r.wFiles.length) md += ` writers: ${r.wFiles.join(", ")}.`;
  if (r.rFiles.length) md += ` readers: ${r.rFiles.join(", ")}.`;
  md += `\n`;
}
md += `\n## Orphan references\n\n`;
if (!orphanFrom.size && !orphanRpc.size) md += `None — every \`.from()\` / \`.rpc()\` target in runtime + ops code resolves to an existing table/function.\n`;
else {
  for (const [k, v] of orphanFrom) md += `- \`.from("${k}")\` → **no such table** — ${[...new Set(v)].join(", ")}\n`;
  for (const [k, v] of orphanRpc) md += `- \`.rpc("${k}")\` → **no such function** — ${[...new Set(v)].join(", ")}\n`;
}
writeFileSync(resolve(ROOT, "docs", "audits", "connection-completeness-2026-06-03.md"), md);
console.log(`\nWrote docs/audits/connection-completeness-2026-06-03.md`);
console.log("READ-ONLY.");
await c.end();
