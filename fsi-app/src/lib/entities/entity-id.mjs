// entity-id.mjs — the entity spine's id builder (docs/specs/08-flywheel-design.md §1.1, §1.2) and
// kind vocabulary. Every `entities.entity_id` value in this system is minted by `entityId()` below,
// never hand-assembled at a call site — the same "one constructor, many callers" discipline
// `cl_corridor_id()` (migration 258) applies at the SQL layer for the corridor case specifically; this
// module is the JS-layer equivalent for ALL twelve kinds (the eleven of migration 282 and `material` of migration 357).
//
// FORMAT: `cl:<kind>:<16 lowercase hex>` — 16 hex characters (the first 16 of a sha256 hex digest, 8
// bytes of the 32-byte digest), matching the length migration 258's `cl_corridor_id()` already uses and
// the CHECK `entity_id LIKE 'cl:' || kind::text || ':%'` migration 282 enforces at the DB layer.
// DETERMINISTIC: the same (kind, seed) always mints the same id, with no coordination between two
// independent callers (spec §1.2's corridor rationale, generalised to every kind) — this is what makes
// the backfill idempotent (scripts/entities/backfill-entities.mjs re-running never mints a second row
// for an entity it already created).
//
// PLAIN ESM, ZERO DEPENDENCIES beyond node:crypto and the shared mode vocabulary
// (src/lib/contracts/vocabularies.mjs, itself plain-ESM/zero-dependency) — importable by a fitness
// function, a script, or a component with no npm install.

import { createHash } from "node:crypto";
import { normaliseMode } from "../contracts/vocabularies.mjs";
import { hostFromUrl } from "./host-from-url.mjs";
import { KINDS, assertEntityId, entityKindOf } from "./entity-id-shape.mjs";

const KIND_SET = new Set(KINDS);

const HEX_LEN = 16; // first 16 hex chars of the sha256 digest — see file header.

function sha256Hex16(payload) {
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, HEX_LEN);
}

function assertKind(kind) {
  if (!KIND_SET.has(kind)) {
    throw new Error(`entity-id: unknown entity_kind "${kind}" — must be one of ${KINDS.join(", ")}`);
  }
}

// hostFromUrl lives in ./host-from-url.mjs; KINDS/assertEntityId/entityKindOf live in
// ./entity-id-shape.mjs (one definition each, re-exported here so every existing importer of THIS
// module is unchanged): this file imports node:crypto at module top, which a browser bundle cannot
// resolve, and a client component needs the shape check / host normalizer without the id builder.
export { hostFromUrl, KINDS, assertEntityId, entityKindOf };

/**
 * Normalize a seed for one entity kind. Exported so a caller can preview the normalized seed (e.g. for
 * a dedup check) without minting an id. Kinds with no producer yet (node, asset, obligation, method,
 * technology, signpost, person) get a conservative generic normalization (trim + collapse whitespace,
 * no case change) so the builder never throws on a kind the spine structurally supports but this lane's
 * backfill does not populate — v1 scope is jurisdiction, instrument, organisation, corridor (spec §1.3).
 */
export function normalizeSeed(kind, seed) {
  assertKind(kind);
  if (kind === "corridor") {
    // seed is either the pre-built "ORIGIN-DEST:mode" string (already normalized) or an
    // { origin, dest, mode[, leg] } object — see corridorSeed() below for the object form.
    if (seed && typeof seed === "object") return corridorSeed(seed);
    return String(seed || "").trim();
  }
  if (kind === "jurisdiction") {
    return String(seed || "").trim().toUpperCase();
  }
  if (kind === "instrument") {
    return String(seed || "").trim().toUpperCase();
  }
  if (kind === "organisation") {
    // Accept either an already-bare host or a full URL; either way, reduce to the registrable host.
    const s = String(seed || "").trim();
    return s.includes("://") || s.includes("/") ? hostFromUrl(s) : s.toLowerCase().replace(/^www\./, "");
  }
  // Generic fallback for the kinds this lane's backfill does not produce. `material` (migration 357) takes it
  // too: its minter (src/lib/vocabulary/adopted-entities.mjs) passes the already-normalised, lower-case term key.
  return String(seed || "").trim().replace(/\s+/g, " ");
}

/**
 * Build the ADR-024 decision-4 corridor seed string "ORIGIN-DEST:mode" from
 * { origin, dest, mode }. UN/LOCODE endpoints uppercased; mode passed through the SHARED mode
 * vocabulary (normaliseMode — the same function migration 263's `mode` columns are canonicalised
 * against), so "sea"/"maritime" collapse to "ocean" here exactly as they do everywhere else in the
 * system. Throws on an unrecognised mode rather than minting an id for a corridor with no real mode —
 * a wrong-but-present id is worse than a loud refusal (the same posture ADR-024 names for decision 4).
 */
export function corridorSeed({ origin, dest, mode } = {}) {
  const o = String(origin || "").trim().toUpperCase();
  const d = String(dest || "").trim().toUpperCase();
  const canonicalMode = normaliseMode(mode);
  if (!o || !d) throw new Error(`entity-id: corridorSeed requires both origin and dest UN/LOCODE (got origin=${JSON.stringify(origin)}, dest=${JSON.stringify(dest)})`);
  if (!canonicalMode) throw new Error(`entity-id: corridorSeed got an unrecognised mode ${JSON.stringify(mode)} — normaliseMode() could not resolve it to a canonical transport mode`);
  return `${o}-${d}:${canonicalMode}`;
}

/**
 * Mint the deterministic entity id for (kind, seed). `seed` is kind-shaped — see normalizeSeed() above
 * (a corridor seed may be the object form; every other kind takes a string). Never guesses: an empty
 * normalized seed throws rather than minting an id that would collide with every other empty-seed call.
 */
export function entityId(kind, seed) {
  assertKind(kind);
  const normalized = normalizeSeed(kind, seed);
  if (!normalized) {
    throw new Error(`entity-id: empty normalized seed for kind "${kind}" (raw seed: ${JSON.stringify(seed)}) — refusing to mint a degenerate id`);
  }
  return `cl:${kind}:${sha256Hex16(normalized)}`;
}

// assertEntityId / entityKindOf now live in ./entity-id-shape.mjs (imported above, re-exported in
// this file's header block), removed from here, not duplicated.
