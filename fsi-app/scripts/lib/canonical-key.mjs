/** ONE JS mirror of public.derive_canonical_instrument_key() — migration 255 logic. GOVERNING: remediation-discipline.
 *
 *  Before this file there were TWO hand-copied JS mirrors (canonical-key-uniqueness.mjs and
 *  backfill-canonical-keys.mjs), both still on migration 200's derivation after migration 255 fixed the SQL
 *  at the root — the exact two-homes drift the doctrine forbids. The stale mirrors discarded the OJ
 *  sequence suffix '(NN)', so the lane's first real canonical-key-uniqueness run (#66, 2026-08-11) derived
 *  six FALSE collision groups out of instruments that are legitimately distinct: 22008A0221(01) and
 *  22008A0221(02) are DIFFERENT agreements sharing a CELEX stem. Now both consumers import THIS mirror, and
 *  canonical-key.selftest.mjs pins it to migration 255's own self-check vectors — if the SQL and JS ever
 *  diverge again, the divergence is a red test, not a silent false collision.
 *
 *  Derivation (must stay byte-equivalent to migration 255):
 *   (1) CELEX token in instrument_identifier, suffixed form first — returns 'CELEXKEY(NN)' zero-padded;
 *   (2) ELI relative path in instrument_identifier;
 *   (3) CELEX token in source_url (':' or '%3A' after CELEX; parens literal or %28/%29), suffixed first;
 *   (4) ELI path in source_url. NULL when nothing matches. */
const ELI_MAP = { reg: "R", dir: "L", dec: "D" };

export function deriveKey(instr, src) {
  const i = instr || "";
  const u = src || "";
  let m;
  // (1) CELEX in instrument_identifier — WITH optional OJ sequence suffix '(NN)' (migration 255)
  m = i.match(/([1-9]\d{4}[A-Z]\d{4})\((\d{1,2})\)/);
  if (m) return m[1].toUpperCase() + "(" + m[2].padStart(2, "0") + ")";
  m = i.match(/([1-9]\d{4}[A-Z]\d{4})/);
  if (m) return m[1].toUpperCase();
  // (2) ELI path in instrument_identifier
  m = i.match(/^eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/);
  if (m) return "3" + m[2] + ELI_MAP[m[1]] + m[3].padStart(4, "0");
  // (3) CELEX in source_url — parens may be literal or URL-encoded %28/%29 (migration 255)
  m = u.match(/CELEX(?::|%3[Aa])?([1-9]\d{4}[A-Z]\d{4})(?:\(|%28)(\d{1,2})(?:\)|%29)/);
  if (m) return m[1].toUpperCase() + "(" + m[2].padStart(2, "0") + ")";
  m = u.match(/CELEX(?::|%3[Aa])?([1-9]\d{4}[A-Z]\d{4})/);
  if (m) return m[1].toUpperCase();
  // (4) ELI path in source_url
  m = u.match(/\/eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/);
  if (m) return "3" + m[2] + ELI_MAP[m[1]] + m[3].padStart(4, "0");
  return null;
}
