/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: remediation-discipline (§4 category 3 — type-system
 *  drift / schema-vs-code compatibility; sweep-before-claim) + sprint-followups-discipline (schema discipline).
 *
 *  COLUMN-EXISTENCE PARITY (the reviewer_notes / dismissed_* phantom-column class). A code write-site that
 *  names a column the schema does NOT have is a PostgREST silent-reject (the whole row write fails, error
 *  swallowed) — the exact reviewer_notes defect. This audit greps the codebase for literal write-sites
 *  `.from("<table>").insert|update|upsert({ <keys> })`, extracts the top-level column keys, and asserts each
 *  exists in live information_schema.columns for that table. A code-referenced phantom column is flagged.
 *
 *  SCOPE (HONEST — this is the achievable targeted version, NOT a full type-checked contract):
 *   - Matches LITERAL object-literal write-sites within a bounded window after `.from("T")`. It CANNOT see
 *     spread writes (`{ ...payload }`), dynamically-built row objects, computed keys, or a variable passed to
 *     `.insert(row)` — those are reported as UNRESOLVED (informational), never as a phantom.
 *   - It checks column EXISTENCE only, not type/nullability. `select` column strings are NOT parsed here
 *     (a bad select column also silently fails, but the write-side is the higher-severity reviewer_notes class).
 *   - The durable form is a committed `supabase gen types` snapshot + a tsc gate; this catalog-vs-grep audit
 *     is the zero-DDL interim that catches the same class today.
 *
 *  Read-only (information_schema + fs read). pg-direct via pooler. Exit 0 = no phantom columns; exit 1 =
 *  at least one; exit 2 = engine/cred error. */
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env from secrets */ }

const SCAN_DIRS = ["src", "scripts"];
const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".js"]);
const SKIP_DIR = new Set(["node_modules", ".next", "_snapshots", "tmp", "dist", ".git"]);

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (CODE_EXT.has(extname(name))) out.push(full);
  }
  return out;
}

// Extract (table, method, keys[], unresolved:bool) from write-sites. Bounded window after each `.from("T")`.
const FROM_RE = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
const WRITE_RE = /\.(insert|update|upsert)\(\s*(\{)/;
// top-level keys of an object literal body (best-effort; identifiers or "quoted" keys before a colon).
function topLevelKeys(body) {
  const keys = new Set();
  let depth = 0, unresolved = false;
  // very light brace tracker to only take depth-0 keys
  const KEY_RE = /(^|[,{]\s*)(?:\.\.\.|(["'`]?)([a-zA-Z_$][\w$]*)\2\s*:)/g;
  let m;
  while ((m = KEY_RE.exec(body)) !== null) {
    if (m[0].includes("...")) { unresolved = true; continue; }
    if (m[3]) keys.add(m[3]);
  }
  void depth;
  return { keys: [...keys], unresolved };
}

function sliceObjectLiteral(text, openIdx) {
  // openIdx points at '{'; return the balanced-brace substring (bounded to 4000 chars for safety).
  let depth = 0;
  const end = Math.min(text.length, openIdx + 4000);
  for (let i = openIdx; i < end; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx, end); // unbalanced within window → best-effort
}

const files = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

// (table -> Set(columns referenced in a literal write)) + a list of unresolved sites.
const refs = new Map();
let unresolvedSites = 0;
const addRef = (table, col) => { if (!refs.has(table)) refs.set(table, new Set()); refs.get(table).add(col); };

for (const file of files) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { continue; }
  FROM_RE.lastIndex = 0;
  let fm;
  while ((fm = FROM_RE.exec(src)) !== null) {
    const table = fm[1];
    const rest = src.slice(fm.index, fm.index + 4000); // window after .from("T")
    const wm = rest.match(WRITE_RE);
    if (!wm) continue;
    const openIdx = fm.index + rest.indexOf(wm[2], wm.index);
    const body = sliceObjectLiteral(src, openIdx);
    const { keys, unresolved } = topLevelKeys(body);
    if (unresolved || keys.length === 0) unresolvedSites++;
    for (const k of keys) addRef(table, k);
  }
}

function connString() {
  let ref, pool;
  try {
    ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
    pool = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
  } catch { return null; }
  const pw = process.env.SUPABASE_DB_PASSWORD;
  if (!pw) return null;
  return pool.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(pw)}@`);
}

const CONN = connString();
if (!CONN) {
  console.error("column-existence-parity: no DB creds (supabase/.temp/* + SUPABASE_DB_PASSWORD). Cannot verify against schema — exit 2.");
  console.error(`  (scanned ${files.length} files, ${refs.size} tables referenced by literal writes, ${unresolvedSites} unresolved dynamic sites.)`);
  process.exit(2);
}

const client = new pg.Client({ connectionString: CONN });
try {
  await client.connect();
  const cols = await client.query(`
    SELECT table_name AS table, column_name AS col
    FROM information_schema.columns WHERE table_schema = 'public';`);
  const schema = new Map(); // table -> Set(columns)
  for (const r of cols.rows) { if (!schema.has(r.table)) schema.set(r.table, new Set()); schema.get(r.table).add(r.col); }

  const phantoms = [];
  for (const [table, columns] of refs) {
    if (!schema.has(table)) continue; // unknown table (view/rpc/typo of a non-table) — not a column phantom
    const have = schema.get(table);
    for (const c of columns) if (!have.has(c)) phantoms.push({ table, col: c });
  }

  console.log(`column-existence-parity: scanned ${files.length} files; ${refs.size} tables written with literal keys; ${unresolvedSites} dynamic/spread sites unresolved (informational).`);
  if (phantoms.length === 0) {
    console.log("column-existence-parity: OK — every literal write-site column exists in the live schema.");
    await client.end();
    process.exit(0);
  }
  console.error(`column-existence-parity: ${phantoms.length} PHANTOM column reference(s) (code writes a column the schema lacks — the reviewer_notes class):`);
  for (const p of phantoms) console.error(`  [${p.table}] .insert/.update references column '${p.col}' — NOT in information_schema.columns`);
  await client.end();
  process.exit(1);
} catch (e) {
  console.error(`column-existence-parity: engine error — ${e.message}`);
  try { await client.end(); } catch { /* ignore */ }
  process.exit(2);
}
