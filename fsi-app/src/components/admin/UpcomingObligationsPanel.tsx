"use client";

/**
 * UpcomingObligationsPanel — admin panel for item_forward_events (migration 274/275, the
 * forward-events harness). Renders dated, obligation-bound events PRECISION-HONESTLY: a year-precision
 * event (source said only "by 2030") never displays as a fabricated full date. Date rendering itself
 * lives in src/lib/connections/forward-event-format.mjs (formatEventDate) — pulled out of this .tsx
 * file, same reason theme-stats.mjs was pulled out of admin/themes/route.ts: this repo has no
 * vitest/jest/tsx test runner, only `node --test` on *.mjs, so the one piece of real logic here needs
 * a plain module to get a REAL execution-wired proof (rule 15) rather than a cited-but-unrun one.
 *
 * Backed by: GET /api/admin/forward-events (auth, rate-limit, platform-admin gate, no-store).
 *
 * MOUNT (lane FIX, 2026-09-01): SourceHealthDashboard.tsx's tab set, as a new "obligations" tab next to
 * Themes — src/stores/sourceStore.ts's activeView union was widened to carry it (the FW1 report's own
 * "where mounted" note named this as the natural host, blocked only on that widening). Reached in the
 * UI via Admin → Sources → any sub-tab → the SourceHealthDashboard's own "Upcoming obligations" tab —
 * AdminDashboard.tsx mounts SourceHealthDashboard once for its whole "Sources" section regardless of
 * which AdminDashboard sub-tab is active, so this panel is reachable from all of them.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { Calendar, RefreshCw, AlertCircle } from "lucide-react";
import { formatEventDate } from "@/lib/connections/forward-event-format.mjs";

const KINDS = [
  "entry_into_force", "compliance_deadline", "review_or_report",
  "phase_step", "consultation_close", "other",
] as const;
type Kind = (typeof KINDS)[number];

const PRECISIONS = ["day", "month", "year"] as const;
type Precision = (typeof PRECISIONS)[number];

const KIND_LABELS: Record<Kind, string> = {
  entry_into_force: "Entry into force",
  compliance_deadline: "Compliance deadline",
  review_or_report: "Review / report",
  phase_step: "Phase step",
  consultation_close: "Consultation close",
  other: "Other",
};

interface ForwardEventItem {
  id: string;
  title: string;
  legacy_id: string | null;
  jurisdiction_iso: string | null;
}

interface ForwardEvent {
  id: string;
  intelligence_item_id: string;
  event_date: string; // ISO date; precision-honest display via formatEventDate, never raw
  date_precision: Precision;
  event_kind: Kind;
  obligation_text: string;
  source_kind: "claim" | "section";
  confidence: "high" | "medium";
  item: ForwardEventItem;
}

interface ForwardEventsResponse {
  events: ForwardEvent[];
  stats: { total: number; by_kind: Record<string, number>; by_precision: Record<string, number> };
  params: { from: string; kind: string[] | null; precision: string[] | null; limit: number };
}

export function UpcomingObligationsPanel() {
  const [data, setData] = useState<ForwardEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [precisionFilter, setPrecisionFilter] = useState<Precision | "all">("all");

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      if (kindFilter !== "all") params.set("kind", kindFilter);
      if (precisionFilter !== "all") params.set("precision", precisionFilter);
      const resp = await fetch(`/api/admin/forward-events?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const payload = await resp.json();
      if (!resp.ok) {
        setError(payload?.error || `Failed to load (${resp.status})`);
        setData(null);
      } else {
        setData(payload);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [supabase, kindFilter, precisionFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Upcoming obligations
          </h2>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: "var(--color-text-secondary)" }}>
            Dated, obligation-bound events extracted from already-grounded brief content (migration
            274/275). Never a fabricated date — a year-precision obligation shows only its year.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterLabel>Kind:</FilterLabel>
          <Chip active={kindFilter === "all"} onClick={() => setKindFilter("all")} label={`All (${data?.stats.total ?? 0})`} />
          {KINDS.map((k) => (
            <Chip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)} label={`${KIND_LABELS[k]} (${data?.stats.by_kind[k] ?? 0})`} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterLabel>Precision:</FilterLabel>
          <Chip active={precisionFilter === "all"} onClick={() => setPrecisionFilter("all")} label="All" />
          {PRECISIONS.map((p) => (
            <Chip key={p} active={precisionFilter === p} onClick={() => setPrecisionFilter(p)} label={`${p} (${data?.stats.by_precision[p] ?? 0})`} />
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md text-sm" style={{ color: "var(--color-error)", border: "1px solid var(--color-error)", backgroundColor: "rgba(220,38,38,0.04)" }}>
          {error}
        </div>
      )}

      {!loading && data && data.events.length === 0 && !error && <EmptyState />}

      {!loading && data && data.events.length > 0 && (
        <div className="space-y-2">
          {data.events.map((ev) => (
            <div key={ev.id} className="p-3 rounded-lg" style={{ border: "1px solid var(--color-border)", backgroundColor: "var(--color-surface)" }}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0 w-20">
                  <Calendar size={14} style={{ color: "var(--color-text-muted)" }} />
                  <span className="text-xs font-semibold mt-1 text-center tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                    {formatEventDate(ev.event_date, ev.date_precision)}
                  </span>
                  <PrecisionBadge precision={ev.date_precision} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <KindBadge kind={ev.event_kind} />
                    <span className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                      {ev.item.title}
                    </span>
                    {ev.item.jurisdiction_iso && (
                      <span className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
                        {ev.item.jurisdiction_iso}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    {ev.obligation_text}
                  </p>
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                    {ev.source_kind === "claim" ? "Claim-sourced" : "Section-sourced"} · {ev.confidence} confidence
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wider mr-1" style={{ color: "var(--color-text-muted)" }}>
      {children}
    </span>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 text-[11px] font-medium rounded transition-colors"
      style={{
        border: active ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
        background: active ? "var(--color-active-bg)" : "var(--color-surface)",
        color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
      style={{ color: "var(--color-primary)", background: "var(--color-active-bg)", border: "1px solid var(--color-primary)" }}
    >
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

function PrecisionBadge({ precision }: { precision: Precision }) {
  const isImprecise = precision !== "day";
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-wide mt-0.5"
      style={{ color: isImprecise ? "var(--color-warning)" : "var(--color-text-muted)" }}
      title={isImprecise ? "This date is normalized — the source did not state a specific day." : "The source stated an exact day."}
    >
      {precision}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg" style={{ border: "1px dashed var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <Calendar size={28} style={{ color: "var(--color-text-muted)" }} />
      <h3 className="mt-3 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
        No upcoming obligations match the current filters
      </h3>
      <p className="mt-1 text-xs max-w-md" style={{ color: "var(--color-text-secondary)" }}>
        item_forward_events is populated by src/lib/forward-events/extract-forward-events.mjs, an
        operator-run extraction pass — not a live trigger.
      </p>
      <p className="mt-3 text-[11px] inline-flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
        <AlertCircle size={11} />
        Powered by migration 274/275 — item_forward_events.
      </p>
    </div>
  );
}
