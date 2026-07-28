"use client";

/**
 * CoverageIndexPanel — the B1 dual-verified index mounted INSIDE an existing surface (not a sixth
 * top-level surface; PI-1). Primary home is Regulations; each surface renders its own category slice.
 *
 * CUSTOMER READ-ONLY CONTENT (dispatch 3): titles, jurisdiction, instrument type, topic tags, resolves-
 * status, scope statement. There is NO promote affordance and NO operator action here — not hidden by CSS,
 * not in the payload. All promotion controls live in /admin behind the admin gate + server-side/RLS
 * enforcement. A catalogued instrument is a POINTER, not a grounded brief; the scope statement makes that
 * explicit (full verified briefs are the ledger above). Collapsible, DEFAULT CLOSED (accordion doctrine).
 *
 * Rows render human-readable (real title primary, identifier demoted) — the operator cannot evaluate bare
 * numbers. The initial slice ships with the page; the FULL per-surface set lazy-loads via
 * /api/coverage/entries on first expand so sort/filter can navigate all rows without inflating the page.
 */

import { useState, useMemo, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { CoverageIndexResult, CoverageEntry, IdentityState } from "@/lib/coverage/index-data";

const DISPLAY_CAP = 200; // rows rendered after filter/sort; counts + filter options are over the full set

const IDENTITY_META: Record<IdentityState, { label: string; color: string; bg: string }> = {
  verified: { label: "Resolves", color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 12%, transparent)" },
  pending: { label: "Check pending", color: "var(--color-text-muted)", bg: "var(--color-bg-surface)" },
  unresolved: { label: "Unconfirmed", color: "var(--brass)", bg: "color-mix(in srgb, var(--brass) 12%, transparent)" },
  dead: { label: "Not reachable", color: "var(--color-error)", bg: "color-mix(in srgb, var(--color-error) 12%, transparent)" },
};
const SCHEME_LABEL: Record<string, string> = { celex: "CELEX", eli: "ELI", "uk-legislation": "UK-SI", generic: "ref", none: "URL" };

function Chip({ children, color, bg, title }: { children: React.ReactNode; color?: string; bg?: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
        padding: "2px 7px", borderRadius: 4, color: color ?? "var(--color-text-secondary)", background: bg ?? "var(--color-bg-surface)",
        border: "1px solid var(--color-border-subtle)", whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function EntryRow({ e }: { e: CoverageEntry }) {
  const soft = e.relevance === "soft";
  const id = IDENTITY_META[e.identity];
  return (
    <li
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
        borderBottom: "1px solid var(--color-border-subtle)", opacity: soft ? 0.78 : 1,
        background: soft ? "var(--color-bg-surface)" : "transparent",
      }}
    >
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        {/* Human-readable title primary. */}
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {e.displayTitle}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
          {/* Identifier demoted to a secondary label. */}
          <Chip title={`Identifier scheme: ${e.scheme ?? "url-only"}`}>{SCHEME_LABEL[e.scheme ?? "none"] ?? "ref"}</Chip>
          {e.identifier && <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "monospace" }}>{e.identifier}</span>}
          {e.jurisdiction && <Chip title="Jurisdiction">{e.jurisdiction}</Chip>}
          {e.instrumentType && <Chip title="Instrument type">{e.instrumentType.replace(/_/g, " ")}</Chip>}
          {e.surfaces.map((s) => <Chip key={s} title="Topic surface that made it relevant">{s.replace("_", " ")}</Chip>)}
          {soft && <Chip color="var(--brass)" bg="color-mix(in srgb, var(--brass) 12%, transparent)" title={`Flagged low-relevance (${e.softPass}-pass)`}>low-relevance</Chip>}
          <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent-blue)", textDecoration: "none", fontWeight: 600 }}>
            primary source ↗
          </a>
        </div>
      </div>
      <Chip color={id.color} bg={id.bg} title="Identity: does the pointer resolve to a live primary source on a registered host?">{id.label}</Chip>
      {/* READ-ONLY: no promote/action control. Promotion is admin-only (dispatch 3). */}
    </li>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: "5px 8px", borderRadius: 6,
  border: "1px solid var(--color-border-subtle)", background: "var(--color-bg-surface)", color: "var(--color-text-secondary)",
};

type SortKey = "relevance" | "title" | "jurisdiction" | "type" | "identity";

export function CoverageIndexPanel({
  data, surface, surfaceLabel,
}: { data: CoverageIndexResult; surface: string; surfaceLabel: string }) {
  const [open, setOpen] = useState(false); // DEFAULT CLOSED — accordion doctrine; verified ledger stays primary.
  const [full, setFull] = useState<CoverageEntry[] | null>(null); // lazy-loaded full set
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [fJuris, setFJuris] = useState("");
  const [fType, setFType] = useState("");
  const [fRel, setFRel] = useState("");
  const [fIdent, setFIdent] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const c = data.counts;
  const active = full ?? data.entries; // full set once loaded, else the initial slice
  const loadedAll = full !== null;

  const expand = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && full === null && !loading) {
      setLoading(true);
      setLoadErr(null);
      try {
        // Authenticated fetch: requireAuth reads the Bearer token (not cookies), so attach the session
        // access token the same way the admin client components do.
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/coverage/entries?surface=${encodeURIComponent(surface)}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ""}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        setFull(body.entries as CoverageEntry[]);
      } catch {
        setLoadErr("Could not load the full set; showing the first entries.");
      } finally {
        setLoading(false);
      }
    }
  }, [open, full, loading, surface, supabase]);

  const jurisdictions = useMemo(() => [...new Set(active.map((e) => e.jurisdiction).filter(Boolean))].sort() as string[], [active]);
  const types = useMemo(() => [...new Set(active.map((e) => e.instrumentType).filter(Boolean))].sort() as string[], [active]);

  const view = useMemo(() => {
    const v = active.filter(
      (e) =>
        (!fJuris || e.jurisdiction === fJuris) &&
        (!fType || e.instrumentType === fType) &&
        (!fRel || e.relevance === fRel) &&
        (!fIdent || e.identity === fIdent)
    );
    const idRank: Record<IdentityState, number> = { verified: 0, pending: 1, unresolved: 2, dead: 3 };
    const cmp: Record<SortKey, (a: CoverageEntry, b: CoverageEntry) => number> = {
      relevance: (a, b) => (a.relevance !== b.relevance ? (a.relevance === "firm" ? -1 : 1) : idRank[a.identity] - idRank[b.identity]),
      title: (a, b) => a.displayTitle.localeCompare(b.displayTitle),
      jurisdiction: (a, b) => (a.jurisdiction || "~").localeCompare(b.jurisdiction || "~"),
      type: (a, b) => (a.instrumentType || "~").localeCompare(b.instrumentType || "~"),
      identity: (a, b) => idRank[a.identity] - idRank[b.identity],
    };
    return [...v].sort(cmp[sort]);
  }, [active, fJuris, fType, fRel, fIdent, sort]);

  // Honest empty — nothing catalogued for this surface. After all hooks (rules-of-hooks).
  if (c.total === 0 && !data._error) return null;

  return (
    <div style={{ margin: "8px auto 48px", maxWidth: 1080, paddingLeft: 24, paddingRight: 24 }}>
      <div style={{ border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--color-bg-surface)" }}>
        <button
          onClick={expand}
          aria-expanded={open}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--color-text-primary)" }}>Coverage index</span>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            <b style={{ color: "var(--accent-blue)" }}>{c.dualVerified.toLocaleString()}</b> dual-verified · {c.total.toLocaleString()} catalogued for {surfaceLabel}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-muted)", fontWeight: 700 }}>{open ? "HIDE ▲" : "SHOW ▼"}</span>
        </button>

        {open && (
          <div style={{ padding: "0 16px 16px" }}>
            {data._error ? (
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", padding: "8px 0" }}>{data._error}</div>
            ) : (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-secondary)", padding: "4px 0 12px" }}>
                  <strong style={{ color: "var(--color-text-primary)" }}>What this is.</strong> {c.total.toLocaleString()} instruments
                  identified as relevant to {surfaceLabel} across {c.distinctSources} monitored source portals, dual-verified on{" "}
                  <em>relevance</em> (firm-core {c.firmCore.toLocaleString()} vs soft-tail {c.softTail.toLocaleString()}, flagged) and{" "}
                  <em>identity</em> ({c.identityVerified.toLocaleString()} confirmed to resolve to a live primary source on a registered
                  host). <strong style={{ color: "var(--color-text-primary)" }}>A catalogued instrument is a pointer, not a brief</strong> —
                  full grounded briefs, whose every figure and derived date is traced to a verbatim source span, are the verified ledger
                  above. The gap between catalogued and briefed is the grounding roadmap, shown honestly rather than papered over.
                </div>

                {/* Sort + filter controls (navigate the full set). */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                  <select style={selectStyle} value={fJuris} onChange={(e) => setFJuris(e.target.value)} aria-label="Filter jurisdiction">
                    <option value="">All jurisdictions</option>
                    {jurisdictions.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                  <select style={selectStyle} value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Filter type">
                    <option value="">All types</option>
                    {types.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                  <select style={selectStyle} value={fRel} onChange={(e) => setFRel(e.target.value)} aria-label="Filter relevance">
                    <option value="">Firm + soft</option>
                    <option value="firm">Firm-core</option>
                    <option value="soft">Soft-tail</option>
                  </select>
                  <select style={selectStyle} value={fIdent} onChange={(e) => setFIdent(e.target.value)} aria-label="Filter resolves">
                    <option value="">Any identity</option>
                    <option value="verified">Resolves</option>
                    <option value="unresolved">Unconfirmed</option>
                    <option value="dead">Not reachable</option>
                    <option value="pending">Check pending</option>
                  </select>
                  <select style={selectStyle} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
                    <option value="relevance">Sort: relevance</option>
                    <option value="title">Sort: title</option>
                    <option value="jurisdiction">Sort: jurisdiction</option>
                    <option value="type">Sort: type</option>
                    <option value="identity">Sort: identity</option>
                  </select>
                </div>

                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
                  Showing {Math.min(view.length, DISPLAY_CAP).toLocaleString()} of {view.length.toLocaleString()} matching
                  {" · "}
                  {loading ? "loading full set…" : loadedAll ? `all ${c.total.toLocaleString()} loaded` : `first ${data.entries.length} (full set loads on open)`}
                  {loadErr && <span style={{ color: "var(--brass)" }}> · {loadErr}</span>}
                </div>

                <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  {view.slice(0, DISPLAY_CAP).map((e) => <EntryRow key={e.id} e={e} />)}
                  {view.length === 0 && <li style={{ padding: 16, fontSize: 13, color: "var(--color-text-muted)" }}>No instruments match these filters.</li>}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
