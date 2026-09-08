"use client";

/**
 * AdminDashboard — redesign TEMPLATE 08 (HANDOFF §6.8).
 *
 * Layout (inside AppShell, which supplies the sidebar + 4px brand rule):
 *   PageMasthead ("Platform admin · operator view")
 *   → status strip (platform-wide controls + read-only MTD spend)
 *   → two-column grid:
 *        LEFT  · "Sections" plate grid (Workspaces / Sources / Ingest /
 *                Coverage / Research pipeline / Community pickups) + a
 *                per-section sub-nav + the active section body
 *        RIGHT · <AdminIssuesRail> — computed total = sum(rows)
 *
 * The section bodies REUSE the existing wired admin views (real data). Only
 * the mock's genuinely new pieces are net-new: the Workspaces usage row, the
 * member rows (role chip / Remove / rust Ban + typed confirm + last-owner
 * guard, honest-pending per §7), and the merged Flags & rejections queue.
 *
 * Counts are computed, never hard-coded: section badges + sub-nav count pills
 * read useAdminAttention (the same 60s polling singleton the rail uses); the
 * rail total is sum(rows). A badge that can contradict its list is a bug.
 */

import { useState, useEffect, useCallback } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useAdminAttention } from "@/lib/hooks/useAdminAttention";
import type { Source, ProvisionalSource } from "@/types/source";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Masthead } from "@/components/ui/Masthead";
import { StatBlock } from "@/components/ui/StatBlock";
import { SectionRule } from "@/components/ui/SectionRule";
import { RowTableAction } from "@/components/ui/RowTable";
import { TabRow } from "@/components/ui/TabRow";
import { SourceHealthDashboard } from "@/components/sources/SourceHealthDashboard";
import { IssueFilterCaption, issueFilterLabel } from "@/components/admin/IssueFilterCaption";
import { ProvenanceFailures, extractFailures } from "@/components/admin/ProvenanceFailures";
import { BulkImportView } from "@/components/admin/BulkImportView";
import { CoverageMatrixView } from "@/components/admin/CoverageMatrixView";
import { CoverageCatalogueView } from "@/components/admin/CoverageCatalogueView";
import { OrganizationsTable } from "@/components/admin/OrganizationsTable";
import { InvitationsPanel } from "@/components/admin/InvitationsPanel";
import { TierOpinionDisagreementsView } from "@/components/admin/TierOpinionDisagreementsView";
import { ResearchPipelineQueueView } from "@/components/admin/ResearchPipelineQueueView";
import { CommunityPickupsQueueView } from "@/components/admin/CommunityPickupsQueueView";
import { ErrorGroupsView, type ErrorGroupRow } from "@/components/admin/ErrorGroupsView";
import { AssumptionRegisterPanel, type AssumptionRegisterRow } from "@/components/admin/AssumptionRegisterPanel";
import { PendingJurisdictionReviewView } from "@/components/admin/PendingJurisdictionReviewView";
import { AdminIssuesRail, type IssueNavTarget } from "@/components/admin/redesign/AdminIssuesRail";
import { WorkspacesUsageRow } from "@/components/admin/redesign/WorkspacesUsageRow";
import { MembersPanel } from "@/components/admin/redesign/MembersPanel";
import { formatNumber, formatLocaleDateTime } from "@/lib/format";
import { FlagsRejectionsQueue } from "@/components/admin/redesign/FlagsRejectionsQueue";
import { CorpusTurnPanel } from "@/components/admin/CorpusTurnPanel";

interface AdminDashboardProps {
  userId: string;
  userEmail: string;
  /** Masthead "VOL IV · No. N · <date>" line — computed server-side (same
   *  pattern as the dashboard's Home page.tsx) so client/server render
   *  identically. */
  dateLabel: string;
  initialSources?: Source[];
  initialProvisionalSources?: ProvisionalSource[];
  initialOrgs?: any[];
  initialMembers?: any[];
  initialStagedUpdates?: any[];
  initialMtdSpendUsd?: number;
  initialMtdRuns?: number;
  initialErrorGroups?: ErrorGroupRow[];
  initialMtdErrors?: number;
  initialAssumptionRegister?: AssumptionRegisterRow[];
  initialResearchPipelineCount?: number;
  initialCommunityPickupsCount?: number;
  initialEmissionFactorsLiveCount?: number;
}

// ─── Section model (mock §6.8 sectionDefs) ──────────────────────────────────
// Each section carries an ordered list of sub-nav tab labels. The tab label is
// the routing key into the section body below. Sub-tab `count` reads a live
// scalar (see subTabCount) — never a snapshot literal.
type SectionName =
  | "Workspaces"
  | "Sources"
  | "Ingest"
  | "Coverage"
  | "Research pipeline"
  | "Community pickups"
  | "Runtime";

interface SectionDef {
  name: SectionName;
  sub: string;
  tabs: string[];
}

const SECTIONS: SectionDef[] = [
  {
    name: "Workspaces",
    sub: "Organizations, members, invitations, per-tenant overrides.",
    tabs: ["Organizations"],
  },
  {
    name: "Sources",
    sub: "Registry, bulk add, provisional review, tier classification.",
    // Provisional review leads (dc.html p13: "Provisional review · Source registry · Bulk add ·
    // Tier disagreements · Spot-check") — it is the actionable queue (489 pending), not an
    // alphabetical/creation-order list.
    tabs: [
      "Provisional review",
      "Source registry",
      "Bulk add",
      "Tier disagreements",
      "Spot-check",
    ],
  },
  {
    name: "Ingest",
    sub: "Staged updates, flags & rejections, scan scheduling.",
    tabs: ["Flags & rejections", "Staged updates", "Regulatory scan", "Corpus turns"],
  },
  {
    name: "Coverage",
    sub: "Jurisdiction review, coverage matrix, gap analysis.",
    tabs: ["Jurisdiction review", "Coverage matrix", "Catalogue"],
  },
  {
    name: "Research pipeline",
    sub: "Machine-gated drafts and their status.",
    tabs: ["Pipeline"],
  },
  {
    name: "Community pickups",
    sub: "High-engagement posts pending promotion.",
    tabs: ["Pending pickups"],
  },
  {
    name: "Runtime",
    sub: "First-party error tracking, assumption register.",
    tabs: ["Errors", "Assumptions"],
  },
];

export function AdminDashboard({
  userEmail: _userEmail,
  dateLabel,
  initialSources = [],
  initialProvisionalSources = [],
  initialOrgs = [],
  initialMembers = [],
  initialStagedUpdates = [],
  initialMtdSpendUsd = 0,
  initialMtdRuns = 0,
  initialMtdErrors = 0,
  initialErrorGroups = [],
  initialAssumptionRegister = [],
  initialResearchPipelineCount = 0,
  initialCommunityPickupsCount = 0,
  initialEmissionFactorsLiveCount = 0,
}: AdminDashboardProps) {
  // Hydrate the source store with the admin-context unfiltered list (mirror of
  // the Dashboard pattern) so SourceHealthDashboard sees every source even on
  // a direct /admin entry.
  const { setSources, setProvisionalSources, setActiveView } = useSourceStore();
  useEffect(() => {
    if (initialSources.length > 0) setSources(initialSources);
    if (initialProvisionalSources.length > 0) setProvisionalSources(initialProvisionalSources);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // dc.html p13's default landing view is Sources · Provisional review (the actionable
  // queue), not Workspaces · Organizations — the Sources tile carries the selected-tile
  // border treatment in the artboard.
  const [section, setSection] = useState<SectionName>("Sources");
  const [sub, setSub] = useState<string>("Provisional review");
  const [issueFilter, setIssueFilter] = useState<string | null>(null);

  // Sync SourceHealthDashboard's own internal tab (a zustand store field, not a prop it accepts)
  // to this page's Sources sub-tab — the comment at its call site below has always claimed "the
  // sub-tab scopes the operator's intent" but nothing here ever set it, so the shared surface
  // always opened on its own default ("Registry") regardless of which Sources sub-tab the operator
  // picked. dc.html p13's default landing state is Sources · Provisional review, which needs this
  // to actually show the provisional queue rather than the registry.
  useEffect(() => {
    if (section !== "Sources") return;
    const view =
      sub === "Provisional review" ? "provisional" : sub === "Spot-check" ? "provisional" : "registry";
    setActiveView(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, sub]);

  const [members, setMembers] = useState<any[]>(initialMembers);
  const [orgs, setOrgs] = useState<any[]>(initialOrgs);
  const [stagedUpdates, setStagedUpdates] = useState<any[]>(initialStagedUpdates);
  const [toast, setToast] = useState("");

  const supabase = createSupabaseBrowserClient();
  const { counts } = useAdminAttention();

  const activeSection = SECTIONS.find((s) => s.name === section)!;

  const pickSection = (name: SectionName) => {
    const def = SECTIONS.find((s) => s.name === name)!;
    setSection(name);
    setSub(def.tabs[0]);
    setIssueFilter(null);
  };

  const handleIssueNavigate = (target: IssueNavTarget) => {
    const def = SECTIONS.find((s) => s.name === target.section);
    if (!def) return;
    setSection(def.name);
    setSub(def.tabs.includes(target.tab) ? target.tab : def.tabs[0]);
    setIssueFilter(null);
  };

  // Manual refresh — re-runs the same reads the server hydrated us with.
  const loadData = useCallback(async () => {
    try {
      const [orgRes, memberRes, updateRes] = await Promise.all([
        supabase.from("organizations").select("id, name, slug, plan, created_at"),
        supabase
          .from("org_memberships")
          .select(
            // D-1 fix: display_name + email were omitted, so MembersPanel's display chain
            // (full_name ?? display_name ?? email ?? uuid-slice) fell through to UUID slices.
            "id, org_id, user_id, role, created_at, user:profiles!user_id(full_name, display_name, email, avatar_url)"
          ),
        supabase
          .from("staged_updates")
          .select("id, update_type, created_at, reason, proposed_changes, status")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      setOrgs(orgRes.data || []);
      setMembers(memberRes.data || []);
      setStagedUpdates(updateRes.data || []);
    } catch {
      // RLS may block some queries — still show the UI.
    }
  }, [supabase]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const orgIdFromAuth = useWorkspaceStore((s) => s.orgId);

  // Member management (add / role / remove / ban) is owned by MembersPanel, which calls
  // /api/orgs/[org_id]/members directly (S2-10 fix). The previous inline addMember here was
  // BROKEN — it discarded the entered email and re-inserted the caller's own user_id.

  // Approve / reject RETIRED (Unit 0c / RD-20 residual closing): the machine gates ARE the approval. The
  // staged-updates surface is VISIBILITY-ONLY — there is no human approve/reject. A staged row resolves via
  // the machine-gated intake cycle (materialized / rejected-with-reason / routed-to-the-flag-resolver).

  const [scanTopic, setScanTopic] = useState("");
  const [scanJurisdiction, setScanJurisdiction] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const resp = await authedFetch("/api/admin/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ topic: scanTopic, jurisdiction: scanJurisdiction }),
      });
      const data = await resp.json();
      setScanResult(data);
      if (data.staged > 0) loadData();
    } catch (e: any) {
      setScanResult({ error: e.message });
    }
    setScanning(false);
  };

  // ── Computed section badges + sub-tab count pills (live scalars) ──────────
  const provisionalCount = counts?.provisional_sources_pending ?? 0;
  const spotCheckCount = counts?.auto_approved_awaiting_spotcheck ?? 0;
  const flagsCount =
    (counts?.integrity_flags_unresolved ?? 0) + (counts?.platform_integrity_flags_open ?? 0);

  const sectionBadge = (name: SectionName): number | null => {
    if (name === "Sources") return provisionalCount > 0 ? provisionalCount : null;
    if (name === "Ingest") return flagsCount > 0 ? flagsCount : null;
    return null;
  };

  const subTabCount = (label: string): number | null => {
    if (label === "Provisional review") return provisionalCount > 0 ? provisionalCount : null;
    if (label === "Spot-check") return spotCheckCount > 0 ? spotCheckCount : null;
    if (label === "Flags & rejections") return flagsCount > 0 ? flagsCount : null;
    return null;
  };

  // Counter-tile values (README screen 13: eight stat blocks — Workspaces,
  // Sources, Ingest, Coverage, Research pipeline, Community pickups, Runtime,
  // Emission factors). Every number here is a real read already available to
  // this component (useAdminAttention's polled counts, the server-hydrated
  // props, or a state array's own length) — never a fabricated figure. Ingest
  // sums the same three attention counts Sources' sibling Ingest section
  // triages (staged pending + both integrity-flag pools), so the tile can
  // never disagree with what the Flags & rejections queue shows.
  const ingestTotal =
    (counts?.staged_updates_pending ?? 0) +
    (counts?.integrity_flags_unresolved ?? 0) +
    (counts?.platform_integrity_flags_open ?? 0);
  const coverageGapsCount = counts?.coverage_gaps_critical ?? 0;

  const tileCount = (name: SectionName): number => {
    if (name === "Workspaces") return orgs.length;
    if (name === "Sources") return provisionalCount;
    if (name === "Ingest") return ingestTotal;
    if (name === "Coverage") return coverageGapsCount;
    if (name === "Research pipeline") return initialResearchPipelineCount;
    if (name === "Community pickups") return initialCommunityPickupsCount;
    if (name === "Runtime") return initialErrorGroups.length;
    return 0;
  };

  const totalTileCount = SECTIONS.reduce((t, s) => t + tileCount(s.name), 0) + initialEmissionFactorsLiveCount;

  const mtd = `$${(initialMtdSpendUsd || 0).toFixed(2)}`;

  // dc.html p13's own sub-tab labels carry their count as inline "· N" text
  // ("Provisional review · 489"), not a red pill; a tab with no live count
  // accessor renders bare rather than a fabricated zero.
  const subNav = (placement: "page" | "card-head") => (
    <TabRow
      ariaLabel={`${section} views`}
      placement={placement}
      semantics="tablist"
      tabs={activeSection.tabs.map((t) => {
        const count = subTabCount(t);
        return {
          key: t,
          label: count !== null ? `${t} · ${formatNumber(count)}` : t,
          active: t === sub,
          onClick: () => {
            setSub(t);
            setIssueFilter(null);
          },
        };
      })}
    />
  );

  // The provisional card is the Sources body for exactly these two sub-tabs
  // (the same condition the setActiveView effect above uses).
  const tabsInCardHead = section === "Sources" && (sub === "Provisional review" || sub === "Spot-check");

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)" }}>
      <style>{`
        .admin-t08-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 960px) {
          .admin-t08-grid { grid-template-columns: 1fr; }
        }
        .admin-t08-sections { grid-template-columns: repeat(4, 1fr); }
        .cl-admin-stat-tile {
          font-family: inherit;
          cursor: pointer;
          text-align: left;
          width: 100%;
          background: #FFFFFF;
          border-radius: var(--radius-card);
          border: 1px solid rgba(0, 0, 0, .12);
          box-shadow: 0 1px 2px rgba(26, 26, 26, .04), 0 4px 14px rgba(26, 26, 26, .06);
          padding: 0 14px 12px 14px;
          overflow: hidden;
        }
        @media (max-width: 1180px) {
          .admin-t08-sections { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .admin-t08-sections { grid-template-columns: 1fr; }
          .admin-t08-usage { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title="Platform admin"
          dateLabel={dateLabel}
          eyebrowSuffix="Operator view"
          dek={
            <>
              Workspaces, sources, ingest, coverage · issues queue refreshes every 60s ·{" "}
              <b style={{ color: "var(--ink)" }}>{mtd}</b> month-to-date · {formatNumber(initialMtdRuns)} agent runs ·{" "}
              {formatNumber(initialMtdErrors)} errors
            </>
          }
          commandBar={{
            itemCount: totalTileCount,
            scope: "admin",
            placeholder: `Search sources, workspaces, flags — or ask "which provisional sources are T1?"`,
          }}
        />
      </div>

      <div style={{ padding: "16px 40px 40px" }}>
        <div className="admin-t08-grid">
          {/* LEFT — counters + sub-nav + body */}
          <div style={{ minWidth: 0 }}>
            {/* Counter tiles (README screen 13: "counters are stat blocks,
                never band tiles"). Each tile IS the section switcher the
                sub-nav below responds to; Emission factors has no sub-nav
                of its own and instead links straight to /admin/factors. */}
            <div className="admin-t08-sections" style={{ display: "grid", gap: 12, margin: "0 0 18px" }}>
              {SECTIONS.map((s) => {
                const on = s.name === section;
                const badge = sectionBadge(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => pickSection(s.name)}
                    aria-pressed={on}
                    className="cl-admin-stat-tile"
                    style={on ? { borderColor: "var(--brand)" } : undefined}
                  >
                    <StatBlock
                      size="tile"
                      label={s.name}
                      value={formatNumber(tileCount(s.name))}
                      tone={badge !== null ? "critical" : "default"}
                      note={s.sub}
                    />
                  </button>
                );
              })}
              <Link href="/admin/factors" prefetch={false} className="cl-admin-stat-tile" style={{ textDecoration: "none", display: "block" }}>
                <StatBlock
                  size="tile"
                  label="Emission factors"
                  value={formatNumber(initialEmissionFactorsLiveCount)}
                  note={`${formatNumber(initialEmissionFactorsLiveCount)} live rows · read-only (WO-18)`}
                />
              </Link>
            </div>

            {/* Sub-nav.
                dc.html p13 draws the Sources sub-tab row INSIDE the
                "SOURCES · PROVISIONAL REVIEW" card head, on one line, with its
                counts as inline "· N" text. Where that card is the section
                body (Sources / Provisional review and Spot-check) the row is
                passed into it via `headTabs` and NOT rendered here, so there is
                exactly one row on the page either way. Every other section's
                body has no artboard, so its row keeps the page-level placement.
                Lane admin60, 2026-09-08. */}
            {!tabsInCardHead && <div style={{ margin: "0 0 18px" }}>{subNav("page")}</div>}

            {/* Section body */}
            {renderBody(section, sub)}
          </div>

          {/* RIGHT, the rail: issues queue, then the read-only-controls explainer.
              dc.html p13 draws that explainer as the rail's own card (title,
              body, controls), not as a strip above the section body where it
              used to sit; moved, not duplicated. */}
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <AdminIssuesRail onNavigate={handleIssueNavigate} />
            <div data-audit="admin-usage-rail">
              <WorkspacesUsageRow orgs={orgs} members={members} layout="rail" />
            </div>
            <ReadOnlyControlsCard onRefresh={loadData} />
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 200,
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 600,
              maxWidth: 360,
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );

  // ── Section body router ───────────────────────────────────────────────────
  function renderBody(sec: SectionName, tab: string) {
    // Workspaces
    if (sec === "Workspaces") {
      return (
        <div style={{ display: "grid", gap: 14 }}>
          <PlateCard title="Organizations" meta={`${orgs.length} org${orgs.length === 1 ? "" : "s"} · ${members.length} membership${members.length === 1 ? "" : "s"}`}>
            <OrganizationsTable orgs={orgs} members={members} />
          </PlateCard>
          <div className="admin-t08-usage" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <MembersPanel members={members} orgId={orgIdFromAuth} onToast={showToast} onChanged={loadData} />
            {orgIdFromAuth ? (
              <InvitationsPanel orgId={orgIdFromAuth} />
            ) : (
              <PendingFrame
                heading="Invitations need a resolved workspace."
                body="Sign in to a workspace to invite teammates. Invitations attach to the workspace you own."
              />
            )}
          </div>
        </div>
      );
    }

    // Sources
    if (sec === "Sources") {
      if (tab === "Bulk add") return <BulkImportView />;
      if (tab === "Tier disagreements") return <TierOpinionDisagreementsView />;
      // Source registry / Provisional review / Spot-check all resolve to the
      // source review surface (SourceHealthDashboard owns provisional review +
      // recently-approved spot-check); the sub-tab scopes the operator's intent.
      // dc.html p13's own default view (Sources / Provisional review) shows an
      // ORGANIZATIONS card stacked directly below the source table — not only
      // under the Workspaces section, where this card used to live exclusively
      // (lane compose-other, 2026-09-08). Same PlateCard/OrganizationsTable, one
      // more render site, not a duplicate implementation.
      return (
        <div style={{ display: "grid", gap: 16 }}>
          {issueFilter && (
            <IssueFilterCaption label={issueFilterLabel(issueFilter)} onClear={() => setIssueFilter(null)} />
          )}
          <SourceHealthDashboard
            headTabs={tabsInCardHead ? subNav("card-head") : undefined}
            // FOLD-61: the same `provisional_sources_pending` this page already puts in the
            // Sources tab badge and the issues-queue row, so the card head under those two cannot
            // name a different number for the same queue (COUNTS-61's defect class, third site).
            pendingTotal={provisionalCount}
            stagedUpdatesCount={stagedUpdates.length}
            onOpenQueue={() => {
              setSection("Ingest");
              setSub("Staged updates");
            }}
          />
          <PlateCard title="Organizations" meta={`${orgs.length} org${orgs.length === 1 ? "" : "s"} · ${members.length} membership${members.length === 1 ? "" : "s"}`}>
            <OrganizationsTable orgs={orgs} members={members} />
          </PlateCard>
        </div>
      );
    }

    // Ingest
    if (sec === "Ingest") {
      if (tab === "Flags & rejections") return <FlagsRejectionsQueue />;
      if (tab === "Staged updates") return renderStaged();
      if (tab === "Regulatory scan") return renderScan();
      if (tab === "Corpus turns") return <CorpusTurnPanel />;
    }

    // Coverage
    if (sec === "Coverage") {
      if (tab === "Catalogue") {
        return <CoverageCatalogueView />;
      }
      if (tab === "Coverage matrix") {
        return (
          <CoverageMatrixView
            onAction={(action) => {
              if (action.kind === "bulk-add") {
                setSection("Sources");
                setSub("Bulk add");
                setIssueFilter(`coverage:${action.jurisdictionIso}`);
              }
            }}
          />
        );
      }
      return <PendingJurisdictionReviewView />;
    }

    // Research pipeline
    if (sec === "Research pipeline") return <ResearchPipelineQueueView />;

    // Community pickups
    if (sec === "Community pickups") return <CommunityPickupsQueueView />;

    // Runtime (R0.2 first-party error tracking; WO-20 assumption register, spec §4's reader)
    if (sec === "Runtime") {
      if (tab === "Assumptions") return <AssumptionRegisterPanel rows={initialAssumptionRegister} />;
      return <ErrorGroupsView groups={initialErrorGroups} />;
    }

    return null;
  }

  function renderStaged() {
    return (
      <PlateCard title="Staged updates" meta={`${stagedUpdates.length} staged`}>
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          {stagedUpdates.length === 0 ? (
            <PendingFrame
              heading="No staged updates in transit."
              body="When the monitoring worker detects changes, worker-staged regulations appear here as they flow through the machine-gated intake cycle (materialized / rejected-with-reason). No human approval step."
            />
          ) : (
            stagedUpdates.map((update) => (
              <div
                key={update.id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: "1px solid var(--color-border)",
                  background: "var(--surface)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 4,
                      color: "var(--sev-high)",
                      border: "1px solid var(--high-bd)",
                      background: "var(--high-bg)",
                    }}
                  >
                    {update.update_type}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                    {formatLocaleDateTime(new Date(update.created_at))}
                  </span>
                </div>
                {update.proposed_changes?.title && (
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                    {update.proposed_changes.title}
                  </p>
                )}
                {update.proposed_changes?.summary && (
                  <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-2)", margin: 0 }}>
                    {update.proposed_changes.summary}
                  </p>
                )}
                {!update.proposed_changes?.title && (
                  <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>
                    {update.reason || JSON.stringify(update.proposed_changes)}
                  </p>
                )}
                <ProvenanceFailures failures={extractFailures(update)} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                      padding: "2px 8px", borderRadius: 4, color: "var(--text-2)",
                      border: "1px solid var(--color-border-medium)", background: "var(--raised)",
                    }}
                  >
                    Staged · machine-gated
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>
                    Resolves via the intake cycle — materialized / rejected-with-reason / routed-to-flag. No human approve/reject.
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </PlateCard>
    );
  }

  function renderScan() {
    return (
      <PlateCard title="Regulatory scan" meta="Mon / Wed / Fri · 07:00 UTC">
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
            Search for new regulations. Leave fields empty to scan all freight-sustainability topics
            globally. Results are staged for review — nothing is published automatically.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Topic (e.g. carbon pricing, packaging, SAF)"
              value={scanTopic}
              onChange={(e) => setScanTopic(e.target.value)}
              style={{
                flex: 1,
                minWidth: 220,
                fontFamily: "inherit",
                fontSize: 12.5,
                padding: "9px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border-medium)",
                background: "var(--color-background)",
                color: "var(--text)",
                outline: "none",
              }}
            />
            <input
              type="text"
              placeholder="Jurisdiction (e.g. EU, US, UK)"
              value={scanJurisdiction}
              onChange={(e) => setScanJurisdiction(e.target.value)}
              style={{
                width: 200,
                fontFamily: "inherit",
                fontSize: 12.5,
                padding: "9px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border-medium)",
                background: "var(--color-background)",
                color: "var(--text)",
                outline: "none",
              }}
            />
            <Button variant="primary" onClick={handleScan} disabled={scanning}>
              <Search size={14} />
              {scanning ? "Scanning…" : "Scan now"}
            </Button>
          </div>
          {scanResult && (
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${scanResult.error ? "var(--color-error)" : "var(--color-success)"}`,
                background: "var(--surface)",
              }}
            >
              {scanResult.error ? (
                <p style={{ fontSize: 13, color: "var(--color-error)", margin: 0 }}>{scanResult.error}</p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--text)", margin: 0 }}>
                  Scan complete: {scanResult.discovered} found, {scanResult.new_items} new,{" "}
                  {scanResult.staged} staged for review
                  {scanResult.new_sources_discovered > 0
                    ? ` · ${scanResult.new_sources_discovered} new sources discovered`
                    : ""}
                  . Review them in Staged updates.
                </p>
              )}
            </div>
          )}
        </div>
      </PlateCard>
    );
  }
}

// ── Small shared presentational helpers ─────────────────────────────────────

/**
 * The admin section card. dc.html p13's ORGANIZATIONS card verbatim: the
 * graduated SectionRule cap (ruling 5.1), an Anton 20px uppercase title and a
 * 10.5px / .12em small-caps right meta on one baseline row, a hairline under
 * the head, and the body flush to the card edges so a RowTable's own 16px
 * gutter is the only one. Lane admin60 (2026-09-08) replaced the 12.5px bold
 * plate header this used to draw, which matched no artboard head on any page.
 */
function PlateCard({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 16,
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--line-2)",
        }}
      >
        <span
          className="cl-admin-platecard-title"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            color: "var(--ink)",
          }}
        >
          {title}
        </span>
        {meta && (
          <span
            style={{
              fontSize: "var(--fs-105)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--ink-3)",
              whiteSpace: "nowrap",
            }}
          >
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * ReadOnlyControlsCard, the rail's explainer box, dc.html p13 verbatim: the
 * graduated rule, a small-caps "Read-only controls" label, the platform-wide /
 * per-org sentence, then the controls.
 *
 * The artboard draws two buttons, Refresh and Export queue. Refresh is real
 * (it re-runs the same reads the server hydrated the page with). There is NO
 * queue-export endpoint anywhere under src/app/api/admin/, so "Export queue" is
 * not rendered rather than drawn dead, logged in
 * docs/design/handoff-2026-09-06/DEVIATION-LOG.md.
 */
function ReadOnlyControlsCard({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div
      data-audit="admin-readonly-controls"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "12px 16px 14px" }}>
        <div
          style={{
            fontSize: "var(--fs-105)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Read-only controls
        </div>
        <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", lineHeight: 1.5, margin: 0 }}>
          Platform-wide settings. Per-org settings (members, billing) live on each org owner&apos;s{" "}
          <Link href="/profile" prefetch={false} style={{ color: "inherit" }}>
            Account
          </Link>
          .
        </p>
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <RowTableAction label="Refresh" onClick={onRefresh} />
        </div>
      </div>
    </div>
  );
}

/** Honest-state frame (§4): dashed border, brass heading, one-liner + reason. */
function PendingFrame({ heading, body }: { heading: string; body: string }) {
  return (
    <div
      style={{
        border: "1px dashed var(--color-border-strong)",
        background: "var(--color-background)",
        borderRadius: 8,
        padding: "14px 16px",
      }}
    >
      <p
        style={{
          fontSize: 12.5,
          fontWeight: 800,
          color: "var(--text)",
          margin: "0 0 4px",
        }}
      >
        {heading}
      </p>
      <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text-2)", margin: 0 }}>{body}</p>
    </div>
  );
}
