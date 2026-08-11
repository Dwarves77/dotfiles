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
import { connectPg } from "../lib/pg-conn.mjs";

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
// TOP-LEVEL keys of an object literal body — depth-tracked (lane-diagnosis fix 2026-08-11). The first
// real CI run flagged nested-payload keys (jsonb sub-objects like recommended_actions' {action,rationale},
// workspace_settings' alert_config {briefingCadence,...}) as phantom COLUMNS because the old regex matched
// a key after ANY '{' or ',', at any depth. Only depth-1 keys are column names; deeper keys are payload
// shape. Strings are skipped (a brace inside a string literal is not structure). Known limitation kept
// from v1: shorthand properties (`{ title, url }`) are not extracted — under-reporting, never a phantom.
function topLevelKeys(body) {
  const keys = new Set();
  let unresolved = false;
  let depth = 0, i = 0;
  const readString = (start) => {
    const q = body[start];
    let s = "", k = start + 1;
    while (k < body.length) {
      const c = body[k];
      if (c === "\\") { s += body[k + 1] ?? ""; k += 2; continue; }
      if (c === q) return [s, k + 1];
      s += c; k++;
    }
    return [s, k];
  };
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const [content, next] = readString(i);
      if (depth === 1) {
        // A quoted KEY is preceded by '{' or ',' — without that check, a ternary's string arm
        // (`x ? "tier_promotion" : "tier_demotion"`) reads as "quoted thing before a colon" and
        // becomes a phantom column (first-CI-run false positive class).
        let p = i - 1;
        while (p >= 0 && /\s/.test(body[p])) p--;
        const prevCh = p >= 0 ? body[p] : "{";
        let j = next;
        while (j < body.length && /\s/.test(body[j])) j++;
        if ((prevCh === "{" || prevCh === ",") && body[j] === ":" && /^[A-Za-z_$][\w$]*$/.test(content)) keys.add(content);
      }
      i = next; continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") { depth++; i++; continue; }
    if (ch === "}" || ch === "]" || ch === ")") { depth--; i++; continue; }
    if (depth === 1) {
      if (body.startsWith("...", i)) { unresolved = true; i += 3; continue; }
      const m = /^[A-Za-z_$][\w$]*/.exec(body.slice(i, i + 120));
      if (m) {
        let p = i - 1;
        while (p >= 0 && /\s/.test(body[p])) p--;
        const prevCh = p >= 0 ? body[p] : "{";
        let j = i + m[0].length;
        while (j < body.length && /\s/.test(body[j])) j++;
        if ((prevCh === "{" || prevCh === ",") && body[j] === ":") keys.add(m[0]);
        i += m[0].length; continue;
      }
    }
    i++;
  }
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

// DEAD-MANIFEST SKIP (lane-diagnosis fix 2026-08-11): files already sentenced by the operator-run deletion
// sweep (docs/audits/dead-code-manifest-2026-08-11.txt, executed by scripts/dead-code-sweep.sh) are pending
// removal — a phantom column inside one is not a live defect, it is a file awaiting `git rm`. Skipping them
// is reasoned and self-retiring: once the sweep runs, the manifest matches nothing and this block is a
// no-op. Files NOT on the manifest are always scanned; the skip can never grow silently (count reported).
let deadSkipped = 0;
try {
  const manifest = readFileSync(resolve(ROOT, "..", "docs/audits/dead-code-manifest-2026-08-11.txt"), "utf8")
    .split("\n").map((l) => l.trim()).filter(Boolean);
  const dead = new Set(manifest.map((p) => resolve(ROOT, "..", p)));
  for (let i = files.length - 1; i >= 0; i--) {
    if (dead.has(files[i])) { files.splice(i, 1); deadSkipped++; }
  }
} catch { /* manifest absent (already swept or never present) — scan everything */ }

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
    // Window after .from("T") — BOUNDED AT THE NEXT .from( (lane-diagnosis fix 2026-08-11): the first
    // real CI run attributed 390 phantom columns because an unbounded 4000-char window matched the FIRST
    // .insert/.update ANYWHERE ahead — including writes belonging to a LATER .from("other_table") chain,
    // so `sources` accumulated every neighbouring table's write keys. A write past the next .from()
    // belongs to that next query, never to this one.
    const nextFrom = src.indexOf(".from(", fm.index + fm[0].length);
    const windowEnd = Math.min(nextFrom === -1 ? src.length : nextFrom, fm.index + 4000);
    const rest = src.slice(fm.index, windowEnd);
    const wm = rest.match(WRITE_RE);
    if (!wm) continue;
    const openIdx = fm.index + rest.indexOf(wm[2], wm.index);
    const body = sliceObjectLiteral(src, openIdx);
    const { keys, unresolved } = topLevelKeys(body);
    if (unresolved || keys.length === 0) unresolvedSites++;
    for (const k of keys) addRef(table, k);
  }
}

// Shared resolver (scripts/lib/pg-conn.mjs): env URL -> local .temp link -> CI-derived pooler candidates.
const client = await connectPg();
if (!client) {
  console.error("column-existence-parity: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify against schema — exit 2.");
  console.error(`  (scanned ${files.length} files, ${refs.size} tables referenced by literal writes, ${unresolvedSites} unresolved dynamic sites.)`);
  process.exit(2);
}

try {
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

  console.log(`column-existence-parity: scanned ${files.length} files (${deadSkipped} dead-manifest files skipped, pending the operator deletion sweep); ${refs.size} tables written with literal keys; ${unresolvedSites} dynamic/spread sites unresolved (informational).`);
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
