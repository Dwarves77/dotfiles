// src/lib/sources/institution.ts
//
// THE SINGLE canonical resolver (source-credibility-model, Phase 0'). ONE implementation consumed by
// BOTH the pipeline stamp path (groundBrief / the backfill) AND the claims-tier data-audit, so the
// invariant certifies the SAME resolver production runs (no F1-sibling drift). The mjs callers import
// this .ts via jiti; groundBrief imports it natively.
//
// Tier is a property of the INSTITUTION, not a row. Grouping key = registrable domain (eTLD+1) with
// documented super-domain exceptions where a shared government domain hosts distinct bodies
// (europa.eu subdomains; legislation.gov.uk vs gov.uk). A span resolves to the canonical institutional
// tier of the source CONTAINING ITS SPAN: a deliberate per-row tier_override (exact host) wins; else
// the institution's canonical base_tier; else NULL (unregistered host).

const TWO_LEVEL = new Set<string>([
  "co.uk","gov.uk","ac.uk","org.uk","com.br","gov.br","org.br","co.jp","go.jp","or.jp","ne.jp",
  "gov.cn","com.cn","edu.cn","org.cn","gov.au","com.au","edu.au","org.au","gov.in","co.in","org.in",
  "nic.in","gov.sg","com.sg","go.kr","or.kr","re.kr","gob.mx","gov.co","gob.cl","gc.ca","go.id","gov.za","gov.hk",
  // shared government super-domains: the SUBDOMAIN is the institution (documented exceptions)
  "europa.eu","canada.ca","ca.gov","ny.gov","tx.us","state.tx.us","wa.gov","or.us","ne.gov","nj.gov",
  "pa.gov","mass.gov","oregon.gov","nc.gov","ct.gov",
]);

export function hostOf(u: string | null | undefined): string {
  try { return new URL(String(u)).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

/** registrable domain (eTLD+1) with super-domain exceptions = the institution key. */
export function hostInstitution(host: string): string {
  if (!host) return "";
  const h = host.replace(/^www\./, "").toLowerCase();
  const p = h.split(".");
  if (p.length <= 2) return h;
  const lastTwo = p.slice(-2).join(".");
  return TWO_LEVEL.has(lastTwo) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

export interface SourceRow {
  id: string;
  url: string;
  base_tier: number | null;
  effective_tier?: number | null;
  tier_override?: number | null;
}

/** canonical institutional tier = base_tier (consistent per institution post-Phase 0'). */
export const tierOfSource = (s: SourceRow | null | undefined): number | null =>
  s == null ? null : (s.base_tier ?? s.effective_tier ?? null);

export interface SpanResolution { tier: number | null; sourceId: string | null }
export interface Resolver { resolveSpan(resultUrl: string): SpanResolution }

/** Build the resolver from the sources registry rows (pass ALL sources — paginate the read). */
export function buildResolver(sources: SourceRow[]): Resolver {
  const instTier = new Map<string, number>();
  const instSourceId = new Map<string, string>();
  const overrideTierByHost = new Map<string, number>();
  const overrideSourceByHost = new Map<string, string>();
  for (const s of sources) {
    const h = hostOf(s.url);
    const k = hostInstitution(h);
    if (!k) continue;
    if (s.tier_override != null) { overrideTierByHost.set(h, s.tier_override); overrideSourceByHost.set(h, s.id); }
    if (!instTier.has(k)) { const t = tierOfSource(s); if (t != null) { instTier.set(k, t); instSourceId.set(k, s.id); } }
  }
  return {
    resolveSpan(resultUrl: string): SpanResolution {
      const h = hostOf(resultUrl);
      if (!h) return { tier: null, sourceId: null };
      if (overrideTierByHost.has(h)) return { tier: overrideTierByHost.get(h)!, sourceId: overrideSourceByHost.get(h) ?? null };
      const k = hostInstitution(h);
      return instTier.has(k) ? { tier: instTier.get(k)!, sourceId: instSourceId.get(k) ?? null } : { tier: null, sourceId: null };
    },
  };
}
