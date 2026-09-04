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
import { stderr } from "node:process";
// Deterministic, dependency-free, name+URL only (no fetch, no LLM, $0). Safe as a STATIC import
// here despite the no-node_modules invariant above: classify-source-role.ts imports nothing, and
// CI runs Node 24, which strips TS types natively. Keeps registerSource honest to that module's
// stated contract — a source is never created with a NULL role.
import { classifySourceRole } from "../../src/lib/sources/classify-source-role.ts";
import { hostOf, institutionKey } from "./institution-key.mjs";

// @supabase is lazy-required (not a top-level import) so this module is importable WITHOUT node_modules
// installed — db.test.mjs injects a fake client and never touches the real one, so the discipline test
// job (which runs node --test with no npm ci) resolves cleanly. The real require happens only on a real
// DB call, where node_modules is present.
const require = createRequire(import.meta.url);

/**
 * Retry helper for transient network failures (fetch failed, ECONNRESET, ETIMEDOUT, etc.).
 * DOES NOT retry PostgREST/Postgres errors or statement timeouts (chunk-halving handles those).
 * Exported for testing and clarity; wrapped calls use this internally.
 *
 * Transient failures detected:
 * - Message matches /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|ECONNREFUSED|UND_ERR/i
 * - 502/503/504 status (when exposed by supabase-js)
 *
 * Not retried:
 * - PostgREST errors (have .error.message from supabase-js)
 * - Postgres errors with statement timeout (handled by chunk-halving in guardedUpdateByIds)
 * - Any other application error
 */
export async function withTransientRetry(
  fn,
  { attempts = 3, delaysMs = [500, 2000, 5000], label = "unknown" } = {}
) {
  const transientRe = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|ECONNREFUSED|UND_ERR/i;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = attempt === attempts;

      // Check if it's a PostgREST error (has .error body) — never retry those
      if (err?.error?.message) {
        // Throw a new error preserving the PostgREST inner message for clarity
        const pgErr = new Error(err.error.message);
        pgErr.cause = err;
        throw pgErr;
      }

      // Extract error message; handle both thrown errors and supabase-js error objects
      let errMsg = err?.message || String(err);
      const errCode = err?.code;

      // Check if the error message is transient or the error code suggests a transient issue
      const isTransient = transientRe.test(errMsg) || transientRe.test(errCode || "");

      // Also check for 502/503/504 status in supabase-js responses
      const isServiceUnavailable =
        err?.status && [502, 503, 504].includes(err.status);

      if (!isTransient && !isServiceUnavailable) {
        throw err; // Not a transient error, don't retry
      }

      if (isLastAttempt) {
        // On final attempt, throw with context
        const err2 = new Error(
          `${label}: gave up after ${attempts} attempts — ${errMsg}`
        );
        err2.cause = err;
        err2.attempts = attempts;
        throw err2;
      }

      // Log the retry and wait before next attempt
      const delayMs = delaysMs[attempt - 1] || delaysMs[delaysMs.length - 1];
      stderr.write(
        `[db.mjs retry] ${label} attempt ${attempt}/${attempts} failed (${errMsg}), retrying in ${delayMs}ms\n`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

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

// The mutating query-builder methods a read client must refuse. `.select()` (+ filters/modifiers)
// stay open; a caller reaching for a row mutation gets a THROW that names the guarded path — closing
// the rule-015 bypass where `readClient().from(t).update(...)` mutated prod through the "read" client.
const READ_CLIENT_WRITE_METHODS = new Set(["insert", "update", "delete", "upsert"]);

function readOnlyBuilder(builder) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && READ_CLIENT_WRITE_METHODS.has(prop)) {
        return () => {
          throw new Error(
            `db.mjs readClient() is READ-ONLY: '.${prop}()' is a write. This is the rule-015 bypass ` +
            `(mutating through the read client). Use the guarded write path — guardedUpdate / guardedInsert / ` +
            `guardedDelete / archiveRows / reclassifyToSource (snapshot + cite + reversibility).`
          );
        };
      }
      const val = Reflect.get(target, prop, target);
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
}

/**
 * Read-only client for diagnostics/selects. Reads are unguarded (routine), but WRITES are refused:
 * the returned client proxies `.from(table)` so `.insert/.update/.delete/.upsert` THROW (rule-015 —
 * the "read" client is no longer a service-role write handle by property access). `.rpc` and other
 * methods pass through unchanged (read RPCs must keep working); a write RPC remains the caller's
 * responsibility to route through a sanctioned path. Every readAll/select caller is unaffected.
 */
export function readClient() {
  const real = writeClient();
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table) => readOnlyBuilder(target.from(table));
      }
      // `schema()` returns a FRESH builder factory that this proxy never saw, so
      // readClient().schema('public').from(t).delete() reached the real write client with no
      // cite and no snapshot — verified by execution 2026-08-09 (audit finding 13, CONFIRMED).
      // Guarding only the literal `from` left the guarantee one method call wide. Wrap the
      // schema handle so its `from` is read-only too.
      if (prop === "schema") {
        return (name) => {
          const handle = target.schema(name);
          return new Proxy(handle, {
            get(h, hp, hr) {
              if (hp === "from") return (table) => readOnlyBuilder(h.from(table));
              const hv = Reflect.get(h, hp, h);
              return typeof hv === "function" ? hv.bind(h) : hv;
            },
          });
        };
      }
      const val = Reflect.get(target, prop, target);
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
}

/**
 * Paginated full-table read. CRITICAL: Supabase/PostgREST caps a single response at ~1000 rows
 * (the `max-rows` setting) REGARDLESS of `.limit(N>1000)` — a silent truncation that made an
 * orphan-audit under-count active sources and made registerSource's dedup blind (it created 27
 * duplicates before this was caught, 2026-06-06). Always page tables that can exceed 1000 rows.
 * Retries transient network failures.
 */
export async function readAll(table, columns = "*", { match, orderBy = "id" } = {}) {
  const sb = readClient();
  const rows = [];
  let from = 0;
  for (;;) {
    let q = sb.from(table).select(columns).order(orderBy).range(from, from + 999);
    if (match) q = match(q);
    const { data, error } = await withTransientRetry(
      () => q,
      { label: `readAll(${table}) page at ${from}` }
    );
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
 * Snapshots the matched rows, then patches them. Both the prior-state read and the update itself
 * are retried on transient failures.
 */
export async function guardedUpdate(table, applyMatch, patch, { cite, select = "*", stampIso } = {}) {
  requireCite(cite);
  const sb = writeClient();
  const prior = await withTransientRetry(
    () => applyMatch(sb.from(table).select(select)),
    { label: `guardedUpdate(${table}) snapshot read` }
  );
  if (prior.error) throw new Error(`db.mjs snapshot read failed: ${prior.error.message}`);
  const snapFile = snapshot(table, prior.data || [], cite, stampIso);
  const res = await withTransientRetry(
    () => applyMatch(sb.from(table).update(patch)).select(select),
    { label: `guardedUpdate(${table}) update` }
  );
  if (res.error) throw new Error(`db.mjs update failed: ${res.error.message}`);
  return { updated: res.data?.length ?? 0, snapshot: snapFile, rows: res.data };
}

/**
 * Guarded UPDATE over an explicit id list, in chunks. Same contract as guardedUpdate (cite, per-chunk
 * snapshot, read-back rows), for the case where ONE statement over every matched row would run past the
 * API's statement timeout.
 *
 * WHY (population-turn run #6, 2026-09-02, the first apply): stamp-wo26-archive-reason.mjs updated 491
 * `intelligence_items` rows in one UPDATE and PostgREST cancelled it ("canceling statement due to
 * statement timeout"). `intelligence_items` carries `set_provenance_status_trg` (AFTER INSERT OR UPDATE,
 * every column), which re-runs validate_item_provenance per row — criterion 3 scans each FACT span
 * against the item's full captured source text — measured at ~72 ms/row as postgres with a warm cache
 * (10 rows: 715 ms) and up to 3.4 s for a single row with a large captured source, against the API's 8 s
 * statement_timeout (authenticator role). The trigger is correct (a provenance flip must be re-derived
 * on every write); the write shape was wrong. Chunks of DEFAULT_UPDATE_CHUNK rows, halved on a timeout
 * (see runChunk below); `applyMatch`, when given, is re-applied to every chunk on top of the id filter so
 * a row that stopped matching between the read and the write is left alone (idempotent, safe under
 * concurrent change).
 */
export const DEFAULT_UPDATE_CHUNK = 10;
export const STATEMENT_TIMEOUT_RE = /statement timeout/i;
export async function guardedUpdateByIds(table, ids, patch, { cite, select = "*", stampIso, chunk = DEFAULT_UPDATE_CHUNK, applyMatch = null, idColumn = "id" } = {}) {
  requireCite(cite);
  const list = [...new Set(ids ?? [])];
  const out = { updated: 0, rows: [], snapshots: [], chunks: 0, halvings: 0 };
  // Adaptive: a chunk that the API cancels ("canceling statement due to statement timeout" — the
  // authenticator role's statement_timeout is 8 s, measured live 2026-09-02) is split in two and each half
  // retried, down to single rows. Per-row cost on intelligence_items varies 70 ms – 3.4 s (40-row sample:
  // 10.4 s total, max 3.38 s) because validate_item_provenance scans each item's full captured source, so a
  // fixed chunk is either wasteful or a coin flip; population-turn run #7 got two 25-row chunks through and
  // died on the third. The update is idempotent under `applyMatch` (re-applied on every attempt), so a
  // cancelled statement — which Postgres rolls back whole — leaves nothing half-done to reconcile.
  const runChunk = async (slice) => {
    const match = (qb) => { const q = qb.in(idColumn, slice); return applyMatch ? applyMatch(q) : q; };
    try {
      const r = await guardedUpdate(table, match, patch, { cite, select, stampIso });
      out.updated += r.updated;
      out.rows.push(...(r.rows ?? []));
      out.snapshots.push(r.snapshot);
      out.chunks += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!STATEMENT_TIMEOUT_RE.test(msg) || slice.length <= 1) throw err;
      out.halvings += 1;
      const mid = Math.ceil(slice.length / 2);
      await runChunk(slice.slice(0, mid));
      await runChunk(slice.slice(mid));
    }
  };
  for (let i = 0; i < list.length; i += chunk) await runChunk(list.slice(i, i + chunk));
  return out;
}

/** Guarded DELETE — snapshots the rows (reversible) + requires a cite, then deletes by id. Used for
 *  cleaning up rows a script itself wrongly created (e.g. the 27 duplicate sources from the capped-read
 *  bug). Snapshot is the reinsert record. */
// Tables that must NEVER be hard-deleted — sources leave the registry by SUSPEND (status) or
// reclassify, never DELETE (suspend-not-delete; the population-audit finding 2026-07-12). This makes the
// convention structural: a future refactor cannot quietly add a source hard-delete without tripping here.
// Extended 2026-08-09 (audit finding 14, CONFIRMED by execution — guardedDelete happily
// deleted from all three append-only stores with a valid cite). Each is declared append-only
// by its own invariant or table comment: raw_fetches = RD-46-primary-text-permanent ("no
// prune/delete path exists"); claim_versions = RD-44/RD-45 + mig 208/210 ("Append-only");
// disposition_ledger = mig 213 ("Append-only") + the RD-9 audit-terminal allowlist. None has
// a DB-level DELETE trigger or REVOKE, unlike census_worklist (mig 221) and
// intelligence_item_versions (mig 053), so this module guard was the ONLY gate — and it was
// absent. Structural DB triggers are the durable fix and are logged as follow-up; this closes
// the script-side hole today.
export const DELETE_PROTECTED_TABLES = new Set([
  "sources",
  "raw_fetches",
  "claim_versions",
  "disposition_ledger",
]);
export async function guardedDelete(table, ids, { cite, stampIso } = {}) {
  requireCite(cite);
  if (DELETE_PROTECTED_TABLES.has(table)) {
    throw new Error(
      `db.mjs guardedDelete: '${table}' is delete-protected — never hard-delete it. Suspend (guardedUpdate ` +
      `status='suspended') or reclassify instead. (suspend-not-delete; sources leave the registry reversibly.)`
    );
  }
  if (!ids || !ids.length) throw new Error("db.mjs guardedDelete: ids required.");
  const sb = writeClient();
  const prior = await withTransientRetry(
    () => sb.from(table).select("*").in("id", ids),
    { label: `guardedDelete(${table}) snapshot read` }
  );
  if (prior.error) throw new Error(`guardedDelete snapshot read failed: ${prior.error.message}`);
  const snapFile = snapshot(table, prior.data || [], cite, stampIso);
  const res = await withTransientRetry(
    () => sb.from(table).delete().in("id", ids).select("id"),
    { label: `guardedDelete(${table}) delete` }
  );
  if (res.error) throw new Error(`guardedDelete failed: ${res.error.message}`);
  return { deleted: res.data?.length ?? 0, snapshot: snapFile, rows: res.data };
}

/** Guarded INSERT — requires a cite + snapshots the inserted row (the reversal record is "delete the
 *  returned id"). For rows a script legitimately creates outside the domain helpers (e.g. the Layer C
 *  data-audit block flag). Inserts stay on the guarded path so rule 015 holds and the write is reversible. */
export async function guardedInsert(table, row, { cite, select = "*", stampIso } = {}) {
  requireCite(cite);
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("db.mjs guardedInsert: a single row object is required.");
  const sb = writeClient();
  const res = await sb.from(table).insert(row).select(select).single();
  if (res.error) throw new Error(`guardedInsert failed: ${res.error.message}`);
  const snapFile = snapshot(table, [{ _inserted: res.data }], cite, stampIso);
  return { inserted: res.data, snapshot: snapFile };
}

/** Guarded batched INSERT — the many-row form of guardedInsert for AUDIT SINK tables (fresh rows, not
 *  mutations of existing state). Requires a cite; snapshots the inserted ids (reversal = delete them);
 *  inserts in chunks. Same rule-015 posture as guardedInsert: the write stays on the guarded path and is
 *  reversible. Use for bulk classification/audit writes (e.g. holdings_quality), never to mutate live rows. */
export async function guardedInsertMany(table, rows, { cite, select = "id", chunk = 500, stampIso } = {}) {
  requireCite(cite);
  if (!Array.isArray(rows)) throw new Error("db.mjs guardedInsertMany: rows must be an array.");
  if (!rows.length) return { inserted: 0, snapshot: null, rows: [] };
  const sb = writeClient();
  const out = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const res = await sb.from(table).insert(batch).select(select);
    if (res.error) throw new Error(`guardedInsertMany failed (chunk ${i}): ${res.error.message}`);
    out.push(...(res.data || []));
  }
  const snapFile = snapshot(table, out.map((r) => ({ _inserted: r })), cite, stampIso);
  return { inserted: out.length, snapshot: snapFile, rows: out };
}

/** The archive patch for a table. Extracted pure so the status-reset invariant is unit-testable.
 *  ROOT-CAUSE FIX (operator ruling 2026-07-13, Part A): an ARCHIVED intelligence_item is terminal and
 *  sits OUTSIDE the customer read gate (is_archived=false AND provenance_status='verified'); it must NOT
 *  retain provenance_status='verified'. Leaving it 'verified' minted the stale-verified cache class (168
 *  archived rows read 'verified' while the live validator quarantines them — status-is-a-cache disagreeing
 *  with the gate). Archiving now resets the status to 'unverified' (honest neutral: an archived row is not
 *  a verified customer brief, and it is not a live quarantine investigation either — quarantine-disposition-
 *  audit scopes to is_archived=false, so 'unverified' cannot re-trip it). Only intelligence_items carries
 *  provenance_status. */
export function archivePatch(table, archive_reason) {
  const patch = { is_archived: true, archive_reason };
  if (table === "intelligence_items") patch.provenance_status = "unverified";
  return patch;
}

/** Guarded ARCHIVE — convenience over guardedUpdate (sets is_archived + archive_reason + status reset). */
export async function archiveRows(table, ids, { cite, archive_reason, stampIso } = {}) {
  if (!archive_reason) throw new Error("db.mjs archiveRows: archive_reason required.");
  return guardedUpdate(table, (qb) => qb.in("id", ids), archivePatch(table, archive_reason), { cite, stampIso });
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

// hostOf / SHARED_PORTAL_KEYDEPTH / institutionKey moved to scripts/lib/institution-key.mjs (pure,
// dependency-free) on 2026-09-02 so the DB-less mint validator can resolve a claim's source by the SAME
// identity rule registerSource dedups by. Re-exported here unchanged for every existing consumer.
export { hostOf, SHARED_PORTAL_KEYDEPTH, institutionKey } from "./institution-key.mjs";

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
  const key = source.institutionKey || institutionKey(source.url); // path-qualified for shared portals; bare host otherwise
  const sb = writeClient();
  // PAGINATED — a capped .limit() read made this dedup blind beyond 1000 rows and created duplicates.
  const existing = await readAll("sources", "id,url,status");
  const match = existing.find((s) => institutionKey(s.url) === key);
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
    // tier_at_creation is NOT NULL — mirror base_tier at insert (the classifier's original judgment). A
    // dropped default made every new-source insert violate the constraint (class fix).
    tier_at_creation: source.base_tier ?? 7,
    status: "active",
    admin_only: false,
    // source_role at BIRTH. classify-source-role.ts's own contract is "a source is never created
    // with a NULL role + placeholder content-type", but it was wired only into the three admin
    // onboarding routes (promote / decide / bulk-approve) — NOT into this guarded path, which is
    // how every script-created source is born. Result measured 2026-08-11: 1,719 of 2,549 registry
    // rows carry source_role IS NULL, and a downstream triage then read "no role" as "inert" and
    // demoted live regulators (SEC, eCFR, China MEE, Australia's Clean Energy Regulator). The
    // classifier is deterministic, name+URL only, no fetch, no LLM, $0 — there is no reason a row
    // was ever born without it. Explicit source.source_role still wins; null stays null when the
    // classifier genuinely cannot determine the entity (flagged, never guessed).
    source_role: source.source_role ?? classifySourceRole(source.name || host, source.url),
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
