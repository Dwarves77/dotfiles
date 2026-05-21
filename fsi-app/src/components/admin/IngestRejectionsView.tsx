"use client";

/**
 * IngestRejectionsView — Phase 7 admin chrome triage queue.
 *
 * Surfaces public.ingest_rejections rows (migration 082) that have not
 * been triaged yet. Each row is a rejected jurisdiction token captured
 * by the BEFORE INSERT trigger on intelligence_items: hydrological
 * features (CARSON_RIVER_WATERSHED), agency names (EPA), sub-jurisdictional
 * fragments (BIHOR COUNTY), or unparseable strings.
 *
 * Actions per row (matching the dispatch brief):
 *   - reclassify: triage_action='reclassified' (operator noted the canonical
 *                 mapping exists elsewhere)
 *   - retry: triage_action='escalated' (operator wants this revisited; a
 *            future automation can sweep escalated rows)
 *   - archive: triage_action='discarded' (drop the token, no further action)
 *
 * Per DP-1 every related action on a single rejection is reachable from
 * the row without a tab switch (raw value, source context, action,
 * optional note).
 */

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { RefreshCw, ExternalLink, Archive, RotateCw, Tag } from "lucide-react";
import { formatRelative, toDate } from "@/lib/relative-time";

interface RejectionItem {
  id: string;
  raw_value: string;
  rejection_reason: string;
  source_url: string | null;
  source_id: string | null;
  ingest_attempted_at: string;
  source?: { id?: string; name?: string; url?: string } | null;
}

interface RejectionsResponse {
  items: RejectionItem[];
  total_untriaged: number | null;
  list_capped: boolean;
}

export function IngestRejectionsView() {
  const supabase = createSupabaseBrowserClient();
  const [data, setData] = useState<RejectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notesByRow, setNotesByRow] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 5000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/triage/ingest-rejections", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error || `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(payload as RejectionsResponse);
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function triage(
    row: RejectionItem,
    action: "discarded" | "reclassified" | "escalated"
  ) {
    setPendingId(row.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/triage/ingest-rejections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          id: row.id,
          action,
          notes: notesByRow[row.id] || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        flash("err", payload?.error || `HTTP ${res.status}`);
      } else {
        flash("ok", `Marked ${action}`);
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.filter((i) => i.id !== row.id),
                total_untriaged:
                  typeof prev.total_untriaged === "number"
                    ? Math.max(0, prev.total_untriaged - 1)
                    : prev.total_untriaged,
              }
            : prev
        );
      }
    } catch (e: any) {
      flash("err", e.message || "Network error");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Ingest rejections
          </h2>
          <p
            className="text-sm mt-1 max-w-3xl"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Jurisdiction tokens the trigger could not normalize to a
            canonical entity: hydrological features, agency names,
            sub-jurisdictional fragments, unparseable strings. Reclassify
            when a canonical mapping should exist; retry to escalate for
            re-investigation; archive to drop the token.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat
          label="Untriaged total"
          value={
            loading
              ? "..."
              : data?.total_untriaged !== null && data?.total_untriaged !== undefined
                ? String(data.total_untriaged)
                : "0"
          }
          critical={(data?.total_untriaged ?? 0) > 0}
        />
        <Stat
          label="Showing"
          value={loading ? "..." : String(data?.items.length ?? 0)}
          meta={data?.list_capped ? "List capped at 200" : undefined}
        />
      </div>

      {status && (
        <div
          className="text-xs p-2 rounded"
          style={{
            color: status.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
            backgroundColor:
              status.kind === "ok"
                ? "rgba(22,163,74,0.04)"
                : "rgba(220,38,38,0.04)",
            border:
              status.kind === "ok"
                ? "1px solid rgba(22,163,74,0.2)"
                : "1px solid rgba(220,38,38,0.2)",
          }}
        >
          {status.text}
        </div>
      )}

      {error && (
        <div
          className="p-3 rounded-md text-sm"
          style={{
            color: "var(--color-error)",
            border: "1px solid var(--color-error)",
            backgroundColor: "rgba(220,38,38,0.04)",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (data?.items ?? []).length === 0 && (
        <EmptyState />
      )}

      {!loading && (data?.items ?? []).length > 0 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--color-border)" }}
        >
          <table className="w-full text-[12.5px] border-collapse">
            <thead style={{ background: "var(--color-surface-raised)" }}>
              <tr>
                <Th>Raw value</Th>
                <Th>Reason</Th>
                <Th>Source</Th>
                <Th>Attempted</Th>
                <Th>Notes</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((row) => {
                const isPending = pendingId === row.id;
                const when = toDate(row.ingest_attempted_at);
                const notesVal = notesByRow[row.id] || "";
                return (
                  <tr
                    key={row.id}
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <Td>
                      <code
                        className="text-[11px] px-1.5 py-0.5 rounded"
                        style={{
                          color: "var(--color-text-primary)",
                          background: "var(--color-surface-raised)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        {row.raw_value}
                      </code>
                    </Td>
                    <Td>
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        style={{
                          color: "var(--color-warning)",
                          background: "rgba(217,119,6,0.08)",
                          border: "1px solid rgba(217,119,6,0.2)",
                        }}
                      >
                        {row.rejection_reason}
                      </span>
                    </Td>
                    <Td>
                      {row.source?.name ? (
                        <div className="flex flex-col gap-0.5 max-w-[220px]">
                          <span style={{ color: "var(--color-text-primary)" }}>
                            {row.source.name}
                          </span>
                          {row.source_url && (
                            <a
                              href={row.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] truncate hover:underline inline-flex items-center gap-1"
                              style={{ color: "var(--color-primary)" }}
                            >
                              <ExternalLink size={10} />
                              {row.source_url}
                            </a>
                          )}
                        </div>
                      ) : row.source_url ? (
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] truncate hover:underline inline-flex items-center gap-1"
                          style={{ color: "var(--color-primary)" }}
                        >
                          <ExternalLink size={10} />
                          {row.source_url}
                        </a>
                      ) : (
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          (no source)
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span
                        className="tabular-nums text-[11px]"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {when ? formatRelative(when) : row.ingest_attempted_at}
                      </span>
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={notesVal}
                        onChange={(e) =>
                          setNotesByRow((s) => ({ ...s, [row.id]: e.target.value }))
                        }
                        placeholder="Optional triage note"
                        disabled={isPending}
                        className="text-[11px] px-2 py-1 rounded border w-full max-w-[200px]"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-background)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                    </Td>
                    <Td align="right">
                      <div className="flex flex-col gap-1.5 items-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => triage(row, "reclassified")}
                        >
                          <Tag size={12} />
                          Reclassify
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => triage(row, "escalated")}
                        >
                          <RotateCw size={12} />
                          Retry
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => triage(row, "discarded")}
                        >
                          <Archive size={12} />
                          Archive
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {loading && (
        <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading...
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td className="px-3 py-2 align-top" style={{ textAlign: align ?? "left" }}>
      {children}
    </td>
  );
}

function Stat({
  label,
  value,
  meta,
  critical,
}: {
  label: string;
  value: string;
  meta?: string;
  critical?: boolean;
}) {
  return (
    <div
      className="p-3 rounded-lg border"
      style={{
        borderColor: critical ? "var(--color-warning)" : "var(--color-border)",
        backgroundColor: critical
          ? "rgba(217,119,6,0.04)"
          : "var(--color-surface)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-xl font-semibold tabular-nums mt-1"
        style={{
          color: critical ? "var(--color-warning)" : "var(--color-text-primary)",
        }}
      >
        {value}
      </div>
      {meta && (
        <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {meta}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="p-8 rounded-lg text-center"
      style={{
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text-secondary)",
      }}
    >
      <p className="text-sm">No untriaged ingest rejections.</p>
      <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
        Rejections accumulate as the BEFORE INSERT trigger on
        intelligence_items rejects unparseable jurisdiction tokens.
      </p>
    </div>
  );
}
