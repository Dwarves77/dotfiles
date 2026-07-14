"use client";

/**
 * ResearchPipelineQueueView — H4 (2026-05-25), Phase 4 HIGH RISK.
 *
 * Machine-pipeline VISIBILITY surface (Unit 0c, entry-29 conformance): the human publish/archive editorial
 * gate is RETIRED — customer visibility is machine-gated on provenance_status='verified' (data.ts), not the
 * vestigial pipeline_stage. Per platform-intent SKILL Section 5, this moved out of customer-facing /research
 * and into /admin. It shows each draft intelligence_item's machine-gated status (no human act):
 *
 *   - Publish (sets pipeline_stage='published'; item appears in
 *     customer-facing /research, /market, /operations, /regulations
 *     depending on its category routing)
 *   - Archive draft (sets is_archived=true; pulls item out of all
 *     surfaces while preserving the row for audit)
 *   - View → opens /research/[slug] in a new tab for inspection
 *
 * Queue scope: intelligence_items WHERE pipeline_stage = 'draft' AND
 * is_archived = false. Today's count is ~10 rows.
 *
 * Pattern matches IngestRejectionsView + TierOpinionDisagreementsView:
 * client component, browser supabase client, in-row actions, no tab
 * switching for related work.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { RefreshCw, ExternalLink } from "lucide-react";
import { formatRelative, toDate } from "@/lib/relative-time";

interface DraftItem {
  id: string;
  legacy_id: string | null;
  title: string;
  summary: string | null;
  item_type: string | null;
  domain: number | null;
  severity: string | null;
  added_date: string | null;
  last_regenerated_at: string | null;
  agent_integrity_flag: boolean | null;
  provenance_status: string | null;
  source: { id: string; name: string | null; category: string | null } | null;
}

const DOMAIN_LABEL: Record<number, string> = {
  1: "Regulations",
  2: "Energy & Tech",
  3: "Regional Ops",
  4: "Geopolitical",
  5: "Source Intel",
  6: "Facilities",
  7: "Research Pipeline",
};

const SEVERITY_TONE: Record<string, { fg: string; bg: string }> = {
  action_required: { fg: "var(--critical)", bg: "var(--critical-bg)" },
  cost_alert: { fg: "var(--high)", bg: "var(--high-bg)" },
  window_closing: { fg: "var(--moderate)", bg: "var(--moderate-bg)" },
  competitive_edge: { fg: "var(--accent)", bg: "var(--accent-bg)" },
  monitoring: { fg: "var(--muted)", bg: "var(--surface)" },
};

export function ResearchPipelineQueueView() {
  const supabase = createSupabaseBrowserClient();
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryErr } = await supabase
        .from("intelligence_items")
        .select(
          "id, legacy_id, title, summary, item_type, domain, severity, added_date, last_regenerated_at, agent_integrity_flag, provenance_status, source:sources(id, name, category)"
        )
        .eq("pipeline_stage", "draft")
        .eq("is_archived", false)
        .order("added_date", { ascending: false, nullsFirst: false })
        .limit(100);
      if (queryErr) throw new Error(queryErr.message);
      // Supabase types the embedded source as an array OR single depending
      // on FK shape; normalize to single object.
      const rows = (data ?? []).map((r: any) => ({
        ...r,
        source: Array.isArray(r.source) ? (r.source[0] ?? null) : (r.source ?? null),
      }));
      setItems(rows as DraftItem[]);
    } catch (e: any) {
      setError(e.message || "Failed to load draft queue");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Publish / archive RETIRED (Unit 0c, operator ruling 2026-07-13 — entry-29 conformance): the editorial
  // human gate IS the violation. Customer visibility is machine-gated on provenance_status='verified'
  // (data.ts) — NOT the vestigial pipeline_stage this button set — so removing the human publish strands
  // nothing. This view is now machine-pipeline VISIBILITY: it shows each draft item's machine-gated status.

  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary, var(--text))" }}>
            Research pipeline review
          </h2>
          <p className="text-xs" style={{ color: "var(--color-text-secondary, var(--text-2))", marginTop: 4 }}>
            Machine-pipeline visibility. Each row shows a draft item&apos;s machine-gated status — customer visibility gates on provenance_status=&apos;verified&apos;, not a human publish.
            Publishing surfaces the item to customer-facing /research, /market, /operations, or /regulations
            depending on its category routing.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>


      {loading && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", fontStyle: "italic" }}>Loading queue…</p>
      )}

      {error && (
        <p style={{ fontSize: 12.5, color: "var(--critical)" }}>{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", fontStyle: "italic" }}>
          No drafts pending. The editorial pipeline is clear.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => {
            const slug = item.legacy_id || item.id;
            const addedDate = toDate(item.added_date);
            const lastRegen = toDate(item.last_regenerated_at);
            const sevTone = item.severity ? SEVERITY_TONE[item.severity] : null;
            return (
              <div
                key={item.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderLeft: "3px solid var(--accent)",
                  borderRadius: "var(--r-sm)",
                  padding: "14px 16px",
                  display: "grid",
                  gridTemplateColumns: "1fr 200px",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--text-2)",
                      marginBottom: 6,
                    }}
                  >
                    {item.domain && DOMAIN_LABEL[item.domain] && (
                      <span>{DOMAIN_LABEL[item.domain]}</span>
                    )}
                    {item.item_type && <span>· {item.item_type}</span>}
                    {sevTone && item.severity && (
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 2,
                          color: sevTone.fg,
                          background: sevTone.bg,
                          border: `1px solid ${sevTone.fg}`,
                        }}
                      >
                        {item.severity.replace(/_/g, " ")}
                      </span>
                    )}
                    {item.agent_integrity_flag && (
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 2,
                          color: "var(--critical)",
                          background: "var(--critical-bg)",
                          border: "1px solid var(--critical)",
                        }}
                      >
                        Integrity flag
                      </span>
                    )}
                  </div>
                  <h4
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      lineHeight: 1.35,
                      margin: "2px 0 4px",
                      color: "var(--text)",
                    }}
                  >
                    {item.title || "(Untitled draft)"}
                  </h4>
                  {item.summary && (
                    <p
                      style={{
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        color: "var(--text-2)",
                        margin: "0 0 6px",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {item.summary}
                    </p>
                  )}
                  <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {item.source?.name && <span>Source: {item.source.name}</span>}
                    {addedDate && <span>Added {formatRelative(addedDate)}</span>}
                    {lastRegen && <span>Regenerated {formatRelative(lastRegen)}</span>}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                      padding: "3px 8px", borderRadius: 4, textAlign: "center", color: "var(--muted)",
                      border: "1px solid var(--color-border-medium)",
                    }}
                    title="Customer visibility is machine-gated on provenance_status='verified' — there is no human publish."
                  >
                    {item.provenance_status === "verified" ? "Verified · on surfaces" : (item.provenance_status ?? "in pipeline")}
                  </span>
                  <Link
                    href={`/research/${encodeURIComponent(slug)}`}
                    target="_blank"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-2)",
                      textDecoration: "none",
                      padding: "4px 8px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    <ExternalLink size={12} />
                    View as customer
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
