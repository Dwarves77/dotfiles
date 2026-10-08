// F16: transport hold gate. Every content fetch MUST route through the single canonical primitive
// (src/lib/sources/canonical-fetch.mjs::browserlessFetch), and that primitive MUST carry the scrape-hold gate
// (assertFetchAllowed from fetch-hold.mjs) so "scrape hold LIVE, zero fetches" is MECHANICAL — the fetch throws
// FetchHoldError while engaged, rather than silently failing as a "key not configured" error. Two guarantees:
//   (1) the primitive contains assertFetchAllowed( — the hold gate is wired at the fetch primitive; and
//   (2) no OTHER file constructs a raw Browserless content fetch (which would bypass the gate — the "single
//       home" guarantee the primitive's own docstring claims). Source: transport-unit dispatch (2026-07-06).

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { views, overrideLines, lineOfIndex } from '../lib/code-scan.mjs';
import { foldStringConcat } from '../../governance/coverage-scan.mjs';

export const PRIMITIVE = 'fsi-app/src/lib/sources/canonical-fetch.mjs';
export const HOLD_GATE_CORE = 'fsi-app/src/lib/sources/fetch-hold.mjs';
// The gate call the primitive MUST contain. Lane GATE-8 (2026-10-08, AUD-AT-4 B1-37, B1-38): it must be CODE. A
// comment that names the call, or a string literal that holds its text, is not the gate.
export const GATE_CALL_RE = /assertFetchAllowed\s*\(/;
export const hasGateCall = (content) => GATE_CALL_RE.test(views(content).code);
// A raw Browserless content endpoint (the bypass shape) — the /content render URL or the base host.
// B1-33 and B1-35 (lane GATE-8): a host split over a concatenation is read folded, and the endpoint variables a
// websocket or puppeteer connect reads (BROWSERLESS_WS, BROWSERLESS_ENDPOINT, a browserWSEndpoint option) are the
// same bypass with no host literal in the file.
export const RAW_BROWSERLESS_RE = /(chrome|production-[a-z0-9]+)\.browserless\.io|browserless[^\n"'`]{0,40}\/content|BROWSERLESS_BASE_URL|BROWSERLESS_[A-Z_]*(?:WS|ENDPOINT|URL)\b|browserWSEndpoint/;

// TRANSPORT MODULES (C5, 2026-07-11; widened 2026-08-11): every canonical fetch entry point beyond the
// Browserless primitive — direct-HTTP, API, and admin-triggered manual fetch. Each MUST carry the
// scrape-hold gate (assertFetchAllowed) so "hold LIVE, zero fetches" is airtight across every live
// transport, not only Browserless (CODE-1 F-02, invariant RD-15). A transport module missing the gate
// FAILS this gate. canonical-pipeline.ts holds the direct-HTTP + API-ladder transports (directFetchClean /
// apiFetchForHost); the sources/ modules are the access_method transports.
// (The RSS transport rss-fetch.ts was purged 2026-07-18 (dormant-systems P-5, dead code) and removed here.)
// Widened 2026-08-11 (master gap register P1 #10 residual): fetch-now/route.ts carries its OWN inline
// fetchViaApi helper (mirrored the now-deleted api-fetch.ts's shape but is a separate function) making a
// raw fetch() with no gate — an admin manual-fetch click bypassed an engaged hold that every other
// transport honored.
// 'fsi-app/src/lib/sources/api-fetch.ts' REMOVED (lane DEAD-EXEC, 2026-09-04): the module was deleted —
// superseded by canonical-pipeline.ts's own inline apiFetchForHost (already below, already gated), never
// wired to anything (disposition register docs/plans/unwired-disposition-2026-08-31.md #12). Its live
// API-transport hold-gate coverage is unaffected: apiFetchForHost is the transport that actually runs.
export const TRANSPORT_MODULES = [
  'fsi-app/src/lib/agent/canonical-pipeline.ts',
  'fsi-app/src/app/api/admin/sources/[id]/fetch-now/route.ts',
];

// Files ALLOWED to reference the raw endpoint: the primitive itself (it IS the single home) + the hold-gate core.
export const SANCTIONED = new Set([PRIMITIVE, HOLD_GATE_CORE]);

/** Lines making a raw Browserless content fetch, skipping comments + overrides. @param {string} content */
export function rawBrowserlessLines(content) {
  const overridden = overrideLines(content, 'F16');
  const folded = foldStringConcat(views(content).text);
  const out = new Set();
  const re = new RegExp(RAW_BROWSERLESS_RE.source, 'g');
  let m;
  while ((m = re.exec(folded))) {
    const ln = lineOfIndex(folded, m.index);
    if (!overridden.has(ln)) out.add(ln);
  }
  return [...out].sort((a, b) => a - b);
}

export const fitnessFunction = {
  id: 'F16',
  name: 'transport-hold-gate',
  description: 'The single fetch primitive carries the scrape-hold gate (assertFetchAllowed); no other file constructs a raw Browserless content fetch that would bypass it.',
  source: 'transport-unit dispatch (2026-07-06)',

  // Matches F15's scope. Lane GATE-8 (AUD-AT-4 B1-36) widened it from the production fetch path alone: a raw
  // Browserless call in a script bypasses the hold gate the same way a route does, and the runner-level
  // BROWSERLESS_API_KEY deletion is not a substitute for a gate that fails the build.
  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx,mjs,js,cjs,jsx}', 'fsi-app/scripts/**/*.{mjs,js,cjs,ts}'])
      .filter((p) => !/\.(test|selftest|npmtest|golden)\.(ts|tsx|mjs|js|cjs)$/.test(p) && !p.includes('/__tests__/'));
  },

  check(filepath, content) {
    if (filepath === PRIMITIVE) {
      // the primitive MUST carry the hold gate
      return hasGateCall(content) ? [] : [violation(1,
        `The canonical fetch primitive is missing the scrape-hold gate. Call assertFetchAllowed(url) from fetch-hold.mjs at the top of browserlessFetch so every fetch is gated by the scrape hold (item 6).`)];
    }
    // TRANSPORT-MODULE HOLD GATE (C5): every transport module MUST carry assertFetchAllowed.
    if (TRANSPORT_MODULES.includes(filepath)) {
      const out = hasGateCall(content) ? [] : [violation(1,
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
