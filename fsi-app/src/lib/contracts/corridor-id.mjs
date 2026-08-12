// Deterministic corridor identity. ONE definition, JS and SQL, drift-guarded.
//
// WHY THIS FILE EXISTS. A corridor is the atomic unit of freight and no published standard identifies
// one, so we mint the ID. It is CONTENT-ADDRESSED rather than sequential for a specific reason: two
// independent ingest paths (an operator upload, a rate-board fetch, a regulation scoping rule) must
// arrive at the same corridor ID with ZERO coordination, or the surfaces re-fragment and the whole
// cross-surface join fails. A serial key would require a central minting call and a merge step; a
// content hash requires neither.
//
// THREE COLLISION CLASSES THIS FIXES (external review, 2026-08-12). The first draft of this scheme
// hashed `origin | mode | dest | coalesce(leg_ordinal,'')` and was wrong in three independent ways:
//
//   1. ROUTING WAS ABSENT — the severe one. Asia–Europe via Suez and Asia–Europe via the Cape of Good
//      Hope share origin, destination and mode, so they hashed IDENTICALLY. They are not the same
//      corridor: a Cape reroute raises fuel burn roughly 30–40%, which moves the vessel into a higher
//      FuelEU / EU ETS penalty bracket and changes the carbon component of the rate materially. Two
//      corridors whose statutory cost differs by a third cannot share a primary key. Routing is now
//      part of the payload.
//   2. NULL COLLAPSED INTO EMPTY STRING — `coalesce(leg_ordinal,'')` made "the whole corridor"
//      (leg_ordinal NULL) indistinguishable from "a leg whose ordinal is blank". NULL now has its own
//      sentinel that no real value can produce.
//   3. DELIMITER INJECTION — joining fields with a separator lets ("AB","C") and ("A","BC") produce the
//      same payload. Nobody names a UN/LOCODE with a pipe, but via-lists and carrier service strings are
//      free text and will eventually contain anything. Every field is now LENGTH-PREFIXED, which kills
//      the entire class rather than the instances we can currently imagine.
//
// SERVER-ONLY, unlike its siblings vocabularies.mjs and envelope.mjs. It imports node:crypto (a builtin,
// not a dependency) and must never be pulled into a client bundle. Corridor IDs are minted at ingest.
//
// SQL PARITY BY CODEGEN, following the surface-of.mjs precedent in this repo: `renderCorridorIdSql()`
// emits the SQL function body, a migration embeds it verbatim, and a drift guard regenerates and
// byte-compares so the two languages cannot diverge without failing CI. Byte lengths (not character
// counts) are used on both sides — JS Buffer.byteLength and SQL octet_length — so a multi-byte
// via-point name hashes identically in both.

import { createHash } from "node:crypto";
import { MODE_CODES, normaliseMode } from "./vocabularies.mjs";

/** Scheme version. BUMP on any change to the payload shape, never edit the payload silently. */
export const CORRIDOR_ID_SCHEME = "v1";

/**
 * Transport modes a corridor may carry. `multimodal` is a chain; its legs carry the concrete modes.
 *
 * DERIVED, NOT DECLARED, since 2026-08-12. This list was previously a private literal containing
 * "ocean" while the emission-factors table was drafted with "sea", which is one product with two names
 * for one mode and no error anywhere when they fail to match. The single definition now lives in
 * vocabularies.mjs.
 *
 * ALIASES ARE NOT RESOLVED HERE, DELIBERATELY. normaliseMode() maps "ocean" to "sea" at the EDGE. This
 * function must not, because the SQL twin cl_corridor_id() does only lower(btrim(...)): if JS quietly
 * accepted "ocean" and hashed it as "sea", the two implementations would return different keys for the
 * same input, which is precisely the divergence this module exists to make impossible. A non-canonical
 * mode is therefore a loud validation error, and the error names the function that fixes it.
 */
export const CORRIDOR_MODES = MODE_CODES;

/** Hex characters retained from the digest. 16 hex = 64 bits. */
export const CORRIDOR_ID_HEX_LEN = 16;

/**
 * Sentinel for an absent field.
 *
 * `N#` is unproducible by a present field, because a present field always begins with a decimal digit
 * (its byte length). So a payload segment starting with 'N' is unambiguously an absent field.
 *
 * Deliberately PRINTABLE. The first draft used a literal NUL byte here (and chr(0) in the generated
 * SQL). The two did agree, but a NUL in a source file makes it binary to grep and diff and is fragile
 * through any text transport, including the upload path this repo ships through. A sentinel that
 * survives being copied is worth more than one byte of theoretical elegance.
 */
const NULL_SENTINEL = "N#";

/**
 * Length-prefix one field: `<byteLength>#<value>`, or the NULL sentinel.
 *
 * Prefixing rather than delimiting is what makes the payload injective: given the byte length you know
 * exactly where the field ends, so no combination of field contents can reproduce another combination.
 */
function field(value) {
  if (value === null || value === undefined) return NULL_SENTINEL;
  const s = String(value);
  return `${Buffer.byteLength(s, "utf8")}#${s}`;
}

/**
 * Normalise a node reference. UN/LOCODEs, IATA and ICAO codes are case-insensitive in practice and
 * arrive from sources in both cases; normalising here prevents SHANGHAI and Shanghai minting two
 * corridors. Whitespace is stripped for the same reason.
 */
function normNode(v) {
  if (v === null || v === undefined) return null;
  return String(v).trim().toUpperCase();
}

/**
 * The canonical payload. Field ORDER is part of the scheme and must never be reordered.
 *
 * `via` is an ordered list and its order is SIGNIFICANT: a routing through Suez then Malta is not the
 * routing through Malta then Suez. It is length-prefixed by count and then element-wise, so a
 * two-element list can never encode as a one-element list containing a concatenation.
 *
 * `routing_key` is the discriminator that makes the Suez/Cape case work when no explicit via-point is
 * known: a source may say "Cape routing" without naming waypoints, and that assertion alone must
 * produce a distinct corridor.
 */
export function corridorPayload(spec) {
  const origin = normNode(spec?.origin);
  const dest = normNode(spec?.dest);
  const mode = spec?.mode === null || spec?.mode === undefined ? null : String(spec.mode).trim().toLowerCase();
  const via = Array.isArray(spec?.via) ? spec.via.map(normNode) : [];
  const legOrdinal = spec?.legOrdinal === null || spec?.legOrdinal === undefined
    ? null
    : Number.parseInt(spec.legOrdinal, 10);
  const routingKey = spec?.routingKey === null || spec?.routingKey === undefined
    ? null
    : String(spec.routingKey).trim().toLowerCase();

  return [
    CORRIDOR_ID_SCHEME,
    field(origin),
    field(dest),
    field(mode),
    field(legOrdinal),
    field(routingKey),
    field(via.length),
    ...via.map(field),
  ].join("");
}

/** Validate a corridor spec. Returns human-readable errors; empty means valid. */
export function validateCorridorSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") return ["corridor spec must be an object"];
  if (!normNode(spec.origin)) errors.push("origin is required");
  if (!normNode(spec.dest)) errors.push("dest is required");

  const mode = spec.mode === null || spec.mode === undefined ? null : String(spec.mode).toLowerCase();
  if (!mode) {
    errors.push("mode is required");
  } else if (!CORRIDOR_MODES.includes(mode)) {
    const canonical = normaliseMode(mode);
    errors.push(canonical
      ? `non-canonical mode "${mode}": call normaliseMode() at the edge and pass "${canonical}". `
        + `Resolving it here would diverge from the SQL twin, which only lowercases.`
      : `unknown mode: ${mode} (one of ${CORRIDOR_MODES.join(", ")})`);
  }

  if (spec.legOrdinal !== null && spec.legOrdinal !== undefined) {
    const n = Number(spec.legOrdinal);
    if (!Number.isInteger(n) || n < 1) errors.push("legOrdinal must be a positive integer or null");
  }
  if (spec.via !== undefined && spec.via !== null && !Array.isArray(spec.via)) {
    errors.push("via must be an array when present");
  }
  // A degenerate corridor (origin === dest with no via) is almost always an upstream parsing bug, and
  // minting an ID for it buries the bug behind a plausible-looking key.
  if (normNode(spec.origin) && normNode(spec.origin) === normNode(spec.dest)
      && (!Array.isArray(spec.via) || spec.via.length === 0)) {
    errors.push("origin equals dest with no via points: degenerate corridor");
  }
  return errors;
}

/** The corridor entity ID. THROWS on an invalid spec rather than minting a key for bad input. */
export function corridorId(spec) {
  const errors = validateCorridorSpec(spec);
  if (errors.length) throw new TypeError(`invalid corridor spec: ${errors.join("; ")}`);
  const digest = createHash("sha256").update(corridorPayload(spec), "utf8").digest("hex");
  return `cl:corridor:${digest.slice(0, CORRIDOR_ID_HEX_LEN)}`;
}

/**
 * SQL parity. Emits the body of `cl_corridor_id(...)` so a migration can embed it verbatim and the
 * drift guard can regenerate and byte-compare. Uses octet_length to match Buffer.byteLength, and
 * encode(digest(...)) from pgcrypto to match createHash('sha256').
 */
export function renderCorridorIdSql() {
  return `-- GENERATED by src/lib/contracts/corridor-id.mjs renderCorridorIdSql(). DO NOT EDIT BY HAND.
-- Drift-guarded: the guard regenerates this body and byte-compares against the migration.
CREATE OR REPLACE FUNCTION cl_corridor_field(v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL THEN 'N#'
              ELSE octet_length(v)::text || '#' || v END;
$$;

CREATE OR REPLACE FUNCTION cl_corridor_id(
  p_origin text, p_dest text, p_mode text,
  p_leg_ordinal int DEFAULT NULL, p_routing_key text DEFAULT NULL, p_via text[] DEFAULT '{}'
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'cl:corridor:' || left(encode(digest(
      '${CORRIDOR_ID_SCHEME}'
      || cl_corridor_field(upper(btrim(p_origin, E' \t\n\r')))
      || cl_corridor_field(upper(btrim(p_dest, E' \t\n\r')))
      || cl_corridor_field(lower(btrim(p_mode, E' \t\n\r')))
      || cl_corridor_field(p_leg_ordinal::text)
      || cl_corridor_field(lower(btrim(p_routing_key, E' \t\n\r')))
      || cl_corridor_field(coalesce(array_length(p_via, 1), 0)::text)
      || coalesce((SELECT string_agg(cl_corridor_field(upper(btrim(x, E' \t\n\r'))), '' ORDER BY ord)
                     FROM unnest(p_via) WITH ORDINALITY AS t(x, ord)), '')
    , 'sha256'), 'hex'), ${CORRIDOR_ID_HEX_LEN});
$$;`;
}

/**
 * Does a reroute change corridor identity? Convenience predicate for the ingest path, and the direct
 * expression of the review finding: a Cape reroute is a DIFFERENT corridor from a Suez routing, not an
 * attribute of the same one, because its statutory cost differs materially.
 */
export function isSameCorridor(a, b) {
  return corridorId(a) === corridorId(b);
}
