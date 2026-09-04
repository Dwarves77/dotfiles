"use client";

/**
 * CoverageCatalogueView — the dual-verified catalogue, ADMIN-ONLY (operator ruling 2026-07-29). Lives as
 * the Coverage → Catalogue tab in /admin, behind the platform-admin gate. The census would_mint set with
 * human-readable titles, jurisdiction, instrument type, relevance (firm/soft) and identity (resolves)
 * axes, sort/filter. Fetches the admin-gated /api/coverage/entries with the operator's bearer token; no
 * customer surface carries any of this. Promotion controls (the P2 engine) mount here alongside.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { formatNumber } from "@/lib/format";
import type { CoverageEntry, IdentityState } from "@/lib/coverage/index-data";

const SURFACES = [
  { key: "", label: "All surfaces" },
  { key: "regulations", label: "Regulations" },
  { key: "operations", label: "Operations" },
  { key: "market_intel", label: "Market Intel" },
  { key: "research", label: "Research" },
] as const;

const IDENTITY_META: Record<IdentityState, { label: string; color: string }> = {
  verified: { label: "Resolves", color: "var(--color-success)" },
  pending: { label: "Check pending", color: "var(--color-text-muted)" },
  unresolved: { label: "Unconfirmed", color: "var(--brass)" },
  dead: { label: "Not reachable", color: "var(--color-error)" },
};
const SCHEME_LABEL: Record<string, string> = { celex: "CELEX", eli: "ELI", "uk-legislation": "UK-SI", generic: "ref", none: "URL" };
const DISPLAY_CAP = 200;
const selStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--color-border-subtle)", background: "var(--color-bg-surface)", color: "var(--color-text-secondary)" };

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, color: color ?? "var(--color-text-secondary)", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", whiteSpace: "nowrap" }}>{children}</span>;
}

type SortKey = "relevance" | "title" | "jurisdiction" | "type" | "identity";

export function CoverageCatalogueView() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [surface, setSurface] = useState<string>("");
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fJuris, setFJuris] = useState("");
  const [fType, setFType] = useState("");
  const [fRel, setFRel] = useState("");
  const [fIdent, setFIdent] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const qs = surface ? `?surface=${encodeURIComponent(surface)}` : "";
      const res = await fetch(`/api/coverage/entries${qs}`, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      setEntries(body.entries as CoverageEntry[]);
    } catch (e) {
      setErr(`Could not load the catalogue (${e instanceof Error ? e.message : "error"}).`);
      setEntries([]);
    } finally { setLoading(false); }
  }, [supabase, surface]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    total: entries.length,
    firm: entries.filter((e) => e.relevance === "firm").length,
    soft: entries.filter((e) => e.relevance === "soft").length,
    resolves: entries.filter((e) => e.identity === "verified").length,
    dualVerified: entries.filter((e) => e.relevance === "firm" && e.identity === "verified").length,
  }), [entries]);

  const jurisdictions = useMemo(() => [...new Set(entries.map((e) => e.jurisdiction).filter(Boolean))].sort() as string[], [entries]);
  const types = useMemo(() => [...new Set(entries.map((e) => e.instrumentType).filter(Boolean))].sort() as string[], [entries]);

  const view = useMemo(() => {
    const v = entries.filter((e) =>
      (!fJuris || e.jurisdiction === fJuris) && (!fType || e.instrumentType === fType) &&
      (!fRel || e.relevance === fRel) && (!fIdent || e.identity === fIdent));
    const idRank: Record<IdentityState, number> = { verified: 0, pending: 1, unresolved: 2, dead: 3 };
    const cmp: Record<SortKey, (a: CoverageEntry, b: CoverageEntry) => number> = {
      relevance: (a, b) => (a.relevance !== b.relevance ? (a.relevance === "firm" ? -1 : 1) : idRank[a.identity] - idRank[b.identity]),
      title: (a, b) => a.displayTitle.localeCompare(b.displayTitle),
      jurisdiction: (a, b) => (a.jurisdiction || "~").localeCompare(b.jurisdiction || "~"),
      type: (a, b) => (a.instrumentType || "~").localeCompare(b.instrumentType || "~"),
      identity: (a, b) => idRank[a.identity] - idRank[b.identity],
    };
    return [...v].sort(cmp[sort]);
  }, [entries, fJuris, fType, fRel, fIdent, sort]);

  return (
    <div style={{ padding: "4px 2px 24px" }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, fontSize: 13, color: "var(--color-text-secondary)" }}>
        <span><b style={{ color: "var(--accent-blue)" }}>{formatNumber(counts.dualVerified)}</b> dual-verified</span>
        <span><b>{formatNumber(counts.total)}</b> catalogued</span>
        <span>firm {formatNumber(counts.firm)} · soft {formatNumber(counts.soft)}</span>
        <span><b style={{ color: "var(--color-success)" }}>{formatNumber(counts.resolves)}</b> resolve</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select style={selStyle} value={surface} onChange={(e) => setSurface(e.target.value)} aria-label="Surface">
          {SURFACES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select style={selStyle} value={fJuris} onChange={(e) => setFJuris(e.target.value)} aria-label="Jurisdiction">
          <option value="">All jurisdictions</option>{jurisdictions.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
        <select style={selStyle} value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Type">
          <option value="">All types</option>{types.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <select style={selStyle} value={fRel} onChange={(e) => setFRel(e.target.value)} aria-label="Relevance">
          <option value="">Firm + soft</option><option value="firm">Firm-core</option><option value="soft">Soft-tail</option>
        </select>
        <select style={selStyle} value={fIdent} onChange={(e) => setFIdent(e.target.value)} aria-label="Identity">
          <option value="">Any identity</option><option value="verified">Resolves</option><option value="unresolved">Unconfirmed</option><option value="dead">Not reachable</option><option value="pending">Check pending</option>
        </select>
        <select style={selStyle} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
          <option value="relevance">Sort: relevance</option><option value="title">Sort: title</option><option value="jurisdiction">Sort: jurisdiction</option><option value="type">Sort: type</option><option value="identity">Sort: identity</option>
        </select>
      </div>

      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
        {loading ? "Loading…" : err ? err : `Showing ${formatNumber(Math.min(view.length, DISPLAY_CAP))} of ${formatNumber(view.length)} matching (all ${formatNumber(counts.total)} loaded). Promotion controls arrive with the policy engine.`}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {view.slice(0, DISPLAY_CAP).map((e) => {
          const soft = e.relevance === "soft";
          const id = IDENTITY_META[e.identity];
          return (
            <li key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--color-border-subtle)", opacity: soft ? 0.78 : 1 }}>
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.displayTitle}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                  <Chip>{SCHEME_LABEL[e.scheme ?? "none"] ?? "ref"}</Chip>
                  {e.identifier && <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "monospace" }}>{e.identifier}</span>}
                  {e.jurisdiction && <Chip>{e.jurisdiction}</Chip>}
                  {e.instrumentType && <Chip>{e.instrumentType.replace(/_/g, " ")}</Chip>}
                  {e.surfaces.map((s) => <Chip key={s}>{s.replace("_", " ")}</Chip>)}
                  {soft && <Chip color="var(--brass)">low-relevance</Chip>}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent-blue)", textDecoration: "none", fontWeight: 600 }}>primary source ↗</a>
                </div>
              </div>
              <Chip color={id.color}>{id.label}</Chip>
            </li>
          );
        })}
        {!loading && view.length === 0 && !err && <li style={{ padding: 16, fontSize: 13, color: "var(--color-text-muted)" }}>No catalogued instruments match these filters.</li>}
      </ul>
    </div>
  );
}
