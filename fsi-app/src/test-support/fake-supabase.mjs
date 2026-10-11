function matchesFilters(row, filters) {
  return filters.every(([col, op, val]) => {
    if (op === "eq") return row[col] === val;
    if (op === "in") return Array.isArray(val) && val.includes(row[col]);
    return true;
  });
}

function conflictKey(row, cols) {
  return cols.map((c) => row[c]).join("␟"); // unit-separator join: won't collide with real column values
}

/**
 * @param {Record<string, object[]>} initialTables - seed rows per table name.
 * @returns {{ tables: Record<string, object[]>, updates: Record<string, object[]>, from: (table: string) => object }}
 */
export function fakeSupabase(initialTables = {}) {
  const tables = {};
  for (const [name, rows] of Object.entries(initialTables)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const updates = {};

  function ensureTable(name) {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  return {
    tables,
    updates,
    from(name) {
      const filters = [];
      const builder = {
        select() { return builder; },
        eq(col, val) { filters.push([col, "eq", val]); return builder; },
        in(col, val) { filters.push([col, "in", val]); return builder; },
        // Terminal read: awaiting the chain (no further method call) resolves via `.then`, exactly
        // like real supabase-js's PostgrestFilterBuilder being itself a thenable.
        then(resolve, reject) {
          const rows = ensureTable(name).filter((r) => matchesFilters(r, filters));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
        // upsert() is itself the terminal call in every call site this fake serves (no further
        // chaining after it), so it can just be async rather than returning a second thenable builder.
        async upsert(rows, { onConflict, ignoreDuplicates = false } = {}) {
          const table = ensureTable(name);
          const cols = onConflict ? onConflict.split(",") : null;
          for (const row of rows) {
            const existingIdx = cols
              ? table.findIndex((r) => conflictKey(r, cols) === conflictKey(row, cols))
              : -1;
            if (existingIdx >= 0) {
              if (!ignoreDuplicates) table[existingIdx] = { ...table[existingIdx], ...row };
              // ignoreDuplicates: true and a conflict was found -> DO NOTHING, matching Postgres's
              // ON CONFLICT ... DO NOTHING semantics this codebase's real upserts rely on.
            } else {
              table.push({ ...row });
            }
          }
          return { data: rows, error: null };
        },
        // update() returns a builder exposing .eq(); the write only actually happens once .eq() is
        // awaited, matching supabase-js's own "nothing happens until the chain is awaited" contract.
        update(payload) {
          return {
            eq(col, val) {
              if (!updates[name]) updates[name] = [];
              updates[name].push(payload);
              for (const row of ensureTable(name)) {
                if (row[col] === val) Object.assign(row, payload);
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
      return builder;
    },
  };
}
