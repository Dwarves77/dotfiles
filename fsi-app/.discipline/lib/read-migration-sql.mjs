// @ts-check
// Shared migration-SQL reader for the byte-identical discipline guards (guard-fix 2b, operator ruling
// 2026-07-04). Normalizes CRLF -> LF at read, so a Windows autocrlf working-tree checkout does not
// false-fail a byte-identical comparison against LF-generating .mjs source-of-truth. Used by EVERY
// migration-parsing guard (vocab-drift/148, url-canon/150, authorityFloorFor/141) — one reader, no drift.
//
// EOL NORMALIZATION ONLY. It does NOT trim, lowercase, collapse whitespace, or otherwise loosen the
// comparison — a genuine content divergence still shows (the red case stays red). Pure (fs + string).
import { readFileSync } from "node:fs";

/** Read a migration .sql and normalize line endings to LF. @param {string} path @returns {string} */
export function readMigrationSql(path) {
  return normalizeEol(readFileSync(path, "utf8"));
}

/** Pure CRLF->LF (and lone CR->LF) normalization. Exposed for the guards' in-memory fixtures. */
export function normalizeEol(s) {
  return String(s).replace(/\r\n?/g, "\n");
}
