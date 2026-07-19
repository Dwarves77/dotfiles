// PRODUCER-CONSUMER ORPHAN CHECKER (A2). The mechanical detector for the HALF-SLICE defect class:
// a writer with no reader (a table/column the app writes but nothing consumes — dead output), or a
// reader of a never-written field (a surface consuming nothing — dead input). Every audit so far
// found these by hand (source_trust_events 5-writers-0-readers, the notification_events trio, the
// mig-007 forum layer). This turns that hand-check into a standing gate and a first-run report.
//
// MODELLED ON invariant-coverage.mjs (the meta-gate): a PURE, injectable core (buildOrphanReport)
// so the checker's OWN catching behaviour is proven by a committed negative test (red-then-green),
// plus a git-tracked-file scan (CI-faithful) and a CLI that prints the full report.
//
// GRANULARITY. v1 is TABLE-level (the known cases are whole-table orphans). Field-level (b) — readers
// of never-written columns — is a best-effort INFORMATIONAL pass (parsing insert/update object keys is
// high-false-positive), never gating. See FIELD-LEVEL below and the residual in the RD-9 invariant.
//
// HEURISTIC, low-false-positive by construction (a gate that cries wolf gets muted):
//   - WRITE  = app code `.from("T").insert|update|upsert|delete`, or SQL `INSERT INTO T` / `UPDATE T`.
//   - READ   = app code `.from("T").select`, any `.rpc("fn")` whose SQL body reads T, or SQL
//              `FROM T` / `JOIN T` / `REFERENCES T` (an FK child, a view, a trigger, an RPC body).
//   - A table is a WRITE-ORPHAN iff it has a CREATE TABLE, ≥1 CODE writer, and ZERO readers of ANY
//     kind (no code select, no SQL FROM/JOIN/REFERENCES). Conservative: "referenced in SQL FROM/JOIN"
//     counts as a reader even if that RPC/view is itself dead (transitive deadness is a named residual).
//
// Exit 0 = no NON-ALLOWLISTED write-orphan. Exit 1 = at least one. The allowlist (below) is
// reason-bearing and review-by-phase-tagged, and is itself audited (a stale allowlist entry whose
// table no longer exists, or that is no longer an orphan, is reported).

import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // dotfiles repo root

// ─────────────────────────────────────────────────────────────────────────────
// REASON-BEARING TERMINAL-SINK ALLOWLIST. A legitimate zero-reader sink (an append-only audit trail,
// a table written ahead of the reader that a later phase builds) is allowlisted WITH a stated reason
// and a review-by phase tag — NEVER silently excluded. The allowlist is auditable: buildOrphanReport
// reports any entry whose table is not in the schema, or that is not actually an orphan (stale entry).
// ─────────────────────────────────────────────────────────────────────────────
// Each entry is a table the FIRST RUN (2026-07-03) surfaced as a write-orphan and that is GRANDFATHERED
// to ship the gate green (same pattern as F6's KNOWN_HISTORICAL_DUPLICATES). Grandfathered is NOT the
// same as ratified: the disposition (legitimate write-only audit sink vs wire-the-missing-reader vs
// remove) is Phase 7's call — the report feeds that scoping and does not authorize deletion. The gate's
// live value is catching any NEW orphan beyond this triaged set. The allowlist is itself audited: a
// stale entry (table gone, or no longer an orphan) is reported, so it cannot rot.
export const TERMINAL_SINK_ALLOWLIST = {
  // notification_deliveries entry REMOVED 2026-07-11 (Wave-α Track E e5): its only writer,
  // /api/notifications/trigger, was deleted as a dead endpoint (zero callers; the notification-v1
  // subsystem is dead end-to-end — DB-4 F5). With no code writer it is no longer a write-orphan, so
  // the detector correctly flagged the allowlist entry as STALE. The table itself rides the
  // notification-v1 trio drop (correction-plan E4), out of e5 scope.
  bulk_imports: {
    reason: 'FIRST RUN 2026-07-03. Written by /api/admin/sources/bulk-import as a job record; no reader (no admin import-history surface consumes it). DISPOSITION PENDING Phase 7 (build the history reader vs ratify as write-only job audit) — grandfathered, not ratified.',
    reviewByPhase: 'Phase 7 (zero-reader verification) — admin bulk-import history.',
  },
  ingestion_control_log: {
    reason: 'FIRST RUN 2026-07-03. Written by scripts/wave1-cold-start.mjs as a control-run log; no reader. DISPOSITION PENDING Phase 7 (ratify as script-only audit trail vs wire an ops reader) — grandfathered, not ratified.',
    reviewByPhase: 'Phase 7 (zero-reader verification) — ingestion ops log.',
  },
  // portal_link_candidates: entry RETIRED 2026-07-19 — B1 (portal-harvest consumer) built the awaited
  // reader (src/lib/intake/portal-harvest.ts consumePortalCandidates), so the table is no longer a
  // write-orphan and a standing allowlist entry would be the stale-entry defect this list audits for.
};

// ─────────────────────────────────────────────────────────────────────────────
// SCANNERS (pure over provided text — no fs, so the core is unit-testable with injected inputs).
// ─────────────────────────────────────────────────────────────────────────────

const CREATE_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?/gi;
const CREATE_FUNC_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?/gi;

// supabase-js CRUD verb sits immediately after .from("T") (possibly across a newline). Low-false-positive.
const CODE_OP_RE = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)\s*\.(insert|upsert|update|delete|select)\b/g;
const RPC_CALL_RE = /\.rpc\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g;

// SQL table references. FROM/JOIN/REFERENCES = a consumer; INSERT INTO / UPDATE = a producer.
const SQL_READ_RE = /\b(?:FROM|JOIN|REFERENCES)\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?/gi;
const SQL_WRITE_RE = /\b(?:INSERT\s+INTO|UPDATE)\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?/gi;

// SQL keywords that follow FROM but are not tables (subquery/function noise) — excluded.
const SQL_NON_TABLES = new Set(['lateral', 'unnest', 'jsonb_array_elements_text', 'jsonb_array_elements', 'generate_series', 'select', 'values']);

function matchAll(re, text) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m);
  return out;
}

/** Line number (1-indexed) of a character offset. */
function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function scanSchema(migrationTexts) {
  const tables = new Set();
  const rpcs = new Set();
  for (const { content } of migrationTexts) {
    for (const m of matchAll(CREATE_TABLE_RE, content)) tables.add(m[1]);
    for (const m of matchAll(CREATE_FUNC_RE, content)) rpcs.add(m[1]);
  }
  return { tables, rpcs };
}

export function scanCode(codeFiles) {
  const writers = new Map(); // table -> [{file,line,op}]
  const readers = new Map(); // table -> [{file,line}]
  const rpcCalls = new Map(); // rpc -> [{file,line}]
  const add = (map, key, val) => { (map.get(key) || map.set(key, []).get(key)).push(val); };
  for (const { file, content } of codeFiles) {
    for (const m of matchAll(CODE_OP_RE, content)) {
      const [, table, op] = m;
      const line = lineOf(content, m.index);
      if (op === 'select') add(readers, table, { file, line });
      else add(writers, table, { file, line, op });
    }
    for (const m of matchAll(RPC_CALL_RE, content)) {
      add(rpcCalls, m[1], { file, line: lineOf(content, m.index) });
    }
  }
  return { writers, readers, rpcCalls };
}

export function scanSql(migrationTexts) {
  const sqlReaders = new Set(); // table referenced in FROM/JOIN/REFERENCES
  const sqlWriters = new Set(); // table written in INSERT INTO / UPDATE
  const rpcReads = new Map(); // rpc name -> Set(tables its body FROM/JOINs) — coarse (whole-file scope)
  for (const { content } of migrationTexts) {
    for (const m of matchAll(SQL_READ_RE, content)) {
      const t = m[1].toLowerCase();
      if (!SQL_NON_TABLES.has(t)) sqlReaders.add(t);
    }
    for (const m of matchAll(SQL_WRITE_RE, content)) sqlWriters.add(m[1].toLowerCase());
  }
  return { sqlReaders, sqlWriters, rpcReads };
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE CORE — injectable, negative-testable (feed a synthetic orphan → it must report it).
// Inputs are the scanned sets/maps; no fs. Returns the full report.
// ─────────────────────────────────────────────────────────────────────────────
export function buildOrphanReport({ schema, code, sql, allowlist }) {
  const writeOrphans = []; // {table, writers:[{file,line}], allowlisted, reason?, reviewByPhase?}
  const readOrphans = [];  // {table, readers:[{file,line}]}  (informational: read but never written)
  const allowlistIssues = [];

  const hasAnyReader = (t) =>
    (code.readers.get(t)?.length > 0) || sql.sqlReaders.has(t);
  const hasAnyWriter = (t) =>
    (code.writers.get(t)?.length > 0) || sql.sqlWriters.has(t);

  // (a) WRITE-ORPHANS: schema table with ≥1 CODE writer and ZERO readers of any kind.
  for (const t of schema.tables) {
    const codeWriters = code.writers.get(t) || [];
    if (codeWriters.length === 0) continue;      // only app-written tables are half-slice candidates
    if (hasAnyReader(t)) continue;               // consumed somewhere → not an orphan
    const al = allowlist[t];
    writeOrphans.push({
      table: t,
      writers: codeWriters,
      allowlisted: Boolean(al),
      reason: al?.reason,
      reviewByPhase: al?.reviewByPhase,
    });
  }

  // (b) READ-ORPHANS (informational): schema table read by code but with ZERO writers anywhere.
  for (const t of schema.tables) {
    const codeReaders = code.readers.get(t) || [];
    if (codeReaders.length === 0) continue;
    if (hasAnyWriter(t)) continue;
    readOrphans.push({ table: t, readers: codeReaders });
  }

  // ALLOWLIST AUDIT: a stale entry (table not in schema, or no longer an orphan) must not linger silently.
  for (const [t, entry] of Object.entries(allowlist)) {
    if (!entry.reason || !entry.reviewByPhase) {
      allowlistIssues.push(`allowlist["${t}"] MISSING reason or reviewByPhase (a sink is allowlisted only WITH a stated reason + review phase).`);
      continue;
    }
    if (!schema.tables.has(t)) {
      allowlistIssues.push(`allowlist["${t}"] names a table with no CREATE TABLE in the schema — stale entry, remove it.`);
    } else if (hasAnyReader(t) || (code.writers.get(t) || []).length === 0) {
      allowlistIssues.push(`allowlist["${t}"] is no longer a write-orphan (it now has a reader, or lost its code writer) — remove it so the allowlist stays honest.`);
    }
  }

  const gatingOrphans = writeOrphans.filter((o) => !o.allowlisted);
  return {
    ok: gatingOrphans.length === 0 && allowlistIssues.length === 0,
    writeOrphans,
    gatingOrphans,
    readOrphans,
    allowlistIssues,
    summary: {
      tables: schema.tables.size,
      rpcs: schema.rpcs.size,
      writeOrphans: writeOrphans.length,
      allowlisted: writeOrphans.filter((o) => o.allowlisted).length,
      gating: gatingOrphans.length,
      readOrphans: readOrphans.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FS DRIVER — git-tracked files only (CI-faithful, same rationale as invariant-coverage.mjs).
// ─────────────────────────────────────────────────────────────────────────────
function trackedFiles() {
  try {
    return execSync('git ls-files', { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 })
      .split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function readRepo(rel) {
  try { return readFileSync(join(REPO, rel), 'utf8'); } catch { return null; }
}

export function runOrphanCheck() {
  const tracked = trackedFiles() || [];
  const migRel = tracked.filter((p) => p.startsWith('fsi-app/supabase/migrations/') && p.endsWith('.sql'));
  const codeRel = tracked.filter((p) =>
    (p.startsWith('fsi-app/src/') || p.startsWith('fsi-app/scripts/')) &&
    /\.(ts|tsx|mjs|js)$/.test(p) &&
    !/\.test\.mjs$|\.selftest\.mjs$/.test(p));

  const migrationTexts = migRel.map((f) => ({ file: f, content: readRepo(f) || '' }));
  const codeFiles = codeRel.map((f) => ({ file: f, content: readRepo(f) || '' }));

  const schema = scanSchema(migrationTexts);
  const code = scanCode(codeFiles);
  const sql = scanSql(migrationTexts);
  return buildOrphanReport({ schema, code, sql, allowlist: TERMINAL_SINK_ALLOWLIST });
}

// CLI — the FIRST-RUN REPORT deliverable.
if (process.argv[1] && process.argv[1].endsWith('producer-consumer-orphan.mjs')) {
  const r = runOrphanCheck();
  console.log('\n===== PRODUCER-CONSUMER ORPHAN REPORT (A2) =====');
  console.log(`schema: ${r.summary.tables} tables, ${r.summary.rpcs} RPCs`);
  console.log(`write-orphans: ${r.summary.writeOrphans} (allowlisted ${r.summary.allowlisted}, GATING ${r.summary.gating}) | read-orphans (info): ${r.summary.readOrphans}`);

  console.log('\n--- (a) WRITE-ORPHANS: app writes, nothing reads ---');
  for (const o of r.writeOrphans) {
    const tag = o.allowlisted ? `ALLOWLISTED (${o.reviewByPhase})` : 'GATING — NEW, not allowlisted';
    console.log(`  ${o.table}  [${tag}]`);
    console.log(`      writers: ${o.writers.map((w) => `${w.file}:${w.line}`).join(', ')}`);
    if (o.allowlisted) console.log(`      reason: ${o.reason}`);
  }
  if (r.writeOrphans.length === 0) console.log('  (none)');

  console.log('\n--- (b) READ-ORPHANS (informational): code reads, nothing writes ---');
  for (const o of r.readOrphans) {
    console.log(`  ${o.table}  readers: ${o.readers.map((x) => `${x.file}:${x.line}`).slice(0, 4).join(', ')}${o.readers.length > 4 ? ' …' : ''}`);
  }
  if (r.readOrphans.length === 0) console.log('  (none)');

  if (r.allowlistIssues.length) {
    console.log('\n--- ALLOWLIST AUDIT ISSUES ---');
    for (const i of r.allowlistIssues) console.log(`  ✗ ${i}`);
  }

  console.log(`\n=== ${r.ok ? 'PASS' : 'FAIL'} (gating write-orphans: ${r.summary.gating}, allowlist issues: ${r.allowlistIssues.length}) ===`);
  process.exit(r.ok ? 0 : 1);
}
