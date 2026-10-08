// rate-source-by-class.mjs, the shared "resolve, then rate, a candidate's source through the
// institution class table" step (CLAUDE.md rule 18: "get the source. then rate the source... tier from
// the institution class table, never hand-typed"). Extracted (lane ETS-PROXY, 2026-09-28, F45
// duplicate-code gate) from state-cost-facts-producer.mjs and carrier-ets-surcharge-producer.mjs, which
// each carried an identical resolveSource() shape differing only in field names, never a second, drifting
// copy of the same rating step. Callers map their own candidate's field names to {url, name} and get back
// the SAME ok/tier/refusal contract both producers already relied on.
//
// PLAIN ESM. No I/O of its own beyond the injected `registerSourceFn` (a real DB write in "apply" mode
// only; "dry"/anything else previews with a deterministic `preview:<host>` id, never touching the DB).

import { hostOf } from "../../src/lib/sources/institution.ts";
import { classTierForHostWithVerdicts } from "../../src/lib/sources/host-authority.ts";
import { loadHostVerdicts } from "../maintenance/host-verdicts/load-host-verdicts.mjs";

// The committed host verdict batches, loaded once per process. A caller (a test, a dry fixture run) may pass its
// own `hostVerdicts` map instead. Lane S8-E5 (2026-10-08): the rating step reads verdicts through the ONE shared
// precedence in host-authority.ts (classTierForHostWithVerdicts), so a host with a verdict rates by the verdict
// whatever its stored name, instead of every producer special-casing its own verdict lookup.
let committedVerdicts = null;
function committedHostVerdicts() {
  if (committedVerdicts === null) committedVerdicts = loadHostVerdicts().verdicts;
  return committedVerdicts;
}

/**
 * @param {{url: string, name?: string|null}} candidate
 * @param {{
 *   mode: "dry"|"apply",
 *   registerSourceFn: (source: {url:string, name:string, base_tier:number}, opts: {cite: object}) => Promise<{source_id:string, source_key?:string|null}>,
 *   cite: object,
 *   sourceKeyFor?: (host: string) => string,
 *   hostVerdicts?: ReadonlyMap<string, object>,   // default: the committed host verdict batches
 * }} opts
 * @returns {Promise<
 *   | {ok: true, source_id: string, source_key: string|null, tier: number}
 *   | {ok: false, reason: string}
 * >}
 */
export async function rateSourceByInstitutionClass({ url, name }, { mode, registerSourceFn, cite, sourceKeyFor, hostVerdicts }) {
  const host = hostOf(url);
  if (!host) return { ok: false, reason: `cannot parse a host from url ${JSON.stringify(url)}` };

  const tier = classTierForHostWithVerdicts(host, name == null ? [] : [name], hostVerdicts ?? committedHostVerdicts());
  if (tier == null) {
    return {
      ok: false,
      reason: `host "${host}" is not classified by the institution class table (no built-in rule, committed host verdict or residue ruling placed it), ` +
        "needs registry review before this figure can publish with a rating (rule 18: rate it, do not guess)",
    };
  }

  if (mode !== "apply") {
    // Preview: no DB write. A deterministic preview id so a dry/fixture run's output is stable.
    return { ok: true, source_id: `preview:${host}`, source_key: sourceKeyFor ? sourceKeyFor(host) : null, tier };
  }

  const reg = await registerSourceFn({ url, name: name ?? host, base_tier: tier }, { cite });
  return { ok: true, source_id: reg.source_id, source_key: reg.source_key ?? (sourceKeyFor ? sourceKeyFor(host) : null), tier };
}

/**
 * Factory: builds a producer's own `resolveSource(candidate, { mode, registerSourceFn })` function,
 * closing over that producer's field-name mapping and cite/sourceKeyFor config. Coordinator directive
 * (2026-09-28, F45 follow-up): the two callers' own `resolveSource` bodies were themselves an
 * identical-shape wrapper (signature, one delegate call, closing brace), this factory removes that last
 * duplication by making config, not a hand-written function body, the only per-producer artifact.
 *
 * @param {{
 *   urlField: string, nameField: string, cite: object, sourceKeyFor?: (host: string) => string,
 * }} config
 * @returns {(candidate: object, opts: {mode: "dry"|"apply", registerSourceFn: Function}) => Promise<object>}
 */
export function makeResolveSource({ urlField, nameField, cite, sourceKeyFor }) {
  return function resolveSource(candidate, { mode, registerSourceFn, hostVerdicts }) {
    return rateSourceByInstitutionClass(
      { url: candidate[urlField], name: candidate[nameField] },
      { mode, registerSourceFn, cite, sourceKeyFor, hostVerdicts },
    );
  };
}
