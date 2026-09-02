// entity-id.mjs — the entity spine's id builder (docs/specs/08-flywheel-design.md §1.1, §1.2) and
// kind vocabulary. Every `entities.entity_id` value in this system is minted by `entityId()` below,
// never hand-assembled at a call site — the same "one constructor, many callers" discipline
// `cl_corridor_id()` (migration 258) applies at the SQL layer for the corridor case specifically; this
// module is the JS-layer equivalent for ALL eleven kinds.
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

// The full entity_kind enum, byte-identical to migration 282's `CREATE TYPE entity_kind AS ENUM (...)`
// (spec §1.1). Frozen so a caller cannot silently widen the vocabulary — widening it means a migration.
export const KINDS = Object.freeze([
  "corridor", "node", "jurisdiction", "organisation", "asset",
  "instrument", "obligation", "method", "technology", "signpost", "person",
]);
const KIND_SET = new Set(KINDS);

const HEX_LEN = 16; // first 16 hex chars of the sha256 digest — see file header.
const ID_RE = /^cl:([a-z_]+):([0-9a-f]{16})$/;

function sha256Hex16(payload) {
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, HEX_LEN);
}

function assertKind(kind) {
  if (!KIND_SET.has(kind)) {
    throw new Error(`entity-id: unknown entity_kind "${kind}" — must be one of ${KINDS.join(", ")}`);
  }
}

/** Lowercased, www-stripped registrable host from a URL or a bare host string. Pure; throws on nothing —
 *  an unparseable value normalizes to "" (the caller decides whether an empty host is fatal), matching
 *  the fail-safe posture every `new URL(...).hostname` call site in src/lib/sources/** already uses. */
export function hostFromUrl(urlOrHost) {
  const raw = String(urlOrHost || "").trim();
  if (!raw) return "";
  try {
    const u = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

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
  // Generic fallback for the six kinds this lane's backfill does not yet produce.
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

/**
 * Validate an entity id's shape: `cl:<kind>:<16 lowercase hex>` with kind in KINDS. When `expectedKind`
 * is given, also asserts the id's kind segment matches it. Throws with a descriptive message on any
 * failure (fail loud, matching db.mjs's requireCite()/scripts/lib conventions) rather than returning a
 * boolean a caller might forget to check.
 */
export function assertEntityId(id, expectedKind) {
  const s = String(id || "");
  const m = s.match(ID_RE);
  if (!m) {
    throw new Error(`entity-id: "${s}" is not a well-formed entity id (expected cl:<kind>:<16 lowercase hex>)`);
  }
  const [, kind] = m;
  if (!KIND_SET.has(kind)) {
    throw new Error(`entity-id: "${s}" names kind "${kind}", which is not in KINDS (${KINDS.join(", ")})`);
  }
  if (expectedKind && kind !== expectedKind) {
    throw new Error(`entity-id: "${s}" is a "${kind}" entity id, expected "${expectedKind}"`);
  }
  return true;
}

/** Extract the kind segment from a well-formed entity id, or null if malformed. Non-throwing sibling of
 *  assertEntityId(), for a caller that wants to branch on kind rather than fail. */
export function entityKindOf(id) {
  const m = String(id || "").match(ID_RE);
  return m ? m[1] : null;
}
