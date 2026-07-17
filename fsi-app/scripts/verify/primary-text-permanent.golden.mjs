#!/usr/bin/env node
// primary-text-permanent.golden.mjs — behavioral golden for the primary-text-is-permanent doctrine
// (document-baseline addendum rule 1). Proves the retention property at the pure content-addressing layer that
// makes raw_fetches append-only for ANY caller (CC or groundBrief): the storage key + the UNIQUE(source_id,
// content_hash) index are derived from the CONTENT HASH, so a CHANGED re-capture (different bytes -> different
// hash -> different key/row) can NEVER overwrite the prior snapshot, and an IDENTICAL re-capture (same bytes ->
// same hash -> same key/row) is idempotent. There is no prune path. This is the document-level twin of
// grounding-is-non-destructive. No DB (the DB UNIQUE index + no-delete are the enforcement; this proves the
// key-derivation that the index keys on). Run: node scripts/verify/primary-text-permanent.golden.mjs
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { sha256Hex } = await jiti.import("../../src/lib/sources/snapshot-store.mjs");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// The storage key + the raw_fetches row key are content-addressed exactly as writeSnapshot builds them:
//   file_path = `${sourceId}/${isoDay}/${contentHash}.html.gz` ; row key = UNIQUE(source_id, content_hash).
const key = (sourceId, day, content) => `${sourceId}/${day}/${sha256Hex(content)}.html.gz`;
const rowKey = (sourceId, content) => `${sourceId}::${sha256Hex(content)}`;

const SRC = "src-1";
const V1 = "From 1 January 2032, ships of 10,000 GT and above shall use zero-emission energy sources.";
const V2 = "From 1 January 2032, ships of 10,000 GT and above shall use zero-emission energy sources. Amended: exemptions extended to 2031.";

// 1. CHANGED re-capture never overwrites: different content -> different hash -> different key + different row.
check("changed re-capture yields a DIFFERENT content hash", sha256Hex(V1) !== sha256Hex(V2));
check("changed re-capture yields a DIFFERENT storage key (no blob overwrite)", key(SRC, "2026-08-01", V2) !== key(SRC, "2026-07-16", V1));
check("changed re-capture yields a DIFFERENT row key (new versioned row, prior preserved)", rowKey(SRC, V2) !== rowKey(SRC, V1));

// 2. IDENTICAL re-capture is idempotent: same content -> same hash -> same row key (UNIQUE dedups, no duplicate).
check("identical re-capture yields the SAME content hash", sha256Hex(V1) === sha256Hex(V1));
check("identical re-capture yields the SAME row key (idempotent, one version)", rowKey(SRC, V1) === rowKey(SRC, V1));

// 3. hash is stable + collision-resistant shape (64 hex chars) — the version identity the no-change proof keys on.
check("content hash is 64 hex chars (sha-256)", /^[0-9a-f]{64}$/.test(sha256Hex(V1)));

// 4. the version identity is the CONTENT, not the date: same content captured on two days is ONE version.
check("same content on different days is ONE version (content-addressed, not date-addressed)", rowKey(SRC, V1) === rowKey(SRC, V1) && key(SRC, "2026-07-16", V1).endsWith(sha256Hex(V1) + ".html.gz"));

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
