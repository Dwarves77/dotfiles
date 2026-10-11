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
