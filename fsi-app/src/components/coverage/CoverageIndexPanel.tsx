"use client";

/**
 * CoverageIndexPanel — the B1 dual-verified index, mounted INSIDE an existing surface (not a sixth
 * top-level surface; PI-1). Primary home is Regulations; each surface renders its own category slice
 * (getCoverageIndex(surface)). Below the surface's verified-brief ledger, this panel surfaces the
 * DISCOVERY layer: instruments catalogued from monitored portals, dual-verified on relevance (firm-core
 * prominent / soft-tail flagged) and identity (does the pointer resolve to a live primary source).
 *
 * A catalogued instrument is a POINTER, not a grounded brief — the scope statement makes that boundary
 * explicit so the panel never fabricates coverage; full verified briefs are the ledger ABOVE it on the
 * same page. Collapsible, DEFAULT CLOSED (platform accordion doctrine) so the surface's verified content
 * stays primary. Promotion is a non-triggering stub (generation is operator-gated metered spend).
 */

import { useState, useMemo } from "react";
import type { CoverageIndexResult, CoverageEntry, IdentityState } from "@/lib/coverage/index-data";

const PANEL_CAP = 120; // rows rendered when expanded; counts above are exact over the full surface set

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
        borderBottom: "1px solid var(--color-border-subtle)", opacity: soft ? 0.72 : 1,
        background: soft ? "var(--color-bg-surface)" : "transparent",
      }}
    >
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Chip color="var(--color-text-primary)" title={`Identifier scheme: ${e.scheme ?? "url-only"}`}>
            {SCHEME_LABEL[e.scheme ?? "none"] ?? "ref"}
          </Chip>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.identifier || e.url}
          </span>
          {soft && <Chip color="var(--brass)" bg="color-mix(in srgb, var(--brass) 12%, transparent)" title={`Flagged low-relevance (${e.softPass}-pass)`}>low-relevance</Chip>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
          {e.surfaces.map((s) => <Chip key={s}>{s.replace("_", " ")}</Chip>)}
          <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent-blue)", textDecoration: "none", fontWeight: 600 }}>
            primary source ↗
          </a>
        </div>
      </div>
      <Chip color={id.color} bg={id.bg} title="Identity axis: does the pointer resolve to a live primary source on a registered host?">{id.label}</Chip>
      <span
        title="Brief generation is operator-initiated. This catalogue entry is a candidate for a full grounded brief."
        style={{ fontSize: 12, color: "var(--color-text-disabled)", fontWeight: 600, whiteSpace: "nowrap", cursor: "default" }}
      >
        promote →
      </span>
    </li>
  );
}

export function CoverageIndexPanel({ data, surfaceLabel }: { data: CoverageIndexResult; surfaceLabel: string }) {
  const [open, setOpen] = useState(false); // DEFAULT CLOSED — accordion doctrine; verified ledger stays primary.
  const c = data.counts;

  // Nothing catalogued for this surface → render nothing (honest empty, no fabricated section).
  const entries = useMemo(() => data.entries, [data.entries]);
  if (c.total === 0 && !data._error) return null;

  return (
    <div style={{ margin: "8px 24px 48px", maxWidth: 1080, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--color-bg-surface)" }}>
        {/* Header — always visible; counts show even when collapsed. */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
            background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--color-text-primary)" }}>Coverage index</span>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            <b style={{ color: "var(--accent-blue)" }}>{c.dualVerified.toLocaleString()}</b> dual-verified ·{" "}
            {c.total.toLocaleString()} catalogued for {surfaceLabel}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-muted)", fontWeight: 700 }}>{open ? "HIDE ▲" : "SHOW ▼"}</span>
        </button>

        {open && (
          <div style={{ padding: "0 16px 16px" }}>
            {data._error ? (
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", padding: "8px 0" }}>{data._error}</div>
            ) : (
              <>
                {/* Scope statement — the honest boundary. */}
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-secondary)", padding: "4px 0 12px" }}>
                  <strong style={{ color: "var(--color-text-primary)" }}>What this is.</strong> {c.total.toLocaleString()} instruments
                  identified as relevant to {surfaceLabel} across {c.distinctSources} monitored source portals, dual-verified on{" "}
                  <em>relevance</em> (firm-core {c.firmCore.toLocaleString()} vs soft-tail {c.softTail.toLocaleString()}, flagged) and{" "}
                  <em>identity</em> ({c.identityVerified.toLocaleString()} confirmed to resolve to a live primary source on a registered
                  host). <strong style={{ color: "var(--color-text-primary)" }}>A catalogued instrument is a pointer, not a brief</strong> —
                  full grounded briefs, whose every figure and derived date is traced to a verbatim source span, are the verified ledger
                  above. The gap between catalogued and briefed is the grounding roadmap, shown honestly rather than papered over.
                </div>

                {/* Identity breakdown */}
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10 }}>
                  <span><b style={{ color: IDENTITY_META.verified.color }}>{c.identityVerified.toLocaleString()}</b> resolve</span>
                  {c.identityPending > 0 && <span><b>{c.identityPending.toLocaleString()}</b> check pending</span>}
                  {c.identityUnresolved > 0 && <span><b style={{ color: IDENTITY_META.unresolved.color }}>{c.identityUnresolved.toLocaleString()}</b> unconfirmed</span>}
                  {c.identityDead > 0 && <span><b style={{ color: IDENTITY_META.dead.color }}>{c.identityDead.toLocaleString()}</b> not reachable</span>}
                </div>

                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
                  Showing {Math.min(entries.length, PANEL_CAP).toLocaleString()} of {c.total.toLocaleString()}
                  {c.total > PANEL_CAP && <> · dual-verified firm-core ordered first; counts above are exact over the full set</>}.
                </div>

                <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  {entries.slice(0, PANEL_CAP).map((e) => <EntryRow key={e.id} e={e} />)}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
