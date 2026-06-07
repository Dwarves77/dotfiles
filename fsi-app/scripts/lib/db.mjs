/**
 * Guarded write helper — the PATH OF LEAST RESISTANCE for script row-mutations.
 *
 * Discipline rule 015 points here. The raw service-role *write* client is intentionally NOT
 * exported, so reaching for a raw `.update()`/`.delete()` takes more effort than using these —
 * expedience routes INTO the guarded path, not around it (the same expedience that bypassed
 * /api/agent/run will otherwise bypass an opt-in helper).
 *
 * Every write:
 *   1. REQUIRES a governing-skill cite ({ skill, reason }) — refuses to run without it.
 *   2. SNAPSHOTS the prior row state to scripts/_snapshots/ BEFORE mutating (reversibility — the
 *      reason a "restore from change record" was impossible: nothing captured prior values).
 *   3. Then mutates and returns the count + snapshot path.
 *
 * Reads are routine/unguarded — only WRITES are gated. Caller must have loaded env
 * (process.loadEnvFile) with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY first.
 *
 * Residual (named honestly): an uncommitted script that constructs its own createClient and writes
 * raw is irreducible without a gate/credential removal (excluded). Rule 015 catches it at commit;
 * review backstops the rest.
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// @supabase is lazy-required (not a top-level import) so this module is importable WITHOUT node_modules
// installed — db.test.mjs injects a fake client and never touches the real one, so the discipline test
// job (which runs node --test with no npm ci) resolves cleanly. The real require happens only on a real
// DB call, where node_modules is present.
const require = createRequire(import.meta.url);

// Snapshot dir resolves at call-time so unit tests can redirect prior-value snapshots to a temp dir
// via DISCIPLINE_SNAP_DIR (env set after import still takes effect).
function snapDir() {
  return process.env.DISCIPLINE_SNAP_DIR
    ? resolve(process.env.DISCIPLINE_SNAP_DIR)
    : resolve(dirname(fileURLToPath(import.meta.url)), "..", "_snapshots");
}

// Internal — NOT exported. The only write surface is the guarded functions below.
function realWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("db.mjs: load env (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) before use.");
  }
  const { createClient } = require("@supabase/supabase-js"); // lazy — see top-of-file note
  return createClient(url, key, { auth: { persistSession: false } });
}

// Overridable seam — TEST ONLY. Swapping the client does NOT bypass the guard: cite is still required
// and prior-value snapshots still run (the discipline lives in the guarded functions, not the client).
let _writeClientImpl = realWriteClient;
function writeClient() { return _writeClientImpl(); }
export function __setWriteClientForTest(fn) { _writeClientImpl = fn || realWriteClient; }

/** Read-only client for diagnostics/selects. Reads are unguarded (routine). */
export function readClient() {
  return writeClient();
}

/**
 * Paginated full-table read. CRITICAL: Supabase/PostgREST caps a single response at ~1000 rows
 * (the `max-rows` setting) REGARDLESS of `.limit(N>1000)` — a silent truncation that made an
 * orphan-audit under-count active sources and made registerSource's dedup blind (it created 27
 * duplicates before this was caught, 2026-06-06). Always page tables that can exceed 1000 rows.
 */
export async function readAll(table, columns = "*", { match } = {}) {
  const sb = readClient();
  const rows = [];
  let from = 0;
  for (;;) {
    let q = sb.from(table).select(columns).order("id").range(from, from + 999);
    if (match) q = match(q);
    const { data, error } = await q;
    if (error) throw new Error(`readAll(${table}) failed: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

function requireCite(cite) {
  if (!cite || !cite.skill || !cite.reason) {
    throw new Error(
      "db.mjs: every write requires { cite: { skill, reason } } — the GOVERNING SKILL and why. " +
      "Refusing to write (this is the action-class M check, not ceremony)."
    );
  }
}

function snapshot(table, rows, cite, stampIso) {
  const dir = snapDir();
  mkdirSync(dir, { recursive: true });
  const stamp = (stampIso || new Date().toISOString()).replace(/[:.]/g, "-");
  const file = resolve(dir, `${stamp}_${table}.jsonl`);
  for (const r of rows) appendFileSync(file, JSON.stringify({ _cite: cite, table, prior: r }) + "\n");
  return file;
}

/**
 * Guarded UPDATE. `applyMatch` applies the row filter to a query builder, e.g.
 *   guardedUpdate("intelligence_items", qb => qb.in("id", ids), { is_archived: true },
 *                 { cite: { skill: "remediation-discipline", reason: "archive source-not-item" } })
 * Snapshots the matched rows, then patches them.
 */
export async function guardedUpdate(table, applyMatch, patch, { cite, select = "*", stampIso } = {}) {
  requireCite(cite);
  const sb = writeClient();
  const prior = await applyMatch(sb.from(table).select(select));
  if (prior.error) throw new Error(`db.mjs snapshot read failed: ${prior.error.message}`);
  const snapFile = snapshot(table, prior.data || [], cite, stampIso);
  const res = await applyMatch(sb.from(table).update(patch)).select(select);
  if (res.error) throw new Error(`db.mjs update failed: ${res.error.message}`);
  return { updated: res.data?.length ?? 0, snapshot: snapFile, rows: res.data };
}

/** Guarded DELETE — snapshots the rows (reversible) + requires a cite, then deletes by id. Used for
 *  cleaning up rows a script itself wrongly created (e.g. the 27 duplicate sources from the capped-read
 *  bug). Snapshot is the reinsert record. */
export async function guardedDelete(table, ids, { cite, stampIso } = {}) {
  requireCite(cite);
  if (!ids || !ids.length) throw new Error("db.mjs guardedDelete: ids required.");
  const sb = writeClient();
  const prior = await sb.from(table).select("*").in("id", ids);
  if (prior.error) throw new Error(`guardedDelete snapshot read failed: ${prior.error.message}`);
  const snapFile = snapshot(table, prior.data || [], cite, stampIso);
  const res = await sb.from(table).delete().in("id", ids).select("id");
  if (res.error) throw new Error(`guardedDelete failed: ${res.error.message}`);
  return { deleted: res.data?.length ?? 0, snapshot: snapFile, rows: res.data };
}

/** Guarded ARCHIVE — convenience over guardedUpdate (sets is_archived + archive_reason). */
export async function archiveRows(table, ids, { cite, archive_reason, stampIso } = {}) {
  if (!archive_reason) throw new Error("db.mjs archiveRows: archive_reason required.");
  return guardedUpdate(table, (qb) => qb.in("id", ids), { is_archived: true, archive_reason }, { cite, stampIso });
}

// ---------------------------------------------------------------------------
// Source-registration invariant (source-credibility-model §1/§5 + remediation-discipline).
//
// The invariant: a "source-not-item" (a portal/data-explorer/official site mis-ingested as an
// intelligence item) becomes a REGISTERED, scannable source — it is NEVER archived-without-register
// (that blinds the scanner from its pages). The 25 orphaned `reclassified_to_source` archives + the
// 5 I wrongly archived happened because archive and register were two separate, unverified steps.
//
// reclassifyToSource() makes the safe path the only easy path: it REGISTERS the source and
// READ-BACK-VERIFIES it is active BEFORE it archives the item. If registration can't be confirmed,
// it THROWS and the item is never archived. Discipline rule 019 forbids the raw archive-as-source
// path in scripts; migration 135 enforces the same invariant at the database; orphan-source-audit.mjs
// scans the live data for any pre-existing violation.
// ---------------------------------------------------------------------------

// archive_reason values that assert "this row is really a source" (must therefore be registered).
export const SOURCEY_ARCHIVE_REASONS = Object.freeze([
  "reclassified_to_source",
  "source_not_item",
  "institutional_source",
  "non_regulatory_source",
  "portal_artifact",
]);

function hostOf(u) {
  try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

/**
 * Register a source in the `sources` registry (idempotent by canonical host). Returns the source id.
 * If a source with the same canonical host already exists, ensures status='active' and returns it.
 * `source` requires { url }; optional { name, base_tier, extra }.
 */
export async function registerSource(source, { cite, stampIso } = {}) {
  requireCite(cite);
  if (!source || !source.url) throw new Error("db.mjs registerSource: source.url required.");
  const host = hostOf(source.url);
  if (!host) throw new Error(`db.mjs registerSource: cannot parse host from ${source.url}`);
  const sb = writeClient();
  // PAGINATED — a capped .limit() read made this dedup blind beyond 1000 rows and created duplicates.
  const existing = await readAll("sources", "id,url,status");
  const match = existing.find((s) => hostOf(s.url) === host);
  if (match) {
    if (match.status !== "active") {
      await guardedUpdate("sources", (qb) => qb.eq("id", match.id), { status: "active" }, { cite, stampIso });
    }
    return { source_id: match.id, created: false, host };
  }
  const row = {
    url: source.url,
    name: source.name || host,
    base_tier: source.base_tier ?? 7,
    status: "active",
    admin_only: false,
    ...(source.extra || {}),
  };
  const ins = await sb.from("sources").insert(row).select("id").single();
  if (ins.error) throw new Error(`registerSource insert failed: ${ins.error.message}`);
  snapshot("sources", [{ _inserted: row }], cite, stampIso);
  return { source_id: ins.data.id, created: true, host };
}

/**
 * Reclassify intelligence item(s) to a source: REGISTER the source (read-back verified ACTIVE),
 * THEN archive the item(s) as reclassified_to_source. If the source is not confirmed active after
 * registration, THROWS before archiving — the item is never orphaned. This is the ONLY sanctioned
 * way a script may archive a row with a source-y archive_reason (enforced by rule 019 + migration 135).
 */
export async function reclassifyToSource(itemIds, source, { cite, stampIso } = {}) {
  requireCite(cite);
  const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
  if (!ids.length) throw new Error("db.mjs reclassifyToSource: at least one item id required.");
  // 1. Register first (idempotent, read-back inside).
  const reg = await registerSource(source, { cite, stampIso });
  // 2. VERIFY the source is present + active BEFORE any archive (the invariant).
  const sb = writeClient();
  const chk = await sb.from("sources").select("id,status").eq("id", reg.source_id).single();
  if (chk.error || !chk.data || chk.data.status !== "active") {
    throw new Error(
      `reclassifyToSource: source ${reg.source_id} not confirmed active after registration — ` +
      `REFUSING to archive item(s) (archiving without a live source orphans the scanner).`
    );
  }
  // 3. Only now archive the item(s).
  const arch = await archiveRows("intelligence_items", ids, { cite, archive_reason: "reclassified_to_source", stampIso });
  return { source_id: reg.source_id, created: reg.created, host: reg.host, archived: arch.updated, snapshot: arch.snapshot };
}
