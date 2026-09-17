// F46: external-host-home (lane L31, 2026-09-17). The EUR-Lex route was written three times in fifteen
// days (2026-09-02 census exporter, 2026-09-13 capture step, 2026-09-17 lane L28), each a different
// implementation of the same request, so the clone scan F45 would have passed all three: F45 catches
// copied lines, not re-implementations. This gate measures the class the incident actually belongs to:
// an external host that code builds URLs for has ONE home module, and any second file that names the
// host is either the second home or reference data.
//
// WHAT IT MEASURES. Every URL literal (http or https) in scope is attributed to its host and its file.
// Reference data files (a licence table, the intake URL corpus, canonicalization examples, a series
// map) may cite any host: they describe URLs, they do not build requests. Every other file that names
// a host is a home for it. A host with more than one home is a multi-home host.
//
// TWO CHECKS. (1) HOMED hosts (HOST_HOMES below) are strict: the host may appear in exactly its named
// home and nowhere else in scope; a second file is a violation regardless of the ratchet. (2) The
// remaining multi-home count is a both-ways ratchet (F23's and F45's rule): above the ceiling fails
// (a host gained a home), below it fails naming the value to re-seed. Consolidating a host moves it
// into HOST_HOMES and re-seeds the ceiling down in the same commit; that is the only way the number
// moves.
//
// SCOPE. fsi-app/src/** and fsi-app/scripts/** (.mjs/.js/.ts/.tsx) minus tests and proofs, fixtures,
// _archive, scripts/harness-runs, scripts/_snapshots, .d.ts (the F45 scope). Comment lines are
// ignored (a comment citing a URL is documentation). Hosts that are the platform's own infrastructure
// or documentation (supabase, vercel, github, npm, w3 schemas, example domains, carosledge.com) are
// not external routes and are excluded by name below.
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { readFile } from '../lib/file-content.mjs';
import { SCOPE_GLOBS, inScope } from './F45-duplicate-code.mjs';

/** Files that cite URLs as data, never as a request they build. Named, never wildcarded. */
export const REFERENCE_FILES = new Set([
  'fsi-app/src/lib/contracts/source-licence.mjs', // licence terms per publisher host
  'fsi-app/src/lib/intake/intake-url-corpus.mjs', // the intake URL corpus (data)
  'fsi-app/src/lib/agent/url-canon.mjs', // canonicalization rules with per-host examples
  'fsi-app/src/lib/market/series-item-map.mjs', // series to item map citing the bulletin page
]);

/** Hosts that are NOT external routes: platform infrastructure, documentation, placeholders. */
export const NOT_EXTERNAL_RE = /(^|\.)(localhost|example\.com|example\.org|w3\.org|supabase\.co|supabase\.com|vercel\.com|vercel\.app|github\.com|githubusercontent\.com|npmjs\.com|nodejs\.org|carosledge\.com|anthropic\.com\/claude|claude\.com|react\.dev|nextjs\.org|schema\.org|json-schema\.org|purl\.org)$/i;

/** Consolidated hosts: exactly one home each. Add a host here in the commit that consolidates it. */
export const HOST_HOMES = {
  'publications.europa.eu': 'fsi-app/scripts/lib/eurlex-cellar.mjs',
  'www.federalregister.gov': 'fsi-app/src/lib/sources/transport-escalation.mjs', // lane L35
  'www.ecfr.gov': 'fsi-app/src/lib/sources/transport-escalation.mjs', // lane L35
  'api.anthropic.com': 'fsi-app/src/lib/agent/anthropic-stream.mjs', // lane L35
};

/** Committed ceiling: multi-home hosts outside HOST_HOMES on the tree this file ships on. Only re-seed DOWN. */
export const MULTI_HOME_CEILING = 4; // lane L35, 2026-09-17: federalregister.gov + ecfr.gov homed together
// (both hosts are served by the SAME api-transport.mjs / identifier-variants.mjs usCandidates edits, so
// this ceiling moved 7 -> 5 in one lane commit rather than two; eur-lex.europa.eu stayed at 7's worth of
// "still multi" because scripts/maintenance/capture-static-primaries.mjs is out of this lane's write set
// -- see docs/ops/session-log.md, lane L35.

const URL_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?(?=[/\s"'`<>)\]?#,]|$)/gi;

/** Pure: {path, content} entries to {host: Set(path)} for hosts named outside comments. */
export function hostsByFile(entries) {
  const out = new Map();
  for (const { path, content } of entries) {
    const p = String(path).replace(/\\/g, '/');
    const lines = String(content).replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*)/.test(l));
    for (const m of lines.join('\n').matchAll(URL_RE)) {
      const host = m[1].toLowerCase();
      if (NOT_EXTERNAL_RE.test(host)) continue;
      let set = out.get(host);
      if (!set) { set = new Set(); out.set(host, set); }
      set.add(p);
    }
  }
  return out;
}

/** Pure: the two checks over a host map. Returns {strict:[{host, home, extra:[]}], multi:[{host, files:[]}]}. */
export function evaluate(byHost, { homes = HOST_HOMES, reference = REFERENCE_FILES } = {}) {
  const strict = [];
  const multi = [];
  for (const [host, files] of byHost) {
    const homesOf = [...files].filter((f) => !reference.has(f)).sort();
    const home = homes[host];
    if (home) {
      const extra = homesOf.filter((f) => f !== home);
      if (extra.length) strict.push({ host, home, extra });
      continue;
    }
    if (homesOf.length > 1) multi.push({ host, files: homesOf });
  }
  multi.sort((a, b) => b.files.length - a.files.length || a.host.localeCompare(b.host));
  return { strict, multi };
}

export function scanTree() {
  const files = globFiles(SCOPE_GLOBS).filter(inScope);
  const entries = files.map((path) => ({ path, content: readFile(path) }));
  return { files: files.length, ...evaluate(hostsByFile(entries)) };
}

export const fitnessFunction = {
  id: 'F46',
  name: 'external-host-home',
  description:
    'An external host that code builds URLs for has one home module. Consolidated hosts (HOST_HOMES) may ' +
    'appear only in their home; the count of other hosts with more than one home must equal the committed ' +
    'ceiling (above: a host gained a home; below: re-seed the ceiling down in the same commit).',
  source: 'operator ruling 2026-09-17 (the EUR-Lex route written three times; "recurring doubling of work and code"); docs/audits/system-health-audit-2026-09-17.md section 2',

  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F46-external-host-home.mjs'];
  },

  check() {
    const r = scanTree();
    const out = [];
    for (const s of r.strict) {
      out.push(violation(1, `SECOND HOME for ${s.host}: its home is ${s.home}; also named in ${s.extra.join(', ')}. Import the home module; do not build the URL again.`));
    }
    const n = r.multi.length;
    const list = r.multi.map((m) => `${m.host} (${m.files.length}: ${m.files.map((f) => f.replace('fsi-app/', '')).join(', ')})`).join('; ');
    if (n > MULTI_HOME_CEILING) {
      out.push(violation(1, `REGRESSION: ${n} multi-home hosts, ceiling ${MULTI_HOME_CEILING}. A host gained a second home; import its existing module instead. ${list}`));
    } else if (n < MULTI_HOME_CEILING) {
      out.push(violation(1, `IMPROVEMENT: ${n} multi-home hosts, ceiling ${MULTI_HOME_CEILING}. Re-seed MULTI_HOME_CEILING to ${n} in this same commit (and add the consolidated host to HOST_HOMES).`));
    }
    return out;
  },
};
