"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { useSourceStore, filterSources } from "@/stores/sourceStore";
import { SOURCE_TIER_DEFINITIONS } from "@/types/source";
import type { Source, SourceTier } from "@/types/source";
import { DOMAINS } from "@/lib/constants";
import {
  Database, AlertTriangle, CheckCircle, XCircle,
  Clock, Eye, Search, ChevronDown, ExternalLink,
  Shield, Activity,
} from "lucide-react";
import { ProvisionalReviewCard } from "@/components/sources/ProvisionalReviewCard";
import { GlobalPauseToggle, SourceRowControls } from "@/components/sources/SourceAdminControls";

// ── Tier Summary Card ──

function TierSummaryCard({ tier, sources }: { tier: SourceTier; sources: Source[] }) {
  const def = SOURCE_TIER_DEFINITIONS[tier];
  const tierSources = sources.filter((s) => s.tier === tier);
  const active = tierSources.filter((s) => s.status === "active").length;
  const stale = tierSources.filter((s) => s.status === "stale").length;
  const inaccessible = tierSources.filter((s) => s.status === "inaccessible").length;
  const avgTrust = tierSources.length > 0
    ? Math.round(tierSources.reduce((sum, s) => sum + s.trust_score.overall, 0) / tierSources.length)
    : 0;

  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          T{tier}
        </span>
        <span className="text-xs font-medium tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
          {tierSources.length} source{tierSources.length !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
        {def.label}
      </p>
      <div className="flex items-center gap-3 text-xs tabular-nums">
        <span className="flex items-center gap-1" style={{ color: "var(--color-success)" }}>
          <CheckCircle size={12} /> {active}
        </span>
        {stale > 0 && (
          <span className="flex items-center gap-1" style={{ color: "var(--color-warning)" }}>
            <Clock size={12} /> {stale}
          </span>
        )}
        {inaccessible > 0 && (
          <span className="flex items-center gap-1" style={{ color: "var(--color-error)" }}>
            <XCircle size={12} /> {inaccessible}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div
          className="flex-1 h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--color-surface-raised)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${avgTrust}%`,
              backgroundColor: avgTrust >= 70 ? "var(--color-success)" : avgTrust >= 40 ? "var(--color-warning)" : "var(--color-error)",
            }}
          />
        </div>
        <span className="text-[11px] tabular-nums font-medium" style={{ color: "var(--color-text-muted)" }}>
          {avgTrust}
        </span>
      </div>
    </div>
  );
}

// ── Source Row ──

function SourceRow({ source }: { source: Source }) {
  const { expandedSourceId, setExpandedSource } = useSourceStore();
  const isExpanded = expandedSourceId === source.id;

  const statusColor = {
    active: "var(--color-success)",
    stale: "var(--color-warning)",
    inaccessible: "var(--color-error)",
    provisional: "var(--color-text-muted)",
    suspended: "var(--color-error)",
  }[source.status];

  return (
    <div
      className="border rounded-lg overflow-hidden transition-all duration-200"
      style={{
        borderColor: isExpanded ? "var(--color-border-strong)" : "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <button
        onClick={() => setExpandedSource(isExpanded ? null : source.id)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
      >
        {/* Status dot */}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: statusColor }}
        />

        {/* Tier badge */}
        <span
          className="text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 tabular-nums"
          style={{
            color: "var(--color-text-secondary)",
            backgroundColor: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
          }}
        >
          T{source.tier}
        </span>

        {/* Name */}
        <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
          {source.name}
        </span>

        {/* Trust score */}
        <span className="text-xs tabular-nums font-medium shrink-0" style={{ color: "var(--color-text-secondary)" }}>
          {source.trust_score.overall}
        </span>

        {/* Domains */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {source.domains.slice(0, 3).map((d) => {
            const domain = DOMAINS.find((dm) => dm.id === d);
            return domain ? (
              <span
                key={d}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  color: "var(--color-text-secondary)",
                  backgroundColor: "var(--color-surface-raised)",
                }}
              >
                {domain.short}
              </span>
            ) : null;
          })}
        </div>

        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 transition-transform duration-200",
            isExpanded && "rotate-180"
          )}
          style={{ color: "var(--color-text-muted)" }}
        />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <div className="pt-3">
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {source.description}
            </p>
          </div>

          {/* URL */}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm hover:underline"
            style={{ color: "var(--color-primary)" }}
          >
            <ExternalLink size={12} />
            {source.url}
          </a>

          {/* Trust metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricBox
              label="Accuracy"
              value={`${(source.trust_metrics.accuracy_rate * 100).toFixed(0)}%`}
              sublabel={`${source.trust_metrics.confirmation_count} confirmed`}
            />
            <MetricBox
              label="Accessibility"
              value={`${(source.trust_metrics.accessibility_rate * 100).toFixed(0)}%`}
              sublabel={`${source.trust_metrics.total_checks} checks`}
            />
            <MetricBox
              label="Citations"
              value={`${source.trust_metrics.independent_citers}`}
              sublabel={`independent citers`}
            />
            <MetricBox
              label="Conflicts"
              value={`${source.trust_metrics.conflict_count}`}
              sublabel={`of ${source.trust_metrics.conflict_total} total`}
            />
          </div>

          {/* Monitoring info */}
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              Frequency: {source.update_frequency}
            </span>
            <span className="flex items-center gap-1">
              <Eye size={11} />
              Method: {source.access_method}
            </span>
            {source.last_checked && (
              <span className="flex items-center gap-1">
                <Activity size={11} />
                Last checked: {new Date(source.last_checked).toLocaleDateString()}
              </span>
            )}
            {source.paywalled && (
              <span className="flex items-center gap-1" style={{ color: "var(--color-warning)" }}>
                <Shield size={11} />
                Paywalled
              </span>
            )}
            {(source as any).processing_paused && (
              <span className="flex items-center gap-1" style={{ color: "var(--color-warning)" }}>
                <Clock size={11} />
                Paused (admin)
              </span>
            )}
          </div>

          {/* Admin controls — pause toggle, fetch-now, regenerate-brief */}
          <div className="pt-3 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
            <SourceRowControls
              sourceId={source.id}
              initialPaused={!!(source as any).processing_paused}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div
      className="p-2.5 rounded-lg"
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="text-[11px] font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
        {value}
      </div>
      <div className="text-[11px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {sublabel}
      </div>
    </div>
  );
}

// ── Main Dashboard ──

export function SourceHealthDashboard() {
  const { sources, provisionalSources, openConflicts, filters, activeView, setActiveView, setSourceSearch, setProvisionalSources } = useSourceStore();

  // Optimistically remove a provisional row from the list after a successful
  // approve/reject; defer keeps it but updates reviewer_notes server-side.
  function handleProvisionalAction(id: string, action: "approve" | "reject" | "defer") {
    if (action === "defer") return; // row stays in pending_review state; no list change
    setProvisionalSources(provisionalSources.filter((p) => p.id !== id));
  }

  const filteredSources = useMemo(() => filterSources(sources, filters), [sources, filters]);

  const overdueSources = useMemo(() =>
    sources.filter((s) => s.next_scheduled_check && new Date(s.next_scheduled_check) < new Date()),
    [sources]
  );

  const viewTabs = [
    { id: "registry" as const, label: "Registry", count: sources.length },
    { id: "health" as const, label: "Health", count: overdueSources.length },
    { id: "provisional" as const, label: "Provisional", count: provisionalSources.filter((ps) => ps.status === "pending_review").length },
    { id: "conflicts" as const, label: "Data Conflicts", count: openConflicts.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Source Intelligence
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          {sources.length} sources monitored across {[...new Set(sources.flatMap((s) => s.domains))].length} domains
        </p>
      </div>

      {/* Global pause toggle for budget control */}
      <GlobalPauseToggle />

      {/* Tier explainer */}
      <div className="cl-card p-3">
        <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--color-text-primary)" }}>
          Source Tiers — How we rank authority
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          <span><strong>T1</strong> — Official legal text (gazettes, Federal Register)</span>
          <span><strong>T2</strong> — Regulator guidance (FAQs, portals)</span>
          <span><strong>T3</strong> — Intergovernmental (IGO datasets, trackers)</span>
          <span><strong>T4</strong> — Expert analysis (think tanks, NGOs)</span>
          <span><strong>T5</strong> — Industry standards (ISO, IATA)</span>
          <span><strong>T6</strong> — Commercial intelligence (law firms, consultancies)</span>
          <span><strong>T7</strong> — News & commentary (trade press)</span>
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-muted)" }}>
          <strong>Score</strong> measures reliability: freshness of last check, historical accuracy, and whether we can verify the source independently.
        </p>
      </div>

      {/* Tier summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {([1, 2, 3, 4, 5, 6, 7] as SourceTier[]).map((tier) => (
          <TierSummaryCard key={tier} tier={tier} sources={sources} />
        ))}
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
        {viewTabs.map((vt) => (
          <button
            key={vt.id}
            onClick={() => setActiveView(vt.id)}
            className={cn(
              "relative px-3 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer",
              activeView === vt.id
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            )}
          >
            {vt.label}
            {vt.count > 0 && (
              <span
                className="ml-1.5 text-[11px] tabular-nums px-1.5 py-0.5 rounded-full"
                style={{
                  color: vt.id === "conflicts" ? "var(--color-error)" : "var(--color-text-secondary)",
                  backgroundColor: "var(--color-surface-raised)",
                }}
              >
                {vt.count}
              </span>
            )}
            {activeView === vt.id && (
              <span
                className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                style={{ backgroundColor: "var(--color-primary)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--color-text-muted)" }}
        />
        <input
          type="text"
          placeholder="Search sources..."
          value={filters.search}
          onChange={(e) => setSourceSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-primary)",
          }}
        />
      </div>

      {/* Source list */}
      {activeView === "registry" && (
        <div className="space-y-2">
          {filteredSources.length === 0 ? (
            <EmptyState
              title="No sources match your filters"
              description="Try adjusting your search or filter criteria."
            />
          ) : (
            filteredSources.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))
          )}
        </div>
      )}

      {/* Health view */}
      {activeView === "health" && (
        <div className="space-y-4">
          {overdueSources.length === 0 ? (
            <EmptyState
              title="All sources are on schedule"
              description="No overdue checks. The monitoring queue is up to date."
              icon={<CheckCircle size={24} style={{ color: "var(--color-success)" }} />}
            />
          ) : (
            <>
              <p className="text-sm" style={{ color: "var(--color-warning)" }}>
                <AlertTriangle size={14} className="inline mr-1.5" />
                {overdueSources.length} source{overdueSources.length !== 1 ? "s" : ""} overdue for checking
              </p>
              {overdueSources.map((source) => (
                <SourceRow key={source.id} source={source} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Provisional sources */}
      {activeView === "provisional" && (
        <div className="space-y-2">
          {provisionalSources.length === 0 ? (
            <EmptyState
              title="No provisional sources"
              description="When the system discovers a new source through citation, it will appear here for review."
            />
          ) : (
            provisionalSources.map((ps) => (
              <ProvisionalReviewCard
                key={ps.id}
                ps={ps as any}
                onActionDone={handleProvisionalAction}
              />
            ))
          )}
        </div>
      )}

      {/* Open conflicts */}
      {activeView === "conflicts" && (
        <div className="space-y-2">
          {openConflicts.length === 0 ? (
            <EmptyState
              title="No open conflicts"
              description="When two sources disagree on a fact, the conflict will appear here for resolution."
              icon={<CheckCircle size={24} style={{ color: "var(--color-success)" }} />}
            />
          ) : (
            openConflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="p-4 rounded-lg border"
                style={{
                  borderColor: "var(--color-border)",
                  borderLeftWidth: 3,
                  borderLeftColor: "var(--color-error)",
                  backgroundColor: "var(--color-surface)",
                }}
              >
                <div className="text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
                  {conflict.field_in_dispute}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                  <div>
                    <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      Source A (T{conflict.source_a_tier}):
                    </span>
                    <p style={{ color: "var(--color-text-primary)" }}>{conflict.source_a_claim}</p>
                  </div>
                  <div>
                    <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      Source B (T{conflict.source_b_tier}):
                    </span>
                    <p style={{ color: "var(--color-text-primary)" }}>{conflict.source_b_claim}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty State ──

function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon || <Database size={24} style={{ color: "var(--color-text-muted)" }} />}
      <h3 className="mt-3 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h3>
      <p className="mt-1 text-xs max-w-sm" style={{ color: "var(--color-text-secondary)" }}>
        {description}
      </p>
    </div>
  );
}
