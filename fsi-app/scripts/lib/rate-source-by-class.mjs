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
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";

/**
 * @param {{url: string, name?: string|null}} candidate
 * @param {{
 *   mode: "dry"|"apply",
 *   registerSourceFn: (source: {url:string, name:string, base_tier:number}, opts: {cite: object}) => Promise<{source_id:string, source_key?:string|null}>,
 *   cite: object,
 *   sourceKeyFor?: (host: string) => string,
 * }} opts
 * @returns {Promise<
 *   | {ok: true, source_id: string, source_key: string|null, tier: number}
 *   | {ok: false, reason: string}
 * >}
 */
export async function rateSourceByInstitutionClass({ url, name }, { mode, registerSourceFn, cite, sourceKeyFor }) {
  const host = hostOf(url);
  if (!host) return { ok: false, reason: `cannot parse a host from url ${JSON.stringify(url)}` };

  const tier = classTierForHost(host, name ?? null);
  if (tier == null) {
    return {
      ok: false,
      reason: `host "${host}" is not classified by the institution class table (classTierForHost returned null), ` +
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
