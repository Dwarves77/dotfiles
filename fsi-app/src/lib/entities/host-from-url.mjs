// host-from-url.mjs, the entity spine's ONE host normalizer, split out of entity-id.mjs so a
// BROWSER bundle can import it.
//
// entity-id.mjs imports node:crypto at module top (it mints sha256-seeded ids); any client component
// that imported hostFromUrl from there dragged node:crypto into the browser bundle and failed the
// build. The function itself needs no crypto, so it lives here, still ONE definition, re-exported by
// entity-id.mjs so every existing `import { hostFromUrl } from ".../entity-id.mjs"` keeps working and
// F30's `url_host_derivation` ratchet still has exactly one sanctioned implementation to point at.
//
// PLAIN ESM, ZERO DEPENDENCIES, importable by a fitness function, a script, a server route or a
// client component.

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
