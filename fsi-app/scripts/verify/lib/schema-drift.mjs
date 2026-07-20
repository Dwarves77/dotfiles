// @ts-check
// SCHEMA-DRIFT pure core (the apply-then-commit-later window that burned the census TWICE:
// census_worklist and coverage_gap_census_findings each existed LIVE with no committed migration when
// their first consumer needed them). This module answers one question with no I/O: given the set of
// object names created by the committed migrations and the set of objects live in the database, which
// live objects have NO committed CREATE source? Those are drift — a schema shipped ahead of (or without)
// its versioned source, the exact ordering the two-track policy forbids.
//
// PURE — regex over SQL text + set diff. The runner (schema-drift-audit.mjs) supplies the live objects
// (information_schema introspection) and the migration SQL; this module never touches the DB or fs.

/**
 * Extract the names of every object CREATEd in one migration's SQL. Covers the object kinds a migration
 * introduces that then appear in information_schema: tables, views, materialized views. Case-insensitive;
 * tolerates `IF NOT EXISTS`, `OR REPLACE`, an optional `public.` schema qualifier, and quoted identifiers.
 * @param {string} sql migration file text (LF-normalized by the caller)
 * @returns {Set<string>} bare object names (unqualified, unquoted, lower-cased)
 */
export function extractCreatedObjects(sql) {
  const names = new Set();
  const text = String(sql ?? "");
  // CREATE [UNLOGGED] TABLE [IF NOT EXISTS] [public.]name
  // CREATE [OR REPLACE] [MATERIALIZED|TEMP|TEMPORARY] VIEW [IF NOT EXISTS] [public.]name
  const re =
    /\bcreate\s+(?:or\s+replace\s+)?(?:unlogged\s+|global\s+|local\s+|temp\s+|temporary\s+)?(?:materialized\s+)?(table|view)\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\s*\.\s*)?("?)([a-zA-Z_][a-zA-Z0-9_$]*)\2/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    names.add(m[3].toLowerCase());
  }
  return names;
}

/**
 * Fold every migration's created-object names into one committed set.
 * @param {string[]} migrationSqls the LF-normalized text of each committed migration
 * @returns {Set<string>} union of all created object names
 */
export function committedObjectNames(migrationSqls) {
  const all = new Set();
  for (const sql of migrationSqls) {
    for (const name of extractCreatedObjects(sql)) all.add(name);
  }
  return all;
}

/**
 * Diff live objects against the committed set. A live object with no committed CREATE and no allowlist
 * entry is DRIFT (a schema object shipped without a versioned source). The allowlist carries objects that
 * legitimately have no migration source (extension-provisioned tables, platform-managed objects), each
 * with a stated reason — the same reason-bearing-allowlist discipline the orphan gate uses.
 * @param {{liveObjects: Array<{name:string, kind:string}>, committed: Set<string>, allowlist?: Record<string,string>}} args
 * @returns {Array<{name:string, kind:string, reason:string}>} drift records (empty = no drift)
 */
export function diffSchema({ liveObjects, committed, allowlist = {} }) {
  const drift = [];
  for (const obj of liveObjects) {
    const name = String(obj.name).toLowerCase();
    if (committed.has(name)) continue;
    if (Object.prototype.hasOwnProperty.call(allowlist, name)) continue;
    drift.push({
      name: obj.name,
      kind: obj.kind,
      reason: "live in public schema with no committed CREATE in supabase/migrations/ (schema shipped ahead of its versioned source)",
    });
  }
  return drift;
}

/**
 * Report stale allowlist entries: an allowlisted name that is no longer live OR that now HAS a committed
 * source is dead weight and should be removed (the allowlist is itself audited, per the orphan-gate rule).
 * @param {{liveNames: Set<string>, committed: Set<string>, allowlist: Record<string,string>}} args
 * @returns {Array<{name:string, reason:string}>}
 */
export function staleAllowlistEntries({ liveNames, committed, allowlist }) {
  const stale = [];
  for (const name of Object.keys(allowlist)) {
    const lower = name.toLowerCase();
    if (!liveNames.has(lower)) {
      stale.push({ name, reason: "allowlisted but no longer live in public schema — remove the entry" });
    } else if (committed.has(lower)) {
      stale.push({ name, reason: "allowlisted but now HAS a committed CREATE — remove the entry (no longer needs the exemption)" });
    }
  }
  return stale;
}
