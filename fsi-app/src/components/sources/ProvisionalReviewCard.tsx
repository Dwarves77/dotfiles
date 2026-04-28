"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, ExternalLink } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { ProvisionalSource } from "@/types/source";

interface Recommendation {
  tier: number;
  domains: number[];
  jurisdictions: string[];
  transport_modes: string[];
  topic_tags: string[];
  rationale: string;
  model?: string;
  computed_at?: string;
}

const ALL_JURISDICTIONS = ["eu", "us", "uk", "latam", "asia", "hk", "meaf", "global"];
const ALL_MODES = ["air", "road", "ocean", "rail"];
const ALL_TOPICS = ["emissions", "fuels", "transport", "reporting", "packaging", "corridors", "research"];
const ALL_DOMAINS = [
  { v: 1, label: "Regulatory" },
  { v: 2, label: "Tech/Energy" },
  { v: 3, label: "Regional Ops" },
  { v: 4, label: "Geopolitical" },
  { v: 5, label: "Source Intel" },
  { v: 6, label: "Facilities" },
  { v: 7, label: "Research" },
];

interface Props {
  ps: ProvisionalSource & { recommended_classification?: Recommendation | null };
  onActionDone: (id: string, action: "approve" | "reject" | "defer") => void;
}

export function ProvisionalReviewCard({ ps, onActionDone }: Props) {
  const supabase = createSupabaseBrowserClient();
  const [expanded, setExpanded] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(ps.recommended_classification || null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<null | "approve" | "reject" | "defer">(null);

  // Editable fields, seeded from recommendation when available
  const [tier, setTier] = useState<number>(ps.recommended_classification?.tier ?? 4);
  const [domains, setDomains] = useState<number[]>(ps.recommended_classification?.domains ?? []);
  const [jurisdictions, setJurisdictions] = useState<string[]>(ps.recommended_classification?.jurisdictions ?? []);
  const [modes, setModes] = useState<string[]>(ps.recommended_classification?.transport_modes ?? []);
  const [topics, setTopics] = useState<string[]>(ps.recommended_classification?.topic_tags ?? []);
  const [notes, setNotes] = useState("");

  // Fetch recommendation when card expands (and not already loaded/cached)
  useEffect(() => {
    if (!expanded || rec || recLoading) return;
    let cancelled = false;
    (async () => {
      setRecLoading(true);
      setRecError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/sources/recommend-classification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ provisionalSourceId: ps.id }),
        });
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setRecError(payload.error || "Recommendation failed");
        } else {
          const r = payload.recommendation as Recommendation;
          setRec(r);
          setTier(r.tier);
          setDomains(r.domains);
          setJurisdictions(r.jurisdictions);
          setModes(r.transport_modes);
          setTopics(r.topic_tags);
        }
      } catch (e: any) {
        if (!cancelled) setRecError(e.message);
      } finally {
        if (!cancelled) setRecLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(decision: "approve" | "reject" | "defer") {
    if (decision !== "defer" && decision === "approve" && !tier) return;
    setSubmitting(decision);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: any = { provisionalSourceId: ps.id, decision, reviewerNotes: notes };
      if (decision === "approve") {
        body.tier = tier;
        body.domains = domains;
        body.jurisdictions = jurisdictions;
        body.transport_modes = modes;
        body.topic_tags = topics;
      }
      const res = await fetch("/api/admin/sources/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        setRecError(payload.error || "Action failed");
        setSubmitting(null);
        return;
      }
      onActionDone(ps.id, decision);
    } catch (e: any) {
      setRecError(e.message);
      setSubmitting(null);
    }
  }

  function toggle<T>(value: T, list: T[], setter: (l: T[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-start gap-3 hover:bg-[var(--color-surface-raised)] rounded-t-lg"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
              {ps.name}
            </span>
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded shrink-0"
              style={{
                color: ps.status === "pending_review" ? "var(--color-warning)" : "var(--color-text-secondary)",
                backgroundColor: "var(--color-surface-raised)",
              }}
            >
              {ps.status.replace("_", " ")}
            </span>
          </div>
          <div className="text-xs truncate" style={{ color: "var(--color-primary)" }}>{ps.url}</div>
          <div className="flex items-center gap-4 mt-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            <span>{ps.independent_citers} independent citer{ps.independent_citers !== 1 ? "s" : ""}</span>
            <span>Discovered: {ps.discovered_via.replace("_", " ")}</span>
            {ps.highest_citing_tier ? <span>Highest citer: T{ps.highest_citing_tier}</span> : null}
            {rec ? <span style={{ color: "var(--color-primary)" }}>AI rec: T{rec.tier}</span> : null}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="p-4 pt-0 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <a
            href={ps.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs mb-3 mt-3"
            style={{ color: "var(--color-primary)" }}
          >
            Open source <ExternalLink size={11} />
          </a>

          {/* AI recommendation status */}
          {recLoading && (
            <div className="flex items-center gap-2 text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
              <Loader2 size={12} className="animate-spin" /> Loading AI recommendation…
            </div>
          )}
          {rec && (
            <div className="text-xs mb-3 p-2 rounded" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>AI rationale: </span>
              {rec.rationale}
              {rec.computed_at && (
                <span className="block mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  {rec.model || "claude-haiku-4-5-20251001"} · {new Date(rec.computed_at).toLocaleString()}
                </span>
              )}
            </div>
          )}
          {recError && (
            <div className="text-xs mb-3 p-2 rounded" style={{ backgroundColor: "var(--color-error)15", color: "var(--color-error)" }}>
              {recError}
            </div>
          )}

          {/* Editable classification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span style={{ color: "var(--color-text-secondary)" }}>Tier (1-7)</span>
              <select
                value={tier}
                onChange={(e) => setTier(Number(e.target.value))}
                className="px-2 py-1 rounded border"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((t) => <option key={t} value={t}>T{t}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span style={{ color: "var(--color-text-secondary)" }}>Domains</span>
              <div className="flex flex-wrap gap-1">
                {ALL_DOMAINS.map((d) => (
                  <button
                    key={d.v}
                    onClick={() => toggle(d.v, domains, setDomains)}
                    className="px-2 py-0.5 text-[11px] rounded border"
                    style={{
                      borderColor: domains.includes(d.v) ? "var(--color-primary)" : "var(--color-border)",
                      backgroundColor: domains.includes(d.v) ? "var(--color-primary)20" : "var(--color-surface)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {d.v}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span style={{ color: "var(--color-text-secondary)" }}>Jurisdictions</span>
              <div className="flex flex-wrap gap-1">
                {ALL_JURISDICTIONS.map((j) => (
                  <button
                    key={j}
                    onClick={() => toggle(j, jurisdictions, setJurisdictions)}
                    className="px-2 py-0.5 text-[11px] rounded border"
                    style={{
                      borderColor: jurisdictions.includes(j) ? "var(--color-primary)" : "var(--color-border)",
                      backgroundColor: jurisdictions.includes(j) ? "var(--color-primary)20" : "var(--color-surface)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {j}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span style={{ color: "var(--color-text-secondary)" }}>Transport modes</span>
              <div className="flex flex-wrap gap-1">
                {ALL_MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => toggle(m, modes, setModes)}
                    className="px-2 py-0.5 text-[11px] rounded border"
                    style={{
                      borderColor: modes.includes(m) ? "var(--color-primary)" : "var(--color-border)",
                      backgroundColor: modes.includes(m) ? "var(--color-primary)20" : "var(--color-surface)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span style={{ color: "var(--color-text-secondary)" }}>Topic tags</span>
              <div className="flex flex-wrap gap-1">
                {ALL_TOPICS.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggle(t, topics, setTopics)}
                    className="px-2 py-0.5 text-[11px] rounded border"
                    style={{
                      borderColor: topics.includes(t) ? "var(--color-primary)" : "var(--color-border)",
                      backgroundColor: topics.includes(t) ? "var(--color-primary)20" : "var(--color-surface)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span style={{ color: "var(--color-text-secondary)" }}>Reviewer notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional context: why approving, why rejecting, what to revisit"
                className="px-2 py-1 rounded border resize-y"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
              />
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => submit("approve")}
              disabled={submitting !== null || domains.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50"
              style={{ backgroundColor: "var(--color-success)", color: "#fff" }}
            >
              {submitting === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              onClick={() => submit("reject")}
              disabled={submitting !== null}
              className="px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50"
              style={{ backgroundColor: "var(--color-error)", color: "#fff" }}
            >
              {submitting === "reject" ? "Rejecting…" : "Reject"}
            </button>
            <button
              onClick={() => submit("defer")}
              disabled={submitting !== null}
              className="px-3 py-1.5 text-xs font-medium rounded border disabled:opacity-50"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
            >
              {submitting === "defer" ? "Saving…" : "Defer"}
            </button>
            {domains.length === 0 && (
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                Approve requires at least one domain
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
