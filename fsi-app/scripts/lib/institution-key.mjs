export function hostOf(u) {
  try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

// SHARED GOVERNMENT PORTALS — one host serves MANY distinct institutions, differentiated by a path
// prefix (gob.mx/semarnat vs gob.mx/economia; gov.si/.../ministrstvo-za-okolje vs .../ministrstvo-za-finance).
// Bare-host dedup COLLAPSES them into one row. For these hosts the institution key is host + the first
// `keyDepth` path segments; keyDepth is per-host because the institution slug sits at different depths
// (/mma vs /web/gios vs /drzavni-organi/ministrstva/<ministry>). Every other host keys on bare host, so
// this is backward-compatible for the ~non-portal majority. A caller may pass source.institutionKey to
// override. NOTE (SI!=SK): keys are host-rooted, so gov.si and *.sk are never adjacent — a different
// jurisdiction can never collapse into another (the Slovenia/Slovakia near-miss stays distinct by design).
export const SHARED_PORTAL_KEYDEPTH = Object.freeze({
  "gob.mx": 1, "gov.br": 1, "portal.ct.gov": 1, "nj.gov": 1, "oregon.gov": 1, "maine.gov": 1,
  "gov.pl": 2, "nyc.gov": 2, "u.ae": 2, "bundesregierung.de": 2, "gov.si": 3,
});

/** The registry identity of a URL: bare host, or host + path prefix on a shared portal. "" when unparseable. */
export function institutionKey(url) {
  const host = hostOf(url);
  if (!host) return "";
  const depth = SHARED_PORTAL_KEYDEPTH[host];
  if (!depth) return host;
  let path = "";
  try { path = new URL(url).pathname; } catch { path = ""; }
  const segs = path.split("/").filter(Boolean).slice(0, depth);
  return segs.length ? `${host}/${segs.join("/")}` : host;
}

// LANE HELD (2026-09-02, export-census-rows.mjs's `identity_unmapped_source` fix): a held census row's
// document_url and its own row's registered `sources.url` are confirmed the SAME institution by comparing
// their institutionKey()s -- the exact operation this file's own consumers (registerSource's dedup, the
// mint validator's tier mirror) already perform inline. Pulled out here, once, so a third caller never
// hand-rolls the comparison a fourth way. `institutionKey("")` intentionally returns "" (unparseable), so
// two unparseable URLs would otherwise "match" on the empty string -- `sameInstitution` guards that case
// explicitly rather than letting a bad row silently pass as institution-confirmed.
//
// Every one of the 2026-09-02 `identity_unmapped_source` evidence hosts (sdir.no, climate.ec.europa.eu,
// rules.cityofnewyork.us, www.mlit.go.jp, participate.melbourne.vic.gov.au, epa.nsw.gov.au, chp.ca.gov —
// scripts/_snapshots/population-{33659080799,33666187388,33678399902}/census-rows.held.json) is a
// single-institution host: either a dedicated subdomain per agency (chp.ca.gov, sdir.no — California and
// Norway both differentiate by subdomain, which hostOf() already keys on distinctly, needing no portal
// entry) or a DG-specific EU subdomain (climate.ec.europa.eu is already scoped to one Commission
// directorate, unlike the shared "europa.eu" root). None of the seven exhibits a genuine multi-institution
// SHARED_PORTAL_KEYDEPTH shape the way gob.mx or nj.gov do (one host, many agencies differentiated only by
// a path prefix) — checked against every document_url in the three snapshots above, confirmed by
// institution-key.test.mjs's `sameInstitution` coverage for each host, and left OUT of
// SHARED_PORTAL_KEYDEPTH rather than added speculatively. The map stays exactly what its own header says:
// extend it the moment real evidence (two distinct institutions colliding under one bare host) shows up.
export function sameInstitution(a, b) {
  const ka = institutionKey(a);
  const kb = institutionKey(b);
  return !!ka && ka === kb;
}
