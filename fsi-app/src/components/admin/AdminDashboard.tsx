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

import { useState, useEffect, useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useAdminAttention } from "@/lib/hooks/useAdminAttention";
import type { Source, ProvisionalSource, SourceConflict } from "@/types/source";
import { CheckCircle, XCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { SourceHealthDashboard } from "@/components/sources/SourceHealthDashboard";
import { IssueFilterCaption, issueFilterLabel } from "@/components/admin/IssueFilterCaption";
import { ProvenanceFailures, extractFailures } from "@/components/admin/ProvenanceFailures";
import { BulkImportView } from "@/components/admin/BulkImportView";
import { CoverageMatrixView } from "@/components/admin/CoverageMatrixView";
import { OrganizationsTable } from "@/components/admin/OrganizationsTable";
import { InvitationsPanel } from "@/components/admin/InvitationsPanel";
import { TierOpinionDisagreementsView } from "@/components/admin/TierOpinionDisagreementsView";
import { ResearchPipelineQueueView } from "@/components/admin/ResearchPipelineQueueView";
import { CommunityPickupsQueueView } from "@/components/admin/CommunityPickupsQueueView";
import { PendingJurisdictionReviewView } from "@/components/admin/PendingJurisdictionReviewView";
import { AdminIssuesRail, type IssueNavTarget } from "@/components/admin/redesign/AdminIssuesRail";
import { WorkspacesUsageRow } from "@/components/admin/redesign/WorkspacesUsageRow";
import { MembersPanel } from "@/components/admin/redesign/MembersPanel";
import { FlagsRejectionsQueue } from "@/components/admin/redesign/FlagsRejectionsQueue";

interface AdminDashboardProps {
  userId: string;
  userEmail: string;
  initialSources?: Source[];
  initialProvisionalSources?: ProvisionalSource[];
  initialOpenConflicts?: SourceConflict[];
  initialOrgs?: any[];
  initialMembers?: any[];
  initialStagedUpdates?: any[];
  initialMtdSpendUsd?: number;
  initialMtdRuns?: number;
  initialMtdErrors?: number;
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
  | "Community pickups";

interface SectionDef {
  name: SectionName;
  sub: string;
  tabs: string[];
}

const SECTIONS: SectionDef[] = [
  {
    name: "Workspaces",
    sub: "Organizations, members, invitations. Per-tenant overrides and plan visibility.",
    tabs: ["Organizations"],
  },
  {
    name: "Sources",
    sub: "Source registry, bulk add, provisional candidate review and tier classification.",
    tabs: [
      "Source registry",
      "Provisional review",
      "Bulk add sources",
      "Tier disagreements",
      "Spot-check",
    ],
  },
  {
    name: "Ingest",
    sub: "Staged updates, flags & rejections (combined), regulatory scan scheduling.",
    tabs: ["Flags & rejections", "Staged updates", "Regulatory scan"],
  },
  {
    name: "Coverage",
    sub: "Jurisdiction review, coverage matrix, gap analysis.",
    tabs: ["Jurisdiction review", "Coverage matrix"],
  },
  {
    name: "Research pipeline",
    sub: "Editorial draft-staging (moved from customer-facing /research per design rebuild).",
    tabs: ["Draft staging"],
  },
  {
    name: "Community pickups",
    sub: "High-engagement community posts pending promotion to platform intelligence.",
    tabs: ["Pending pickups"],
  },
];

export function AdminDashboard({
  userId,
  userEmail: _userEmail,
  initialSources = [],
  initialProvisionalSources = [],
  initialOpenConflicts = [],
  initialOrgs = [],
  initialMembers = [],
  initialStagedUpdates = [],
  initialMtdSpendUsd = 0,
  initialMtdRuns = 0,
  initialMtdErrors = 0,
}: AdminDashboardProps) {
  // Hydrate the source store with the admin-context unfiltered list (mirror of
  // the Dashboard pattern) so SourceHealthDashboard sees every source even on
  // a direct /admin entry.
  const { setSources, setProvisionalSources, setOpenConflicts } = useSourceStore();
  useEffect(() => {
    if (initialSources.length > 0) setSources(initialSources);
    if (initialProvisionalSources.length > 0) setProvisionalSources(initialProvisionalSources);
    if (initialOpenConflicts.length > 0) setOpenConflicts(initialOpenConflicts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [section, setSection] = useState<SectionName>("Workspaces");
  const [sub, setSub] = useState<string>("Organizations");
  const [issueFilter, setIssueFilter] = useState<string | null>(null);

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
            "id, org_id, user_id, role, created_at, user:profiles!user_id(full_name, avatar_url)"
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

  // Add a teammate to the caller's current workspace. The full invite-by-email
  // + provision flow lives at /api/admin/users; this direct insert is the
  // dev-mode shortcut that attaches the current account under a new role.
  const addMember = async (email: string) => {
    if (!email) return;
    if (!orgIdFromAuth) {
      showToast("No workspace resolved — sign in to add members.");
      return;
    }
    const { error } = await supabase.from("org_memberships").insert({
      org_id: orgIdFromAuth,
      user_id: userId,
      role: "member",
    });
    if (error) showToast("Error: " + error.message);
    else {
      showToast("Member added");
      loadData();
    }
  };

  // Approve / reject a staged update.
  const handleUpdate = async (id: string, action: "approve" | "reject") => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch("/api/staged-updates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ id, action }),
      });
      const result = await resp.json();
      if (result.error) showToast("Error: " + result.error);
      else {
        showToast(`Update ${action}d`);
        setStagedUpdates((prev) => prev.filter((u) => u.id !== id));
      }
    } catch (e: any) {
      showToast("Error: " + e.message);
    }
  };

  const [scanTopic, setScanTopic] = useState("");
  const [scanJurisdiction, setScanJurisdiction] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const supabaseClient = createSupabaseBrowserClient();
      const { data: { session } } = await supabaseClient.auth.getSession();
      const resp = await fetch("/api/admin/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
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

  const crumb = useMemo(() => {
    const firstTab = activeSection.tabs[0];
    return sub && sub !== firstTab ? `${section} / ${sub}` : section;
  }, [section, sub, activeSection]);

  const mtd = `$${(initialMtdSpendUsd || 0).toFixed(2)}`;

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
        .admin-t08-sections { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 640px) {
          .admin-t08-sections { grid-template-columns: 1fr; }
          .admin-t08-usage { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <PageMasthead
        eyebrow="Platform admin · operator view"
        title="Platform admin"
        meta="Workspaces, sources, ingest, coverage · needs-attention queue refreshes every 60 seconds"
      />

      <div style={{ padding: "28px 36px 80px" }}>
        {/* Status strip */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "0 0 22px" }}>
          <div
            style={{
              flex: 1,
              minWidth: 300,
              background: "var(--surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "11px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>
              <b style={{ color: "var(--text)" }}>Platform-wide controls.</b> Per-org settings
              (members, billing) live on each org owner&apos;s{" "}
              <a href="/profile" style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
                Profile
              </a>
              .
            </p>
            <Button variant="secondary" size="sm" onClick={loadData}>
              Refresh
            </Button>
          </div>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "11px 16px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {mtd} <span style={{ fontWeight: 600, color: "var(--text-2)" }}>month-to-date</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {initialMtdRuns} <span style={{ fontWeight: 600, color: "var(--text-2)" }}>agent runs</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {initialMtdErrors} <span style={{ fontWeight: 600, color: "var(--text-2)" }}>errors</span>
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                border: "1px solid var(--color-border-medium)",
                borderRadius: 4,
                padding: "3px 8px",
              }}
            >
              Read-only
            </span>
          </div>
        </div>

        <div className="admin-t08-grid">
          {/* LEFT — sections + sub-nav + body */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                borderBottom: "2px solid var(--text)",
                padding: "0 0 8px",
                margin: "0 0 14px",
                gap: 12,
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 400,
                  fontSize: 26,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  margin: 0,
                  color: "var(--text)",
                }}
              >
                Sections
              </h2>
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                Admin / <b style={{ color: "var(--text)" }}>{crumb}</b>
              </span>
            </div>

            {/* Sections plate grid */}
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
                    style={{
                      fontFamily: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                      background: on ? "var(--color-bg-ai-strip)" : "var(--surface)",
                      borderRadius: 8,
                      padding: "13px 16px",
                      width: "100%",
                      border: on
                        ? "2px solid var(--color-primary)"
                        : "1px solid var(--color-border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 16,
                          letterSpacing: "0.03em",
                          textTransform: "uppercase",
                          color: "var(--text)",
                        }}
                      >
                        {s.name}
                      </span>
                      {badge !== null && (
                        <span
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 16,
                            color: "var(--sev-critical)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {badge.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5, margin: "5px 0 0" }}>
                      {s.sub}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Sub-nav */}
            <div
              role="tablist"
              aria-label={`${section} views`}
              style={{
                display: "flex",
                gap: 2,
                borderBottom: "1px solid var(--color-border)",
                margin: "0 0 18px",
                flexWrap: "wrap",
              }}
            >
              {activeSection.tabs.map((t) => {
                const on = t === sub;
                const count = subTabCount(t);
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setSub(t);
                      setIssueFilter(null);
                    }}
                    style={{
                      fontFamily: "inherit",
                      fontSize: 12.5,
                      fontWeight: on ? 800 : 600,
                      padding: "10px 16px",
                      border: "none",
                      borderBottom: on ? "3px solid var(--color-primary)" : "3px solid transparent",
                      background: "transparent",
                      color: on ? "var(--text)" : "var(--text-2)",
                      cursor: "pointer",
                    }}
                  >
                    {t}
                    {count !== null && (
                      <span
                        style={{
                          marginLeft: 7,
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "1px 7px",
                          borderRadius: 999,
                          background: "var(--critical-bg)",
                          color: "var(--sev-critical)",
                          border: "1px solid var(--critical-bd)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Section body */}
            {renderBody(section, sub)}
          </div>

          {/* RIGHT — issues queue rail */}
          <AdminIssuesRail onNavigate={handleIssueNavigate} />
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
          <WorkspacesUsageRow orgs={orgs} members={members} />
          <PlateCard title="Organizations" meta={`${orgs.length} org${orgs.length === 1 ? "" : "s"} · ${members.length} membership${members.length === 1 ? "" : "s"}`}>
            <OrganizationsTable orgs={orgs} members={members} />
          </PlateCard>
          <div className="admin-t08-usage" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <MembersPanel members={members} onAddMember={addMember} onToast={showToast} />
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
      if (tab === "Bulk add sources") return <BulkImportView />;
      if (tab === "Tier disagreements") return <TierOpinionDisagreementsView />;
      // Source registry / Provisional review / Spot-check all resolve to the
      // source review surface (SourceHealthDashboard owns provisional review +
      // recently-approved spot-check); the sub-tab scopes the operator's intent.
      return (
        <div style={{ display: "grid", gap: 16 }}>
          {issueFilter && (
            <IssueFilterCaption label={issueFilterLabel(issueFilter)} onClear={() => setIssueFilter(null)} />
          )}
          <SourceHealthDashboard />
        </div>
      );
    }

    // Ingest
    if (sec === "Ingest") {
      if (tab === "Flags & rejections") return <FlagsRejectionsQueue />;
      if (tab === "Staged updates") return renderStaged();
      if (tab === "Regulatory scan") return renderScan();
    }

    // Coverage
    if (sec === "Coverage") {
      if (tab === "Coverage matrix") {
        return (
          <CoverageMatrixView
            onAction={(action) => {
              if (action.kind === "bulk-add") {
                setSection("Sources");
                setSub("Bulk add sources");
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

    return null;
  }

  function renderStaged() {
    return (
      <PlateCard title="Staged updates" meta={`${stagedUpdates.length} pending`}>
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          {stagedUpdates.length === 0 ? (
            <PendingFrame
              heading="No staged updates pending."
              body="When the monitoring worker detects changes, worker-staged regulations appear here for approval before they materialize into customer-facing briefs."
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
                    {new Date(update.created_at).toLocaleString()}
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
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="primary" size="sm" onClick={() => handleUpdate(update.id, "approve")}>
                    <CheckCircle size={12} />
                    Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleUpdate(update.id, "reject")}>
                    <XCircle size={12} />
                    Reject
                  </Button>
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
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          background: "var(--raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text)",
          }}
        >
          {title}
        </span>
        {meta && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)" }}>{meta}</span>}
      </div>
      {children}
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
