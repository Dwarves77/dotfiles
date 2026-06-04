// src/lib/sources/instrument-identity.ts
//
// Canonical instrument-identity derivation. The SOURCE is the authority for a regulation's
// identity (instrument class + number); the display title is a view of that identity, not an
// independent LLM label (the mistitle root). FACTS ONLY — parses a citation out of the
// source_url; no legal interpretation of what the instrument requires.
//
// Scope (2026-06-03): EU ELI + CELEX citations. Jurisdiction-specific schemes (US Federal
// Register RIN/citation, UK legislation, IMO resolutions, ISO numbers) are NOT parsed yet —
// instrument-bearing items on those sources resolve to `pending_parse`, not a wrong id.
// EU Commission DECISIONS have no slot in the instrument_type CHECK enum (migration 079), and
// COM proposals are not enacted instruments — both return null (→ pending_parse / not the
// regulation identity space).

export type InstrumentType = "eu_regulation" | "eu_directive";

export type IdentityStatus = "resolved" | "pending_parse" | "pending_dedup" | "not_applicable";

export interface ParsedIdentity {
  instrumentType: InstrumentType;
  instrumentIdentifier: string; // canonical "YYYY/N" (no leading zeros)
  scheme: "ELI" | "CELEX";
}

// item_types that CAN bear a codified instrument identity. Everything else is identity-free by
// design (signals, research, tools, regional data, market signals, initiatives are not
// instruments and will never parse — they get `not_applicable`, never `pending_parse`).
export const INSTRUMENT_BEARING_ITEM_TYPES: ReadonlySet<string> = new Set([
  "regulation",
  "directive",
  "standard",
  "guidance",
  "framework",
]);

const ELI_TYPE: Record<string, InstrumentType> = { reg: "eu_regulation", dir: "eu_directive" };
const CELEX_TYPE: Record<string, InstrumentType> = { R: "eu_regulation", L: "eu_directive" };

/** Parse an EU ELI or CELEX instrument citation out of a source_url. Returns null when the url
 *  carries no parseable enacted-instrument citation (bare portal page, proposal, decision). */
export function parseInstrumentIdentity(sourceUrl: string | null | undefined): ParsedIdentity | null {
  if (!sourceUrl) return null;
  let url: string;
  try {
    url = decodeURIComponent(String(sourceUrl));
  } catch {
    url = String(sourceUrl);
  }

  // ELI: /eli/{reg|dir}[_impl|_del]/{year}/{number}/...  (decisions deliberately excluded)
  let m = url.match(/\/eli\/(reg|dir)(?:_impl|_del)?\/(\d{4})\/(\d+)/i);
  if (m) {
    const t = ELI_TYPE[m[1].toLowerCase()];
    if (t) return { instrumentType: t, instrumentIdentifier: `${m[2]}/${parseInt(m[3], 10)}`, scheme: "ELI" };
  }

  // CELEX legislation: ...CELEX:3{year}{R|L}{number}  (sector 3 = legislation; D excluded)
  m = url.match(/CELEX[:\s]*3(\d{4})([RL])(\d+)/i);
  if (m) {
    const t = CELEX_TYPE[m[2].toUpperCase()];
    if (t) return { instrumentType: t, instrumentIdentifier: `${m[1]}/${parseInt(m[3], 10)}`, scheme: "CELEX" };
  }

  return null;
}

/** Full identity disposition for a row from its item_type + source_url. Collision detection
 *  (a second instrument-bearing row deriving an already-held canonical key) is the caller's
 *  job — those losers become `pending_dedup` rather than `resolved`. */
export function classifyIdentity(
  itemType: string | null | undefined,
  sourceUrl: string | null | undefined,
): { status: Exclude<IdentityStatus, "pending_dedup">; parsed: ParsedIdentity | null } {
  const parsed = parseInstrumentIdentity(sourceUrl);
  if (parsed) return { status: "resolved", parsed };
  if (itemType && INSTRUMENT_BEARING_ITEM_TYPES.has(itemType)) return { status: "pending_parse", parsed: null };
  return { status: "not_applicable", parsed: null };
}
