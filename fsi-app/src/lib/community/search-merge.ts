/** Union of per-column search reads, newest first, deduplicated by id, capped. Lane R21 (CF-SEC-15).
 *
 *  /api/community/search used to match two columns with one `.or("title.ilike.<q>,body.ilike.<q>")` string,
 *  which PostgREST parses for structure (`,` `(` `)` `.` in the caller's text could add filter terms). It now
 *  issues one `.ilike(column, pattern)` read per column (each value is a single parameter) and unions the
 *  results here. Pure so it loads under plain `node --test`. */

export function unionByRecency<T extends { id: string }>(
  lists: ReadonlyArray<ReadonlyArray<T>>,
  recencyKey: keyof T,
  limit: number
): T[] {
  const seen = new Map<string, T>();
  for (const list of lists) for (const row of list) if (!seen.has(row.id)) seen.set(row.id, row);
  return Array.from(seen.values())
    .sort((a, b) => String(b[recencyKey] ?? "").localeCompare(String(a[recencyKey] ?? "")))
    .slice(0, limit);
}
