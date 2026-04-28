"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Download, RefreshCw, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface ToastState { kind: "ok" | "err"; message: string }

// ── Global pause banner (top of the dashboard) ──

export function GlobalPauseToggle() {
  const supabase = createSupabaseBrowserClient();
  const [paused, setPaused] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/sources/pause-global", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const payload = await res.json();
        setPaused(!!payload.paused);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle() {
    if (paused === null) return;
    setSubmitting(true);
    const next = !paused;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/sources/pause-global", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ paused: next }),
      });
      if (res.ok) {
        setPaused(next);
        setToast({ kind: "ok", message: next ? "All processing paused" : "Processing resumed" });
      } else {
        const payload = await res.json();
        setToast({ kind: "err", message: payload.error || "Toggle failed" });
      }
    } catch (e: any) {
      setToast({ kind: "err", message: e.message });
    } finally {
      setSubmitting(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  if (paused === null) return null;

  return (
    <div className="space-y-2">
      <div
        className="p-3 rounded-lg border flex items-center gap-3"
        style={{
          borderColor: paused ? "var(--color-warning)" : "var(--color-border)",
          backgroundColor: paused ? "rgba(255,165,0,0.08)" : "var(--color-surface)",
        }}
      >
        <button
          onClick={toggle}
          disabled={submitting}
          className="px-3 py-1.5 text-xs font-semibold rounded border disabled:opacity-50"
          style={{
            borderColor: paused ? "var(--color-warning)" : "var(--color-border)",
            color: "var(--color-text-primary)",
            backgroundColor: paused ? "var(--color-warning)" : "var(--color-surface-raised)",
          }}
        >
          {submitting ? "Saving…" : paused ? "Resume all processing" : "Pause all processing"}
        </button>
        <div className="text-xs flex-1" style={{ color: "var(--color-text-secondary)" }}>
          {paused ? (
            <>
              <strong style={{ color: "var(--color-warning)" }}>All automated source processing is paused.</strong>{" "}
              Manual fetch and regenerate actions still work.
            </>
          ) : (
            <>Worker scans, agent runs, and trust recomputes are active. Toggle to pause for budget control.</>
          )}
        </div>
      </div>
      {toast && (
        <div className="text-xs" style={{ color: toast.kind === "ok" ? "var(--color-success)" : "var(--color-error)" }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ── Per-source admin row controls (pause / fetch-now / regenerate-brief) ──

interface SourceRowControlsProps {
  sourceId: string;
  initialPaused?: boolean;
}

export function SourceRowControls({ sourceId, initialPaused = false }: SourceRowControlsProps) {
  const supabase = createSupabaseBrowserClient();
  const [paused, setPaused] = useState(initialPaused);
  const [pausing, setPausing] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setStatusMsg({ kind, text });
    setTimeout(() => setStatusMsg(null), 8000);
  }

  async function togglePause() {
    setPausing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/sources/${sourceId}/pause`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ paused: !paused }),
      });
      if (res.ok) {
        setPaused(!paused);
        flash("ok", !paused ? "Source paused" : "Source resumed");
      } else {
        const payload = await res.json();
        flash("err", payload.error || "Pause toggle failed");
      }
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setPausing(false);
    }
  }

  async function fetchNow() {
    setFetching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/sources/${sourceId}/fetch-now`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        flash("ok", `Fetched ${payload.contentLength}c via ${payload.method} in ${payload.durationMs}ms (sha ${payload.contentHash})`);
      } else {
        flash("err", payload.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setFetching(false);
    }
  }

  async function regenerateBrief() {
    setRegenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/sources/${sourceId}/regenerate-brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        flash("ok", `Brief: ${payload.briefLength}c, ${payload.sectionsPopulated} sections, ${payload.citationsExtracted} citations`);
      } else {
        flash("err", payload.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); togglePause(); }}
          disabled={pausing}
          aria-label={paused ? "Resume source processing" : "Pause source processing"}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border disabled:opacity-50"
          style={{
            borderColor: paused ? "var(--color-warning)" : "var(--color-border)",
            backgroundColor: paused ? "rgba(255,165,0,0.10)" : "var(--color-surface)",
            color: "var(--color-text-primary)",
          }}
        >
          {pausing ? <Loader2 size={11} className="animate-spin" /> : paused ? <Play size={11} /> : <Pause size={11} />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); fetchNow(); }}
          disabled={fetching}
          aria-label="Fetch source content now"
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border disabled:opacity-50"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
        >
          {fetching ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          {fetching ? "Fetching…" : "Fetch now"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); regenerateBrief(); }}
          disabled={regenerating}
          aria-label="Regenerate brief for this source"
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border disabled:opacity-50"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
        >
          {regenerating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {regenerating ? "Regenerating…" : "Regenerate brief"}
        </button>
      </div>
      {statusMsg && (
        <div className="text-[11px]" style={{ color: statusMsg.kind === "ok" ? "var(--color-success)" : "var(--color-error)" }}>
          {statusMsg.text}
        </div>
      )}
    </div>
  );
}
