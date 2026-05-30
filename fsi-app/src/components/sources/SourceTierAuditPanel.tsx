"use client";

import { useState } from "react";
import { Loader2, Sparkles, Check, Flag } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * SourceTierAuditPanel — Sprint 4 Block 1 task 1.15 (UNVERIFIED-PENDING-RUNTIME).
 *
 * The Phase 1.5 source-tier audit affordance, rendered inside ProvisionalReviewCard
 * (provisional) and reusable for SEEDED sources. Per source: current base_tier, a
 * Haiku tier RECOMMENDATION (kind:'recommendation' — labeled as a recommendation,
 * NOT an asserted fact, per the integrity rule) with confidence + rationale, and
 * accept / override / flag-as-ambiguous controls that commit via commit-tier-change.
 *
 * Do NOT run a tier pass in Block 1 — recommend-tier spends Haiku per source and is
 * operator-triggered during Phase 1.5. Render-verify the panel now; the
 * recommend + commit round-trips are runtime-verified next session.
 */

interface TierRecommendation {
  recommended_tier: number;
  confidence: "high" | "medium" | "low";
  rationale: string;
  kind: "recommendation";
}

interface Props {
  sourceId: string;
  currentBaseTier: number | null;
  kind: "seeded" | "provisional";
  onCommitted?: (tier: number) => void;
}

export function SourceTierAuditPanel({ sourceId, currentBaseTier, kind, onCommitted }: Props) {
  const supabase = createSupabaseBrowserClient();
  const [rec, setRec] = useState<TierRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState<number | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` };
  }

  async function getRecommendation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sources/recommend-tier", {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify({ source_id: sourceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRec(json.recommendation as TierRecommendation);
      setOverride((json.recommendation as TierRecommendation).recommended_tier);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function commit(tier: number) {
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sources/commit-tier-change", {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify({ source_id: sourceId, tier, kind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setDone(tier);
      onCommitted?.(tier);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="rounded-md border p-3 mt-3 space-y-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised, transparent)" }}>
      <div className="flex items-center justify-between">
        <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Source-tier audit
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>
          current base_tier: {currentBaseTier == null ? "—" : `T${currentBaseTier}`}
        </span>
      </div>

      {done != null ? (
        <p className="inline-flex items-center gap-1" style={{ color: "var(--color-success, var(--color-primary))" }}>
          <Check size={12} /> Committed base_tier = T{done}
        </p>
      ) : (
        <>
          {!rec && (
            <button
              type="button"
              onClick={getRecommendation}
              disabled={loading}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border"
              style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)" }}
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Recommend tier (Haiku)
            </button>
          )}

          {rec && (
            <div className="space-y-1.5">
              <p style={{ color: "var(--color-text-secondary)" }}>
                <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Recommendation (not asserted fact):
                </span>{" "}
                T{rec.recommended_tier} · confidence {rec.confidence}
              </p>
              <p style={{ color: "var(--color-text-secondary)" }}>{rec.rationale}</p>

              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1" style={{ color: "var(--color-text-secondary)" }}>
                  tier
                  <select
                    value={override ?? rec.recommended_tier}
                    onChange={(e) => setOverride(Number(e.target.value))}
                    className="px-1 py-0.5 rounded border"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((t) => <option key={t} value={t}>T{t}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => commit(override ?? rec.recommended_tier)}
                  disabled={committing || flagged}
                  className="px-2 py-1 rounded"
                  style={{ backgroundColor: "var(--color-success)", color: "#fff", opacity: flagged ? 0.5 : 1 }}
                >
                  {committing ? "Committing…" : (override === rec.recommended_tier ? "Accept" : "Commit override")}
                </button>
                <button
                  type="button"
                  onClick={() => setFlagged((f) => !f)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border"
                  style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}
                >
                  <Flag size={11} /> {flagged ? "Flagged ambiguous" : "Flag ambiguous"}
                </button>
              </div>
              {flagged && (
                <p style={{ color: "var(--color-warning)" }}>
                  Flagged for operator decision — not committed. (Ambiguous tier stays for review, not guessed.)
                </p>
              )}
            </div>
          )}
        </>
      )}

      {error && <p style={{ color: "var(--color-error, var(--color-critical))" }}>{error}</p>}
    </div>
  );
}
