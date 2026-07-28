// Coverage-index identity verification (B1). A catalogued census entry is a POINTER to a primary
// instrument (a URL + often a structured identifier). "Identity-verified" means the pointer is
// well-formed and resolves to a real primary source — NOT that the instrument has a grounded brief
// (that is the separate provenance gate). This module owns the DETERMINISTIC half: URL shape + the
// instrument-identifier scheme/shape. The live-resolve half (does the URL return 200 on a registered
// host) is the runner's job (identity-resolve pass), because it needs network + the sources registry.
//
// No guessing, no fallback that INVENTS validity: an unrecognized identifier is scheme:'generic'
// with shapeValid:false (worklist), never silently treated as valid. Pure + deterministic.

/** Parse a URL string → {ok, https, host}. ok requires a parseable absolute http(s) URL. */
export function parseInstrumentUrl(url) {
  const s = String(url || "").trim();
  if (!s) return { ok: false, https: false, host: null };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, https: false, host: null };
  }
  const https = u.protocol === "https:";
  const http = u.protocol === "http:" || https;
  return { ok: http, https, host: http ? u.hostname.toLowerCase().replace(/^www\./, "") : null };
}

// CELEX (EUR-Lex): {sector}{year:4}{descriptor:1-2 alpha}{number} with optional corrigendum suffix.
// Sectors include digits 0-9 plus C (OJ C-series) and E (EFTA). e.g. 32011L0037, 32019R1242, 32023R1115.
const CELEX_RE = /^[0-9CE]\d{4}[A-Z]{1,2}\d{2,4}(?:\(\d{2}\))?$/;
// ELI path fragment: eli/{type}/{year}/{number}[/oj]. e.g. eli/reg/2019/1242/oj.
const ELI_RE = /\beli\/[a-z_]+\/\d{4}\/[0-9a-z_-]+/i;
// UK legislation: {type} {year} {number}, type is a legislation.gov.uk series code (uksi, ukpga, ssi…).
// Accepts an optional leading "UK " and space-or-slash separators. e.g. "UK uksi 2021/1095".
const UK_TYPES = new Set([
  "uksi", "ukpga", "ukla", "ukcm", "ukmo", "asp", "asc", "anaw", "mwa", "nia", "nisr",
  "ssi", "wsi", "apni", "aosp", "aep", "gbla", "mnia", "apgb", "aip",
]);

/** Classify an instrument identifier → {scheme, shapeValid, normalized}. scheme is one of
 *  'celex' | 'eli' | 'uk-legislation' | 'generic' | 'none'. shapeValid is true ONLY for a
 *  recognized scheme whose shape checks out; 'generic' (a non-empty but unrecognized id) and
 *  'none' (empty) are shapeValid:false → they fall to URL-only identity. */
export function classifyIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return { scheme: "none", shapeValid: false, normalized: "" };

  const compact = raw.replace(/\s+/g, "");
  if (CELEX_RE.test(compact)) return { scheme: "celex", shapeValid: true, normalized: compact };
  if (ELI_RE.test(raw)) return { scheme: "eli", shapeValid: true, normalized: raw.toLowerCase() };

  // UK legislation: strip an optional leading "uk " label, split on space/slash.
  const uk = raw.toLowerCase().replace(/^uk[\s/]+/, "");
  const m = uk.match(/^([a-z]+)[\s/]+(\d{4})[\s/]+(\d+)$/);
  if (m && UK_TYPES.has(m[1])) {
    return { scheme: "uk-legislation", shapeValid: true, normalized: `${m[1]}/${m[2]}/${m[3]}` };
  }

  return { scheme: "generic", shapeValid: false, normalized: raw };
}

/** Deterministic identity verdict (the offline half). identityValid requires a well-formed URL AND
 *  either a shape-valid structured identifier OR (identifier absent) the URL alone — the URL is the
 *  minimum pointer. The runner ANDs this with host-on-registered-source + a live 200 to reach the
 *  full "identity-verified" state; this half never asserts liveness. */
export function deterministicIdentity(identifier, url) {
  const u = parseInstrumentUrl(url);
  const id = classifyIdentifier(identifier);
  return {
    urlOk: u.ok,
    https: u.https,
    host: u.host,
    scheme: id.scheme,
    identifierShapeValid: id.shapeValid,
    normalizedIdentifier: id.normalized,
    // offline verdict: the pointer is well-formed. A shape-valid id strengthens it; url-only is still
    // a valid pointer (many feed entries carry no structured id). urlOk is the hard requirement.
    pointerWellFormed: u.ok,
  };
}
