// applied-map.mjs -- resolve production's migration ledger against the repo's files through
// fsi-app/supabase/migrations/APPLIED-MAP.json (lane PROOF-1, coordinator ruling 2026-10-07; the map itself is
// produced by lane MIG-HIST-1).
//
// WHY. Production's ledger names (list_migrations) diverge from the repo's file names, and many ledger rows have no
// file of their own (a later master migration retroactively captured their DDL, or the row was a data-only load).
// So "which file stands for which ledger row" is a fact someone has to record; this is the reader of that record.
//
// SHAPE. An object keyed by ledger version; each value { name, file: <path or null>, class, superseded_by?, note? }.
// Classes and what the replay does:
//   identical | comments-only | code-differs | recovered   a file stands for the row: APPLY that file, in order
//   statements-null | apply-record-stub                    the ledger stored no SQL (or only a provenance note) for the row: the file
//                                                          is the only text there is, so it is APPLIED like identical (MIG-HIST-1b)
//   superseded-by | data-only | comment-only               the row is SATISFIED with no file of its own: counted, listed
//   outside-ledger                                         a file that is live but has no ledger row: APPLIED
//   never-applied | duplicate-prefix                       a file production never applied: SKIPPED and listed
// The last two groups are handled by their file, whatever their key is.
//
// ORDER. Files that stand for a ledger row apply in LEDGER ORDER (the ledger version per entry, ascending), not in file
// number order; see orderByLedger().
//
// ERRORS (the replay refuses): the map is absent (red until MIG-HIST-1 lands, the honest state); a ledger version
// absent from the map; a class that is not in the list; an entry that needs a file and has none; a map entry whose
// file (or superseded_by file) is missing on disk; a file claimed both to apply and to skip; a file to apply that the
// migrations inventory (the order source) does not list.

export const APPLY_CLASSES = Object.freeze(["identical", "comments-only", "code-differs", "recovered", "statements-null", "apply-record-stub"]);
export const SATISFIED_CLASSES = Object.freeze(["superseded-by", "data-only", "comment-only"]);
export const BY_FILE_APPLY_CLASSES = Object.freeze(["outside-ledger"]);
export const SKIP_CLASSES = Object.freeze(["never-applied", "duplicate-prefix"]);
export const CLASSES = Object.freeze([...APPLY_CLASSES, ...SATISFIED_CLASSES, ...BY_FILE_APPLY_CLASSES, ...SKIP_CLASSES]);

/** A ledger version is all digits ("028", "20260717223651"); map keys such as "outside:009" are not. */
function isLedgerVersion(key) {
  return /^\d+$/.test(String(key));
}

/**
 * The replay ORDER (coordinator ruling 2026-10-08, lane MIG-CI): files that stand for a ledger row apply in LEDGER ORDER,
 * the map's ledger version per entry ascending (numeric, so "028" before "20260717223651"), never in the inventory's file
 * number order. A file with no ledger version (outside-ledger: live but never recorded) has no place of its own in the
 * ledger, so it applies immediately after the ledgered file that precedes it in the inventory (or first, when none does),
 * and several such files keep their inventory order. PURE.
 */
export function orderByLedger(items, position) {
  const byInventory = [...items].sort((a, b) => position.get(a.file) - position.get(b.file));
  const ledgered = byInventory.filter((i) => isLedgerVersion(i.key));
  ledgered.sort((a, b) => {
    const x = BigInt(a.key);
    const y = BigInt(b.key);
    return x < y ? -1 : x > y ? 1 : position.get(a.file) - position.get(b.file);
  });
  const after = new Map();
  const first = [];
  let anchor = null;
  for (const item of byInventory) {
    if (isLedgerVersion(item.key)) { anchor = item.file; continue; }
    if (anchor == null) first.push(item);
    else after.set(anchor, [...(after.get(anchor) ?? []), item]);
  }
  const out = [...first];
  for (const item of ledgered) out.push(item, ...(after.get(item.file) ?? []));
  return out;
}

/** Parse the map's text. PURE. Returns { map } or { error }. */
export function parseAppliedMap(text) {
  if (text == null) return { error: "fsi-app/supabase/migrations/APPLIED-MAP.json is absent: the replay is red until lane MIG-HIST-1 lands it" };
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return { error: `APPLIED-MAP.json is not JSON: ${e.message}` }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "APPLIED-MAP.json must be an object keyed by ledger version" };
  return { map: parsed };
}

/**
 * Resolve the ledger against the map. PURE.
 * @param {{version:string,name:string}[]} ledger  the committed applied-migrations inventory rows
 * @param {object} map  parsed APPLIED-MAP.json
 * @param {string[]} diskFiles  *.sql file names in the migrations directory
 * @param {string[]} orderFiles  file names in the migrations inventory's order (the order source)
 */
export function resolveMap({ ledger, map, diskFiles, orderFiles }) {
  const errors = [];
  const onDisk = new Set(diskFiles);
  const toApplyByFile = new Map();
  const skippedByFile = new Map();
  const satisfied = [];
  const referenced = new Set();

  for (const [key, entry] of Object.entries(map)) {
    if (!entry || typeof entry !== "object") { errors.push({ kind: "entry_invalid", key, message: "the entry is not an object" }); continue; }
    const cls = entry.class;
    if (!CLASSES.includes(cls)) { errors.push({ kind: "class_unknown", key, class: cls ?? null, message: `unknown class ${JSON.stringify(cls)}` }); continue; }
    const file = entry.file ?? null;
    if (file != null) {
      if (typeof file !== "string") { errors.push({ kind: "entry_invalid", key, message: "file must be a string or null" }); continue; }
      referenced.add(file);
      if (!onDisk.has(file)) errors.push({ kind: "entry_file_missing", key, class: cls, file, message: "the file is missing on disk" });
    }
    if (entry.superseded_by != null) {
      if (!onDisk.has(entry.superseded_by)) errors.push({ kind: "superseded_by_missing", key, class: cls, file: entry.superseded_by, message: "the superseding file is missing on disk" });
      else referenced.add(entry.superseded_by);
    }
    if (SATISFIED_CLASSES.includes(cls)) {
      satisfied.push({ key, name: entry.name ?? null, class: cls, superseded_by: entry.superseded_by ?? null });
      continue;
    }
    if (file == null) { errors.push({ kind: "entry_needs_file", key, class: cls, message: `class ${cls} needs a file` }); continue; }
    if (SKIP_CLASSES.includes(cls)) skippedByFile.set(file, { key, file, class: cls });
    else {
      const prior = toApplyByFile.get(file);
      // one file claimed by two ledger versions: it ran at the earlier one
      if (!prior || (isLedgerVersion(key) && (!isLedgerVersion(prior.key) || BigInt(key) < BigInt(prior.key)))) toApplyByFile.set(file, { key, file, class: cls, version: key });
    }
  }

  for (const file of toApplyByFile.keys()) {
    if (skippedByFile.has(file)) errors.push({ kind: "file_conflict", file, message: "the file is claimed both to apply and to skip" });
  }

  const missingVersions = new Set();
  for (const row of ledger) {
    if (!(row.version in map) && !missingVersions.has(row.version)) {
      missingVersions.add(row.version);
      errors.push({ kind: "ledger_version_not_in_map", key: row.version, name: row.name, message: "the ledger version has no entry in the map" });
    }
  }

  const position = new Map(orderFiles.map((f, i) => [f, i]));
  const toApply = [];
  for (const item of toApplyByFile.values()) {
    if (!onDisk.has(item.file)) continue;
    if (!position.has(item.file)) { errors.push({ kind: "apply_file_not_in_inventory", file: item.file, message: "the file is not listed in docs/inventories/migrations.md, so its order is unknown" }); continue; }
    toApply.push(item);
  }
  const ordered = orderByLedger(toApply, position);

  return {
    errors,
    toApply: ordered,
    satisfied: satisfied.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    skipped: [...skippedByFile.values()].filter((s) => onDisk.has(s.file)).sort((a, b) => (a.file < b.file ? -1 : 1)),
    unreferenced: diskFiles.filter((f) => !referenced.has(f)).sort(),
  };
}
