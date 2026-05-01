"use client";

// Canonical Source Issues review UI.
//
// Pulls /api/admin/canonical-sources/pending on mount, groups candidates
// by intelligence_item, displays per-item cards with approve/reject/edit/
// defer actions. Approve flow with new-source insert mirrors the
// ProvisionalReviewCard pattern: when a candidate URL is not yet in the
// sources registry, expanding the candidate fetches an AI-recommended
// classification (Haiku, cached on canonical_source_candidates.recommended_classification).
//
// Bulk-approve button surfaces only verified high-confidence candidates
// whose URLs already exist in the registry OR whose AI classification is
// cached. Items requiring individual classification are surfaced back
// for one-by-one review.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, ExternalLink, AlertTriangle, CheckCircle2, XCircle, Filter, Layers } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface Candidate {
  id: string;
  intelligence_item_id: string;
  candidate_url: string;
  candidate_title: string | null;
  candidate_publisher: string | null;
  confidence: "high" | "medium" | "low";
  rationale: string | null;
  verified: boolean;
  verified_status_code: number | null;
  verified_content_excerpt: string | null;
  issue_classification: "stale_url" | "missing_link" | "missing_source" | "thin_match";
  decision: "pending" | "approved" | "rejected" | "deferred";
  recommended_classification: Recommendation | null;
  existing_source_id: string | null;
  current_source_url: string | null;
}
interface Group {
  item_id: string;
  item: {
    id: string;
    legacy_id: string | null;
    title: string;
    item_type: string;
    domain: number | null;
    jurisdictions: string[] | null;
    topic_tags: string[] | null;
    source_id: string | null;
    source_url: string | null;
  } | null;
  issue_classification: string;
  candidates: Candidate[];
}
interface Stats {
  total: number;
  items: number;
  by_confidence: Record<string, number>;
  by_issue: Record<string, number>;
  high_conf_verified: number;
  high_conf_unverified: number;
  medium: number;
  low: number;
}
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
  { v: 1, label: "Reg" },
  { v: 2, label: "Tech" },
  { v: 3, label: "Reg-Ops" },
  { v: 4, label: "Geo" },
  { v: 5, label: "Src" },
  { v: 6, label: "Fac" },
  { v: 7, label: "Res" },
];

export function CanonicalSourceReview() {
  const supabase = createSupabaseBrowserClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [confFilter, setConfFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "verified" | "unverified">("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "stale_url" | "missing_link" | "missing_source">("all");

  // Bulk approve
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);

  // Pre-cache classifications (server-side batch Haiku calls)
  const [precacheRunning, setPrecacheRunning] = useState(false);
  const [precacheProgress, setPrecacheProgress] = useState<{ done: number; total: number } | null>(null);
  const [precacheError, setPrecacheError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/canonical-sources/pending", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Failed to load");
      } else {
        setGroups(payload.groups);
        setStats(payload.stats);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter groups & candidates client-side for snappy UI
  const visibleGroups = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        candidates: g.candidates.filter((c) => {
          if (confFilter !== "all" && c.confidence !== confFilter) return false;
          if (verifiedFilter === "verified" && !c.verified) return false;
          if (verifiedFilter === "unverified" && c.verified) return false;
          return true;
        }),
      }))
      .filter((g) => {
        if (issueFilter !== "all" && g.issue_classification !== issueFilter) return false;
        return g.candidates.length > 0;
      });
  }, [groups, confFilter, verifiedFilter, issueFilter]);

  // Bulk-eligible candidates: any high-confidence row that already has a
  // cached AI classification or an existing-registry-source match. Verified
  // status was previously a hard requirement, but unverified just means the
  // verifier's title-overlap probe got a Cloudflare 403 on intergovernmental
  // sites — most are still legitimately the right canonical source. The
  // user's domain-allowlist judgment in the review prompt is the gate;
  // bulk-eligible widens the pool to whatever has been classified.
  const bulkEligible = useMemo(() => {
    const out: Candidate[] = [];
    for (const g of groups) {
      for (const c of g.candidates) {
        if (c.confidence !== "high") continue;
        if (!c.existing_source_id && !c.recommended_classification) continue;
        out.push(c);
      }
    }
    return out;
  }, [groups]);

  // High-confidence candidates that COULD be bulk-approved if we cached
  // their AI classification. Drives the "Pre-cache N classifications"
  // button — once these are cached, they roll into bulkEligible.
  const precacheCandidates = useMemo(() => {
    const out: Candidate[] = [];
    for (const g of groups) {
      for (const c of g.candidates) {
        if (c.confidence !== "high") continue;
        if (c.existing_source_id) continue; // existing source, no classification needed
        if (c.recommended_classification) continue; // already cached
        out.push(c);
      }
    }
    return out;
  }, [groups]);

  function removeCandidate(candidateId: string) {
    setGroups((gs) =>
      gs
        .map((g) => ({ ...g, candidates: g.candidates.filter((c) => c.id !== candidateId) }))
        .filter((g) => g.candidates.length > 0)
    );
  }

  // Server-side batch Haiku classification. Drives "Pre-cache N classifications"
  // button — replaces the per-card expand-and-wait flow that triggers CDP
  // timeouts in agent-driven review tabs. Calls the bulk-classify endpoint
  // in chunks of 25 (within Vercel's 60s function timeout, ~12s per call
  // at 5 concurrent Haiku × 2s each).
  async function runPrecache() {
    setPrecacheRunning(true);
    setPrecacheError(null);
    setPrecacheProgress({ done: 0, total: precacheCandidates.length });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const ids = precacheCandidates.map((c) => c.id);
      const CHUNK = 25;
      let done = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const res = await fetch("/api/admin/canonical-sources/bulk-classify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ candidateIds: slice }),
        });
        const payload = await res.json();
        if (!res.ok) {
          setPrecacheError(payload.error || `Batch failed at ${i}/${ids.length}`);
          break;
        }
        done += slice.length;
        setPrecacheProgress({ done, total: ids.length });
      }
      // Reload candidates so the now-cached classifications appear in
      // bulkEligible and the precache button disappears.
      await load();
    } catch (e: any) {
      setPrecacheError(e.message);
    } finally {
      setPrecacheRunning(false);
    }
  }

  async function runBulk() {
    setBulkRunning(true);
    setBulkResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/canonical-sources/bulk-approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          candidateIds: bulkEligible.map((c) => c.id),
          reviewerNotes: "Bulk approval of high-confidence verified canonical candidates",
        }),
      });
      const payload = await res.json();
      setBulkResult(payload);
      // Reload to reflect server state
      await load();
    } catch (e: any) {
      setBulkResult({ error: e.message });
    } finally {
      setBulkRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--color-text-muted)" }}>
        <Loader2 size={14} className="animate-spin" /> Loading canonical source candidates…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-3 rounded text-sm" style={{ backgroundColor: "var(--color-error)15", color: "var(--color-error)" }}>
        {error}
      </div>
    );
  }
  if (!stats || stats.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 size={24} style={{ color: "var(--color-success)" }} />
        <h3 className="mt-3 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          No pending canonical source candidates
        </h3>
        <p className="mt-1 text-xs max-w-sm" style={{ color: "var(--color-text-secondary)" }}>
          When the discovery agent finds replacement sources for items with stale, missing, or thin coverage, they appear here for review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox label="Pending" value={stats.total} />
        <StatBox label="Items affected" value={stats.items} />
        <StatBox label="High + verified" value={stats.high_conf_verified} accent="success" />
        <StatBox label="High unverified" value={stats.high_conf_unverified} accent="warning" />
        <StatBox label="Medium" value={stats.medium} />
        <StatBox label="Low" value={stats.low} />
      </div>

      {/* Pre-cache classifications banner — appears when there are
          high-confidence candidates without cached AI classification.
          Server-side batch path avoids the per-card expand-and-wait
          flow that freezes the renderer. */}
      {precacheCandidates.length > 0 && (
        <div
          className="p-3 rounded-lg border flex items-center justify-between gap-3"
          style={{
            borderColor: "var(--color-warning)50",
            backgroundColor: "var(--color-warning)10",
          }}
        >
          <div className="text-sm">
            <strong style={{ color: "var(--color-text-primary)" }}>{precacheCandidates.length}</strong>
            <span style={{ color: "var(--color-text-secondary)" }}>
              {" "}high-confidence candidates need AI classification before bulk approve
            </span>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Runs server-side in batches of 25 (~12s each at 5 concurrent Haiku calls). No per-card expansion needed — once done, these roll into the bulk-approve banner.
            </div>
            {precacheProgress && precacheRunning && (
              <div className="text-[11px] mt-1" style={{ color: "var(--color-warning)" }}>
                Classifying {precacheProgress.done} / {precacheProgress.total}…
              </div>
            )}
            {precacheError && (
              <div className="text-[11px] mt-1" style={{ color: "var(--color-error)" }}>
                {precacheError}
              </div>
            )}
          </div>
          <button
            onClick={runPrecache}
            disabled={precacheRunning}
            className="px-3 py-1.5 text-xs font-medium rounded shrink-0 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-warning)", color: "#fff" }}
          >
            {precacheRunning ? "Classifying…" : `Pre-cache ${precacheCandidates.length}`}
          </button>
        </div>
      )}

      {/* Bulk approve banner */}
      {bulkEligible.length > 0 && (
        <div
          className="p-3 rounded-lg border flex items-center justify-between gap-3"
          style={{
            borderColor: "var(--color-primary)50",
            backgroundColor: "var(--color-primary)10",
          }}
        >
          <div className="text-sm">
            <strong style={{ color: "var(--color-text-primary)" }}>{bulkEligible.length}</strong>
            <span style={{ color: "var(--color-text-secondary)" }}>
              {" "}high-confidence candidates eligible for bulk approve
            </span>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              URL already in registry or AI classification cached. Includes unverified — title-overlap probe often hits Cloudflare 403 on intergovernmental sites.
            </div>
          </div>
          <button
            onClick={() => setBulkOpen(true)}
            className="px-3 py-1.5 text-xs font-medium rounded shrink-0"
            style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
          >
            Bulk approve
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Filter size={12} style={{ color: "var(--color-text-muted)" }} />
        <FilterPills
          label="Confidence"
          options={[
            { v: "all", label: "all" },
            { v: "high", label: `high (${stats.by_confidence.high || 0})` },
            { v: "medium", label: `med (${stats.by_confidence.medium || 0})` },
            { v: "low", label: `low (${stats.by_confidence.low || 0})` },
          ]}
          value={confFilter}
          onChange={(v) => setConfFilter(v as any)}
        />
        <FilterPills
          label="Verified"
          options={[
            { v: "all", label: "all" },
            { v: "verified", label: "verified" },
            { v: "unverified", label: "unverified" },
          ]}
          value={verifiedFilter}
          onChange={(v) => setVerifiedFilter(v as any)}
        />
        <FilterPills
          label="Issue"
          options={[
            { v: "all", label: "all" },
            { v: "stale_url", label: `stale (${stats.by_issue.stale_url || 0})` },
            { v: "missing_link", label: `missing link (${stats.by_issue.missing_link || 0})` },
            { v: "missing_source", label: `missing source (${stats.by_issue.missing_source || 0})` },
          ]}
          value={issueFilter}
          onChange={(v) => setIssueFilter(v as any)}
        />
      </div>

      {/* Bulk modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !bulkRunning && setBulkOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-lg border max-h-[80vh] overflow-y-auto"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
              <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Bulk approve {bulkEligible.length} high-confidence verified candidates
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                For each candidate: if URL already in registry, the existing source is reused. Otherwise a new source is created using cached AI classification. intelligence_items.source_id is updated. Audit trail written. Items without cached classification are surfaced for individual review.
              </div>
            </div>

            <div className="p-4 max-h-[40vh] overflow-y-auto">
              {bulkResult ? (
                <div className="space-y-2 text-xs">
                  <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>Result</div>
                  {bulkResult.error ? (
                    <div style={{ color: "var(--color-error)" }}>{bulkResult.error}</div>
                  ) : (
                    <>
                      <div>Approved: <strong>{bulkResult.approved}</strong> of {bulkResult.total}</div>
                      <div>New sources created: <strong>{bulkResult.created_sources}</strong></div>
                      <div>Failed: <strong style={{ color: "var(--color-error)" }}>{bulkResult.failed}</strong></div>
                      <div>Requires individual review: <strong>{bulkResult.requires_individual_review}</strong></div>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-xs space-y-1" style={{ color: "var(--color-text-secondary)" }}>
                  {bulkEligible.slice(0, 25).map((c) => (
                    <div key={c.id} className="truncate">
                      [{c.confidence}] {c.candidate_title || c.candidate_url}
                    </div>
                  ))}
                  {bulkEligible.length > 25 && <div>… and {bulkEligible.length - 25} more</div>}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--color-border-subtle)" }}>
              <button
                onClick={() => setBulkOpen(false)}
                disabled={bulkRunning}
                className="px-3 py-1.5 text-xs rounded border"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                {bulkResult ? "Close" : "Cancel"}
              </button>
              {!bulkResult && (
                <button
                  onClick={runBulk}
                  disabled={bulkRunning}
                  className="px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-success)", color: "#fff" }}
                >
                  {bulkRunning ? "Approving…" : `Approve ${bulkEligible.length}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Group cards */}
      <div className="space-y-3">
        {visibleGroups.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>
            No candidates match the current filters.
          </div>
        ) : (
          visibleGroups.map((g) => (
            <ItemGroup key={g.item_id} group={g} onCandidateActioned={removeCandidate} />
          ))
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: number; accent?: "success" | "warning" }) {
  const color =
    accent === "success" ? "var(--color-success)" :
    accent === "warning" ? "var(--color-warning)" :
    "var(--color-text-primary)";
  return (
    <div
      className="p-3 rounded-lg"
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      <div className="text-xl font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function FilterPills({
  label, options, value, onChange,
}: {
  label: string;
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: "var(--color-text-muted)" }}>{label}:</span>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className="px-2 py-0.5 rounded border"
          style={{
            borderColor: value === o.v ? "var(--color-primary)" : "var(--color-border)",
            backgroundColor: value === o.v ? "var(--color-primary)20" : "var(--color-surface)",
            color: "var(--color-text-primary)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ItemGroup({
  group,
  onCandidateActioned,
}: {
  group: Group;
  onCandidateActioned: (id: string) => void;
}) {
  const issueColor =
    group.issue_classification === "stale_url" ? "var(--color-error)" :
    group.issue_classification === "missing_link" ? "var(--color-warning)" :
    "var(--color-text-muted)";

  return (
    <div
      className="rounded-lg border"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      {/* Item header */}
      <div className="p-4 border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
        <div className="flex items-start gap-3">
          <Layers size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {group.item?.title || "(unknown item)"}
              </span>
              {group.item?.legacy_id && (
                <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-muted)" }}>
                  {group.item.legacy_id}
                </span>
              )}
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "var(--color-surface-raised)", color: issueColor }}
              >
                {group.issue_classification.replace("_", " ")}
              </span>
              <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {group.item?.item_type}
              </span>
            </div>
            {group.item?.source_url && (
              <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                Current: <span className="font-mono">{group.item.source_url}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Candidates */}
      <div className="divide-y" style={{ borderColor: "var(--color-border-subtle)" }}>
        {group.candidates.map((c) => (
          <CandidateRow
            key={c.id}
            cand={c}
            onActionDone={() => onCandidateActioned(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateRow({ cand, onActionDone }: { cand: Candidate; onActionDone: () => void }) {
  const supabase = createSupabaseBrowserClient();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState<null | "approve" | "reject" | "defer">(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Editable candidate fields
  const [editUrl, setEditUrl] = useState(cand.candidate_url);
  const [editTitle, setEditTitle] = useState(cand.candidate_title || "");
  const [editPublisher, setEditPublisher] = useState(cand.candidate_publisher || "");
  const [editing, setEditing] = useState(false);

  // AI classification (only relevant when no existing source)
  const needsClassification = !cand.existing_source_id;
  const [rec, setRec] = useState<Recommendation | null>(cand.recommended_classification || null);
  const [recLoading, setRecLoading] = useState(false);

  // Editable classification, seeded from rec when available
  const [tier, setTier] = useState<number>(rec?.tier ?? 4);
  const [domains, setDomains] = useState<number[]>(rec?.domains ?? []);
  const [jurisdictions, setJurisdictions] = useState<string[]>(rec?.jurisdictions ?? []);
  const [modes, setModes] = useState<string[]>(rec?.transport_modes ?? []);
  const [topics, setTopics] = useState<string[]>(rec?.topic_tags ?? []);
  const [notes, setNotes] = useState("");

  // Fetch recommendation when expanded and needed
  useEffect(() => {
    if (!expanded || !needsClassification || rec || recLoading) return;
    let cancelled = false;
    (async () => {
      setRecLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/canonical-sources/recommend-classification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ candidateId: cand.id }),
        });
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setErrMsg(payload.error || "Recommendation failed");
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
        if (!cancelled) setErrMsg(e.message);
      } finally {
        if (!cancelled) setRecLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle<T>(value: T, list: T[], setter: (l: T[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function submit(decision: "approve" | "reject" | "defer") {
    setSubmitting(decision);
    setErrMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: any = { candidateId: cand.id, decision, reviewerNotes: notes };
      if (editing) {
        body.editedFields = {
          candidate_url: editUrl,
          candidate_title: editTitle,
          candidate_publisher: editPublisher,
        };
      }
      if (decision === "approve") {
        if (cand.existing_source_id) {
          body.existingSourceId = cand.existing_source_id;
        } else {
          body.tier = tier;
          body.domains = domains;
          body.jurisdictions = jurisdictions;
          body.transport_modes = modes;
          body.topic_tags = topics;
        }
      }
      const res = await fetch("/api/admin/canonical-sources/decide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        setErrMsg(payload.error || "Action failed");
        setSubmitting(null);
        return;
      }
      onActionDone();
    } catch (e: any) {
      setErrMsg(e.message);
      setSubmitting(null);
    }
  }

  const confColor =
    cand.confidence === "high" ? "var(--color-success)" :
    cand.confidence === "medium" ? "var(--color-warning)" :
    "var(--color-text-muted)";

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 text-left flex items-start gap-3 hover:bg-[var(--color-surface-raised)]"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
              style={{ color: confColor, backgroundColor: "var(--color-surface-raised)" }}
            >
              {cand.confidence}
            </span>
            {cand.verified ? (
              <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--color-success)" }}>
                <CheckCircle2 size={10} /> verified
              </span>
            ) : (
              <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
                <XCircle size={10} /> unverified {cand.verified_status_code ? `(${cand.verified_status_code})` : ""}
              </span>
            )}
            {cand.existing_source_id && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-primary)20", color: "var(--color-primary)" }}>
                already in registry
              </span>
            )}
            <span className="text-xs font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
              {cand.candidate_title || cand.candidate_publisher || cand.candidate_url}
            </span>
          </div>
          <div className="text-[11px] truncate font-mono" style={{ color: "var(--color-primary)" }}>
            {cand.candidate_url}
          </div>
          {cand.candidate_publisher && cand.candidate_title && (
            <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {cand.candidate_publisher}
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <a
            href={cand.candidate_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs mt-2"
            style={{ color: "var(--color-primary)" }}
          >
            Open candidate URL <ExternalLink size={11} />
          </a>

          {/* Discovery rationale */}
          {cand.rationale && (
            <div className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Discovery rationale: </span>
              {cand.rationale}
            </div>
          )}

          {/* Edit candidate fields toggle */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setEditing(!editing)}
              className="text-[11px] px-2 py-0.5 rounded border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              {editing ? "Cancel edit" : "Edit candidate"}
            </button>
          </div>
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
              <label className="flex flex-col gap-1 sm:col-span-3">
                <span style={{ color: "var(--color-text-secondary)" }}>URL</span>
                <input
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="px-2 py-1 rounded border font-mono"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span style={{ color: "var(--color-text-secondary)" }}>Title</span>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="px-2 py-1 rounded border"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ color: "var(--color-text-secondary)" }}>Publisher</span>
                <input
                  value={editPublisher}
                  onChange={(e) => setEditPublisher(e.target.value)}
                  className="px-2 py-1 rounded border"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
                />
              </label>
            </div>
          )}

          {/* AI classification (only when creating new source) */}
          {needsClassification && (
            <div className="mt-3">
              {recLoading && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  <Loader2 size={12} className="animate-spin" /> Loading AI classification…
                </div>
              )}
              {rec && (
                <div className="text-xs mb-2 p-2 rounded" style={{ backgroundColor: "var(--color-surface-raised)", color: "var(--color-text-secondary)" }}>
                  <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>AI rationale: </span>
                  {rec.rationale}
                  {rec.computed_at && (
                    <span className="block mt-0.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      {rec.model || "claude-haiku-4-5-20251001"} · {new Date(rec.computed_at).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
              {rec && (
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
                  <PillPicker label="Domains" options={ALL_DOMAINS.map((d) => ({ v: d.v as any, label: String(d.v) }))} selected={domains} onToggle={(v) => toggle(v as number, domains, setDomains)} />
                  <PillPicker label="Jurisdictions" options={ALL_JURISDICTIONS.map((j) => ({ v: j, label: j }))} selected={jurisdictions} onToggle={(v) => toggle(v as string, jurisdictions, setJurisdictions)} />
                  <PillPicker label="Transport modes" options={ALL_MODES.map((m) => ({ v: m, label: m }))} selected={modes} onToggle={(v) => toggle(v as string, modes, setModes)} />
                  <div className="sm:col-span-2">
                    <PillPicker label="Topic tags" options={ALL_TOPICS.map((t) => ({ v: t, label: t }))} selected={topics} onToggle={(v) => toggle(v as string, topics, setTopics)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reviewer notes */}
          <label className="flex flex-col gap-1 mt-3 text-xs">
            <span style={{ color: "var(--color-text-secondary)" }}>Reviewer notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Why approving / rejecting / deferring"
              className="px-2 py-1 rounded border resize-y"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
            />
          </label>

          {errMsg && (
            <div className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: "var(--color-error)15", color: "var(--color-error)" }}>
              {errMsg}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => submit("approve")}
              disabled={submitting !== null || (needsClassification && (!rec || domains.length === 0))}
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
            {needsClassification && rec && domains.length === 0 && (
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                <AlertTriangle size={10} className="inline mr-0.5" /> Approve requires ≥1 domain
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PillPicker<T extends string | number>({
  label, options, selected, onToggle,
}: {
  label: string;
  options: { v: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o.v)}
            onClick={() => onToggle(o.v)}
            className="px-2 py-0.5 text-[11px] rounded border"
            style={{
              borderColor: selected.includes(o.v) ? "var(--color-primary)" : "var(--color-border)",
              backgroundColor: selected.includes(o.v) ? "var(--color-primary)20" : "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
