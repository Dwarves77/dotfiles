"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Play,
  Download,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface StagedUpdate {
  id: string;
  action: string;
  resource_id: string | null;
  proposed_data: Record<string, unknown>;
  reason: string;
  source_url: string;
  confidence: string;
  status: string;
  batch_id: string;
  created_at: string;
}

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    HIGH: "text-green-400 border-green-400/30",
    MEDIUM: "text-yellow-400 border-yellow-400/30",
    LOW: "text-red-400 border-red-400/30",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 border rounded-[1px]",
        colors[confidence] || "text-text-secondary border-border-subtle"
      )}
    >
      {confidence}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    create: "text-green-400 border-green-400/30 bg-green-400/5",
    update: "text-cyan-300 border-cyan-300/30 bg-cyan-300/5",
    archive: "text-orange-400 border-orange-400/30 bg-orange-400/5",
    dispute: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
    new_source: "text-purple-400 border-purple-400/30 bg-purple-400/5",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-[1px]",
        colors[action] || "text-text-secondary border-border-subtle"
      )}
    >
      {action.replace("_", " ")}
    </span>
  );
}

function StagedUpdateCard({
  update,
  onApprove,
  onReject,
  isProcessing,
}: {
  update: StagedUpdate;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const data = update.proposed_data;

  return (
    <div className="border border-border-subtle rounded-[2px] bg-surface-subtle overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-input/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ActionBadge action={update.action} />
          <span className="text-sm font-medium text-text-primary truncate">
            {update.action === "create"
              ? (data as any).title || "New resource"
              : update.action === "new_source"
              ? (data as any).name || "New source"
              : update.resource_id || "Unknown"}
          </span>
          <ConfidenceBadge confidence={update.confidence} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-text-tertiary tabular-nums">
            {new Date(update.created_at).toLocaleDateString()}
          </span>
          {expanded ? (
            <ChevronUp size={14} className="text-text-secondary" />
          ) : (
            <ChevronDown size={14} className="text-text-secondary" />
          )}
        </div>
      </button>

      {/* Detail */}
      {expanded && (
        <div className="border-t border-border-subtle p-4 space-y-3">
          {/* Reason */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold mb-1">
              Reason
            </p>
            <p className="text-xs text-text-primary leading-relaxed">{update.reason}</p>
          </div>

          {/* Source URL */}
          {update.source_url && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold mb-1">
                Source
              </p>
              <a
                href={update.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--cyan)] hover:underline break-all"
              >
                {update.source_url}
              </a>
            </div>
          )}

          {/* Proposed changes */}
          {update.action === "update" && (data as any).changes && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold mb-1">
                Changes
              </p>
              <div className="space-y-1">
                {((data as any).changes as Array<{ field: string; prev: string; now: string; impact?: string }>).map(
                  (ch, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-semibold text-text-primary">{ch.field}:</span>{" "}
                      <span className="line-through text-text-tertiary">{ch.prev}</span>{" "}
                      <span className="text-text-primary font-medium">{ch.now}</span>
                      {ch.impact && (
                        <span className="text-yellow-400 text-[10px] ml-2">{ch.impact}</span>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Full proposed data (collapsed) */}
          <details className="text-xs">
            <summary className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold cursor-pointer">
              Raw Data
            </summary>
            <pre className="mt-2 p-3 bg-surface-base rounded-[2px] text-text-secondary overflow-x-auto text-[11px] leading-relaxed">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(); }}
              disabled={isProcessing}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-[1px] transition-all",
                "border-green-400/40 text-green-400 hover:bg-green-400 hover:text-[var(--navy)]",
                isProcessing && "opacity-50 pointer-events-none"
              )}
            >
              <CheckCircle size={13} /> Approve
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onReject(); }}
              disabled={isProcessing}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-[1px] transition-all",
                "border-red-400/40 text-red-400 hover:bg-red-400 hover:text-[var(--navy)]",
                isProcessing && "opacity-50 pointer-events-none"
              )}
            >
              <XCircle size={13} /> Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminPanel() {
  const { token, role } = useAuthStore();
  const [updates, setUpdates] = useState<StagedUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [workerRunning, setWorkerRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const headers = authHeaders(token);

  const fetchUpdates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staged?status=${statusFilter}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUpdates(data);
      }
    } catch {
      // Silently fail if API not available
    } finally {
      setLoading(false);
    }
  }, [statusFilter, token]);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  const handleApprove = async (id: string) => {
    setProcessing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/staged/${id}/approve`, {
        method: "POST",
        headers,
      });
      if (res.ok) {
        setUpdates((prev) => prev.filter((u) => u.id !== id));
        showMessage("Update approved and applied");
      } else {
        const data = await res.json();
        showMessage(`Error: ${data.error}`);
      }
    } catch {
      showMessage("Network error");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleReject = async (id: string) => {
    setProcessing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/staged/${id}/reject`, {
        method: "POST",
        headers,
      });
      if (res.ok) {
        setUpdates((prev) => prev.filter((u) => u.id !== id));
        showMessage("Update rejected");
      }
    } catch {
      showMessage("Network error");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleApproveAll = async () => {
    for (const update of updates) {
      await handleApprove(update.id);
    }
  };

  const handleRunWorker = async () => {
    setWorkerRunning(true);
    showMessage("Worker starting...");
    try {
      const res = await fetch("/api/worker/run", {
        method: "POST",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        showMessage(`Worker complete: ${data.updates_count} updates staged`);
        await fetchUpdates();
      } else {
        const data = await res.json();
        showMessage(`Worker error: ${data.error}`);
      }
    } catch {
      showMessage("Worker failed — check server logs");
    } finally {
      setWorkerRunning(false);
    }
  };

  const handleGenerateSkill = async () => {
    showMessage("Generating SKILL.md...");
    try {
      const res = await fetch("/api/skill/generate", { headers });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "SKILL.md";
        a.click();
        URL.revokeObjectURL(url);
        showMessage("SKILL.md downloaded");
      } else {
        const data = await res.json();
        showMessage(`Error: ${data.error}`);
      }
    } catch {
      showMessage("Failed to generate SKILL.md");
    }
  };

  function showMessage(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }

  const isAdmin = role === "admin" || role === "dev";

  if (!isAdmin) {
    return (
      <div className="py-8 text-center">
        <Shield size={32} className="mx-auto text-text-tertiary mb-3" />
        <p className="text-sm text-text-secondary">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl uppercase tracking-tight text-text-primary">
          Admin Panel
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunWorker}
            disabled={workerRunning}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-[1px] transition-all",
              "border-[var(--cyan)]/40 text-[var(--cyan)] hover:bg-[var(--cyan)] hover:text-[var(--navy)]",
              workerRunning && "opacity-50 pointer-events-none"
            )}
          >
            <Play size={12} /> {workerRunning ? "Running..." : "Run Worker"}
          </button>
          <button
            onClick={handleGenerateSkill}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border-subtle text-text-secondary rounded-[1px] hover:border-border-light hover:text-text-primary transition-all"
          >
            <Download size={12} /> SKILL.md
          </button>
          <button
            onClick={fetchUpdates}
            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className="px-4 py-2 bg-surface-input border border-border-subtle rounded-[2px] text-xs text-text-primary flex items-center gap-2">
          <AlertTriangle size={12} className="text-yellow-400 shrink-0" />
          {message}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-border-subtle">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all",
              statusFilter === s
                ? "border-[var(--cyan)] text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {s}
            {s === "pending" && updates.length > 0 && statusFilter === "pending" && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-[var(--cyan)]/10 text-[var(--cyan)] rounded-[1px] text-[10px]">
                {updates.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {statusFilter === "pending" && updates.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">
            {updates.length} pending update{updates.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleApproveAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border border-green-400/30 text-green-400 rounded-[1px] hover:bg-green-400 hover:text-[var(--navy)] transition-all"
          >
            <CheckCircle size={11} /> Approve All
          </button>
        </div>
      )}

      {/* Updates list */}
      {loading ? (
        <div className="py-12 text-center text-xs text-text-secondary">Loading...</div>
      ) : updates.length === 0 ? (
        <div className="py-12 text-center text-xs text-text-secondary">
          No {statusFilter} updates
        </div>
      ) : (
        <div className="space-y-2">
          {updates.map((u) => (
            <StagedUpdateCard
              key={u.id}
              update={u}
              onApprove={() => handleApprove(u.id)}
              onReject={() => handleReject(u.id)}
              isProcessing={processing.has(u.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
