// @ts-check
// SHARED information_schema scan (lane TOOL-GAP-2, 2026-09-25). GOVERNING: remediation-discipline
// (reuse-before-construction) + docs/plans/data-machine-tool-gaps-2026-09-25.md ("both are read-only,
// both share one information_schema scan"). ONE query module for both the dead-column audit (DEAD-1) and
// the duplicate-table structural checker (DUP-1's own next-step ask), so a future third schema-shape audit
// has a module to extend instead of a third copy of the same four queries. Pure I/O boundary: every export
// here takes a connected pg.Client and returns plain data; no decision logic lives in this file (that is
// each audit's own lib/*-scan.mjs pure core).
//
// Read-only. SELECT against information_schema + pg_constraint only, never writes, never touches
// application tables' rows.

/** Every column of every base table in the public schema.
 * @param {import('pg').Client} client
 * @returns {Promise<Array<{table:string, column:string, dataType:string, udtName:string, isNullable:boolean, ordinalPosition:number, columnDefault:string|null}>>}
 */
export async function fetchColumns(client) {
  const { rows } = await client.query(`
    SELECT c.table_name AS table, c.column_name AS column, c.data_type AS "dataType",
           c.udt_name AS "udtName", (c.is_nullable = 'YES') AS "isNullable",
           c.ordinal_position AS "ordinalPosition", c.column_default AS "columnDefault",
           (c.is_generated = 'ALWAYS') AS "isGenerated"
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position;`);
  return rows;
}

/** Every base table in the public schema, with its comment (if any). Row count is a separate, per-table
 * `SELECT count(*)`, cheap for the audit's own reporting, not fetched here (this module stays a pure
 * catalog read; row counts are a live-data read the caller opts into explicitly). */
export async function fetchTables(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS table, obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;`);
  return rows;
}

/** Columns that are part of a PRIMARY KEY, in any public table. Set of "table.column" strings. */
export async function fetchPrimaryKeyColumns(client) {
  const { rows } = await client.query(`
    SELECT tc.table_name AS table, kcu.column_name AS column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY';`);
  return new Set(rows.map((r) => `${r.table}.${r.column}`));
}

/** Every FOREIGN KEY edge in the public schema: the referencing (table, column) and the referenced
 * (table, column) it points at. Used by both DEAD-1 (exclude FK columns from the dead-column scope, per
 * the audit's own "net of PK/FK/timestamp/generated columns" scoping) and DUP-1 (FK-target overlap is one
 * of the two structural similarity signals for candidate duplicate-table pairs). */
export async function fetchForeignKeys(client) {
  const { rows } = await client.query(`
    SELECT
      tc.table_name AS table, kcu.column_name AS column,
      ccu.table_name AS "refTable", ccu.column_name AS "refColumn"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY';`);
  return rows;
}

/** One shared snapshot: everything both audits need, fetched once per process. Each audit still connects
 * its own pg.Client (they run as separate spawned processes under run-data-audit-lane.mjs), but both call
 * through this one function so the four queries above have exactly one call site each in the whole repo. */
export async function fetchSchemaSnapshot(client) {
  const [columns, tables, primaryKeyColumns, foreignKeys] = await Promise.all([
    fetchColumns(client),
    fetchTables(client),
    fetchPrimaryKeyColumns(client),
    fetchForeignKeys(client),
  ]);
  return { columns, tables, primaryKeyColumns, foreignKeys };
}
