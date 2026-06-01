"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * VerificationQueue — Sprint 4 Block 1 task 1.12 + 1.13 (UNVERIFIED-PENDING-RUNTIME).
 *
 * Admin "Items pending verification" surface. Lists items at
 * provenance_status = 'pending_human_verify' (CRITICAL/HIGH that passed criteria
 * 1-5) with each FACT claim and its source_span PRE-DISPLAYED, and a PER-CLAIM
 * tick (locked decision: NO batch tick — the friction is the point).
 *
 * Ticking POSTs /api/admin/verify-claim, which calls resumeHook on the durable
 * workflow; the workflow stamps verified_by/verified_at (shown here as the 1.13
 * audit log) and flips the item to 'verified' once every FACT claim is ticked.
 *
 * NOT YET RUNTIME-VERIFIED: requires a running, suspended workflow for the tick
 * to land. Render-verify the layout now; runtime-verify the tick next session.
 */

interface ClaimRow {
  id: string;
  claim_text: string;
  source_span: string | null;
  source_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
}
interface PendingItem {
  id: string;
  legacy_id: string | null;
  title: string;
  priority: string | null;
  claims: ClaimRow[];
}

export function VerificationQueue() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticking, setTicking] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/pending-verification", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setItems(json.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const tick = useCallback(
    async (itemId: string, claimId: string) => {
      setTicking(claimId);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/verify-claim", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({ item_id: itemId, claim_id: claimId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        await load(); // reflect the new verified_by/verified_at + any status flip
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setTicking(null);
      }
    },
    [load, supabase]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Items pending verification
        </h2>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {loading ? "Loading…" : `${items.length} item${items.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        CRITICAL/HIGH items that passed criteria 1-5. Tick each FACT claim against its source span. When all FACT
        claims are verified, the item flips to verified and becomes customer-visible. Per-claim only — no batch tick.
      </p>

      {error && (
        <div className="text-xs" style={{ color: "var(--color-error, var(--color-critical))" }}>
          {error}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-8">
          <ShieldCheck size={22} style={{ color: "var(--color-success, var(--color-primary))" }} aria-hidden="true" />
          <p className="text-sm mt-2" style={{ color: "var(--color-text-primary)" }}>
            Nothing pending verification.
          </p>
        </div>
      )}

      {items.map((item) => {
        const total = item.claims.length;
        const done = item.claims.filter((c) => c.verified_at != null).length;
        return (
          <div
            key={item.id}
            className="p-4 rounded-lg border space-y-3"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {item.title}
              </p>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded" style={{ color: "var(--color-warning)", border: "1px solid rgba(217,119,6,0.2)" }}>
                {item.priority || "—"} · {done}/{total} verified
              </span>
            </div>

            {total === 0 && (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                No FACT claims recorded for this item (shell). It flips to verified on a zero-claim tick in Block 4.
              </p>
            )}

            <ul className="space-y-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {item.claims.map((c) => {
                const verified = c.verified_at != null;
                return (
                  <li
                    key={c.id}
                    className="rounded-md border p-2.5 space-y-1.5"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised, transparent)" }}
                  >
                    <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                      {c.claim_text}
                    </p>
                    {c.source_span && (
                      <p
                        className="text-[11px] pl-2"
                        style={{ color: "var(--color-text-secondary)", borderLeft: "2px solid var(--color-border)" }}
                      >
                        <span style={{ color: "var(--color-text-muted)" }}>source span: </span>
                        “{c.source_span}”
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      {verified ? (
                        <span className="text-[11px] inline-flex items-center gap-1" style={{ color: "var(--color-success, var(--color-primary))" }}>
                          <CheckCircle2 size={12} aria-hidden="true" />
                          Verified by {c.verified_by || "—"} · {c.verified_at ? new Date(c.verified_at).toLocaleString() : ""}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => tick(item.id, c.id)}
                          disabled={ticking === c.id}
                          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded"
                          style={{
                            color: "var(--color-primary)",
                            border: "1px solid var(--color-primary)",
                            backgroundColor: "transparent",
                            cursor: ticking === c.id ? "default" : "pointer",
                          }}
                        >
                          {ticking === c.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                          Verify claim
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
