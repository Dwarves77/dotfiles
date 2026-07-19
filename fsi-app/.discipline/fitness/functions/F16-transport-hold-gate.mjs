// F16: transport hold gate. Every content fetch MUST route through the single canonical primitive
// (src/lib/sources/canonical-fetch.mjs::browserlessFetch), and that primitive MUST carry the scrape-hold gate
// (assertFetchAllowed from fetch-hold.mjs) so "scrape hold LIVE, zero fetches" is MECHANICAL — the fetch throws
// FetchHoldError while engaged, rather than silently failing as a "key not configured" error. Two guarantees:
//   (1) the primitive contains assertFetchAllowed( — the hold gate is wired at the fetch primitive; and
//   (2) no OTHER file constructs a raw Browserless content fetch (which would bypass the gate — the "single
//       home" guarantee the primitive's own docstring claims). Source: transport-unit dispatch (2026-07-06).

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

export const PRIMITIVE = 'fsi-app/src/lib/sources/canonical-fetch.mjs';
export const HOLD_GATE_CORE = 'fsi-app/src/lib/sources/fetch-hold.mjs';
// The gate call the primitive MUST contain.
export const GATE_CALL_RE = /assertFetchAllowed\s*\(/;
// A raw Browserless content endpoint (the bypass shape) — the /content render URL or the base host.
export const RAW_BROWSERLESS_RE = /(chrome|production-[a-z0-9]+)\.browserless\.io|browserless[^\n"'`]{0,40}\/content|BROWSERLESS_BASE_URL/;

// TRANSPORT MODULES (C5, 2026-07-11): every canonical fetch entry point beyond the Browserless primitive —
// direct-HTTP, API. Each MUST carry the scrape-hold gate (assertFetchAllowed) so "hold LIVE, zero
// fetches" is airtight across every live transport, not only Browserless (CODE-1 F-02, invariant RD-15). A
// transport module missing the gate FAILS this gate. canonical-pipeline.ts holds the direct-HTTP + API-ladder
// transports (directFetchClean / apiFetchForHost); the sources/ modules are the access_method transports.
// (The RSS transport rss-fetch.ts was purged 2026-07-18 (dormant-systems P-5, dead code) and removed here.)
export const TRANSPORT_MODULES = [
  'fsi-app/src/lib/sources/api-fetch.ts',
  'fsi-app/src/lib/agent/canonical-pipeline.ts',
];

// Files ALLOWED to reference the raw endpoint: the primitive itself (it IS the single home) + the hold-gate core.
export const SANCTIONED = new Set([PRIMITIVE, HOLD_GATE_CORE]);

/** Lines making a raw Browserless content fetch, skipping comments + overrides. @param {string} content */
export function rawBrowserlessLines(content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || t.startsWith('*')) continue;
    if (RAW_BROWSERLESS_RE.test(lines[i]) && !isOverridden(lines[i], 'F16')) out.push(i + 1);
  }
  return out;
}

export const fitnessFunction = {
  id: 'F16',
  name: 'transport-hold-gate',
  description: 'The single fetch primitive carries the scrape-hold gate (assertFetchAllowed); no other file constructs a raw Browserless content fetch that would bypass it.',
  source: 'transport-unit dispatch (2026-07-06)',

  // Production fetch path only (matches F15) — one-off scripts are not the production fetch path and are held
  // by the runner-level BROWSERLESS_API_KEY deletion, not this gate.
  enumerate() {
    return globFiles(['fsi-app/src/lib/**/*.{ts,mjs}', 'fsi-app/src/app/api/**/*.ts']);
  },

  check(filepath, content) {
    if (filepath === PRIMITIVE) {
      // the primitive MUST carry the hold gate
      return GATE_CALL_RE.test(content) ? [] : [violation(1,
        `The canonical fetch primitive is missing the scrape-hold gate. Call assertFetchAllowed(url) from fetch-hold.mjs at the top of browserlessFetch so every fetch is gated by the scrape hold (item 6).`)];
    }
    // TRANSPORT-MODULE HOLD GATE (C5): every transport module MUST carry assertFetchAllowed.
    if (TRANSPORT_MODULES.includes(filepath)) {
      const out = GATE_CALL_RE.test(content) ? [] : [violation(1,
        `Transport module ${filepath} is missing the scrape-hold gate. Call assertFetchAllowed(url) at the top of its fetch entry point so the hold gates every live transport (direct-HTTP / API / Browserless), not only Browserless (C5, invariant RD-15).`)];
      // a transport module may reference the raw endpoint only if sanctioned; canonical-pipeline routes render
      // through browserlessFetch, so it must not construct a raw Browserless fetch either.
      if (!SANCTIONED.has(filepath)) out.push(...rawBrowserlessLines(content).map((ln) => violation(ln,
        `Raw Browserless content fetch outside the single canonical primitive (${PRIMITIVE}) — it bypasses the transport hold gate. Route the fetch through browserlessFetch. Override (single line): \`// fitness-allow: F16 (reason)\`.`)));
      return out;
    }
    if (SANCTIONED.has(filepath)) return [];
    // no other file may construct a raw Browserless content fetch (that bypasses the gate)
    return rawBrowserlessLines(content).map((ln) => violation(ln,
      `Raw Browserless content fetch outside the single canonical primitive (${PRIMITIVE}) — it bypasses the transport hold gate. Route the fetch through browserlessFetch/transportFetch. Override (single line): \`// fitness-allow: F16 (reason)\`.`));
  },
};
