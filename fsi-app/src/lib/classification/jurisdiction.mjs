// jurisdiction.mjs — Axis 3 (legal/geographic scope the SOURCE operates under) classifier.
// docs/plans/source-classification-framework-2026-05-10.md, "Axis 3: Jurisdiction": "the legal scope
// under which the source operates, NOT the geographic scope of its content" (NREL is us-federal even
// reporting on global solar). Deterministic from institution HOST identity only — no content fetch, no
// LLM, no name-keyword guessing (a name can describe a document title, not the publisher; the sibling
// classify-source-role.ts's "host outranks name" doctrine — 2026-08-11 — is the same lesson applied to
// a different axis here).
//
// Returns null when genuinely undeterminable (mirrors classifySourceRole's own contract) rather than
// guessing a jurisdiction from weak signal — a wrong jurisdiction poisons conflict resolution (Axis 2)
// and coverage displays downstream, so "flag for operator assignment" is the only honest fallback.

import { isValidJurisdictionValue } from "./vocab.mjs";

/** Host-suffix -> Axis-3 jurisdiction value. Each entry is a HIGH-CONFIDENCE institutional-domain
 *  signal (a country's reserved government second-level domain, or an EU/int institutional TLD) —
 *  deliberately narrow rather than a broad ccTLD guess (a .de commercial site is not "jurisdiction=DE"
 *  by the framework's own rule; only the OPERATING institution's legal domicile counts).
 *
 *  ANCHORED `(^|\.)`, NOT bare `\.` (fixed 2026-09-02, same bug class classify-source-role.ts's own
 *  "HOST OUTRANKS NAME" note already fixed once in this codebase for exactly this reason — see that
 *  file's `(^|\.)gov\.` comment on Manitoba's gov.mb.ca). A plain `/\.gov\.au$/` requires a "."
 *  immediately before "gov.au", so it matches "www.industry.gov.au" but NOT the bare second-level host
 *  "gov.au" itself (no character precedes "g"), and likewise for gouv.fr/bund.de/gob.mx/etc. That
 *  silently missed every ministry publishing straight off its country's bare gov domain — confirmed by
 *  this module's own test suite before the fix (classifySourceJurisdiction({url:"https://www.gouv.fr/x"})
 *  returned null). `(^|\.)` matches both the bare host and any subdomain of it. */
const GOV_HOST_JURISDICTION = Object.freeze([
  [/(^|\.)europa\.eu$/, "EU"],
  [/(^|\.)gov\.uk$/, "GB"], [/(^|\.)parliament\.uk$/, "GB"],
  [/(^|\.)gouv\.fr$/, "FR"], [/(^|\.)bund\.de$/, "DE"], [/(^|\.)bundestag\.de$/, "DE"],
  [/(^|\.)gob\.mx$/, "MX"], [/(^|\.)gob\.es$/, "ES"], [/(^|\.)gc\.ca$/, "CA"],
  [/(^|\.)gov\.au$/, "AU"], [/(^|\.)govt\.nz$/, "NZ"], [/(^|\.)go\.jp$/, "JP"],
  [/(^|\.)gov\.sg$/, "SG"], [/(^|\.)gov\.hk$/, "HK"], [/(^|\.)gov\.in$/, "IN"],
  [/(^|\.)gov\.cn$/, "CN"], [/(^|\.)gov\.za$/, "ZA"], [/(^|\.)gov\.br$/, "BR"], [/(^|\.)gov\.ie$/, "IE"],
  // Bare `.gov` is reserved to US federal/state government — checked AFTER the more specific
  // `.gov.<cc>` suffixes above so e.g. `.gov.uk` never falls through and matches the bare rule instead
  // (`.gov.uk` does not end in the literal string ".gov", so order does not strictly matter here, but
  // the explicit ordering documents the intent).
  [/\.gov$/, "US"],
]);

const INTERGOVERNMENTAL_HOST = /\.int$/;

/**
 * Classify a source's Axis-3 jurisdiction from its host (+ its already-known Axis-1 role as a prior).
 * Pure, deterministic, no I/O.
 * @param {{ name?: string|null, url?: string|null, sourceRole?: string|null }} source
 * @returns {{ value: string, confidence: "high", basis: string } | null}
 */
export function classifySourceJurisdiction({ url, sourceRole } = {}) {
  let host = "";
  try { host = new URL(String(url || "")).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* not a URL */ }
  if (!host) return null;

  // Intergovernmental bodies operate globally by the framework's own worked examples (IMO, ICAO, IEA,
  // World Bank) — "Global is a valid jurisdiction value, not 'no jurisdiction.'"
  if (sourceRole === "intergovernmental_body" || INTERGOVERNMENTAL_HOST.test(host)) {
    return {
      value: "GLOBAL",
      confidence: "high",
      basis: sourceRole === "intergovernmental_body" ? "source_role=intergovernmental_body" : "host is a .int treaty-organization domain",
    };
  }

  for (const [re, value] of GOV_HOST_JURISDICTION) {
    if (re.test(host)) {
      const proposed = { value, confidence: "high", basis: `host ${host} matches ${re}` };
      // Belt-and-braces: every entry in the table above is a vocab-valid token by construction, but
      // assert it so a future typo in the table fails loudly in the test rather than silently proposing
      // a free-text value.
      if (!isValidJurisdictionValue(proposed.value)) return null;
      return proposed;
    }
  }
  return null; // genuinely undeterminable from host alone — flagged for operator assignment, never guessed
}
