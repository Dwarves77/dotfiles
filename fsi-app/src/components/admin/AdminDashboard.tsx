"use client";

import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSourceStore } from "@/stores/sourceStore";
import type { Source, ProvisionalSource, SourceConflict } from "@/types/source";
import {
  Plus,
  CheckCircle, XCircle, RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SourceHealthDashboard } from "@/components/sources/SourceHealthDashboard";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { IssuesQueue } from "@/components/admin/IssuesQueue";
import { IssueFilterCaption, issueFilterLabel } from "@/components/admin/IssueFilterCaption";
import { IntegrityFlagsView } from "@/components/admin/IntegrityFlagsView";
import { PlatformIntegrityFlagsView } from "@/components/admin/PlatformIntegrityFlagsView";
import { BulkImportView } from "@/components/admin/BulkImportView";
import { CoverageMatrixView } from "@/components/admin/CoverageMatrixView";
import { OrganizationsTable } from "@/components/admin/OrganizationsTable";
import { MtdSpendTile } from "@/components/admin/MtdSpendTile";
import { InvitationsPanel } from "@/components/admin/InvitationsPanel";
// Phase 7 admin chrome — tier-opinion disagreement review + triage queues.
import { TierOpinionDisagreementsView } from "@/components/admin/TierOpinionDisagreementsView";
import { IngestRejectionsView } from "@/components/admin/IngestRejectionsView";
import { ResearchPipelineQueueView } from "@/components/admin/ResearchPipelineQueueView";
import { CommunityPickupsQueueView } from "@/components/admin/CommunityPickupsQueueView";
import { PendingJurisdictionReviewView } from "@/components/admin/PendingJurisdictionReviewView";

interface AdminDashboardProps {
  userId: string;
  userEmail: string;
  initialSources?: Source[];
  initialProvisionalSources?: ProvisionalSource[];
  initialOpenConflicts?: SourceConflict[];
  initialOrgs?: any[];
  initialMembers?: any[];
  initialStagedUpdates?: any[];
  // Wave 1a MTD spend tile inputs. Optional so existing callers
  // continue to compile when agent_runs is not yet present.
  initialMtdSpendUsd?: number;
  initialMtdRuns?: number;
  initialMtdErrors?: number;
}

export function AdminDashboard({
  userId,
  // userEmail is currently unused after the visual refresh — the
  // identity row at the top of the legacy admin shell was replaced
  // by the EditorialMasthead, which doesn't surface the email. Kept
  // on the props interface so callers (admin/page.tsx) don't have
  // to change.
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
  // Hydrate the source store with the admin-context unfiltered list. Mirror of
  // the Dashboard pattern at src/components/Dashboard.tsx (lines 247-253). The
  // source store is shared across pages, but only / and /admin populate it; if
  // the user enters /admin directly the store would otherwise be empty and
  // SourceHealthDashboard would render zero sources.
  const { setSources, setProvisionalSources, setOpenConflicts } = useSourceStore();
  useEffect(() => {
    if (initialSources.length > 0) setSources(initialSources);
    if (initialProvisionalSources.length > 0) setProvisionalSources(initialProvisionalSources);
    if (initialOpenConflicts.length > 0) setOpenConflicts(initialOpenConflicts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // "integrity-flags" and "coverage-matrix" are reserved for W2.C and W2.D
  // respectively. They appear as targets in the IssuesQueue tap-throughs;
  // when the IssuesQueue navigates to one before its tab body ships we
  // gracefully fall back to a sibling tab (see resolveAdminTab below).
  type AdminTab =
    | "orgs"
    | "sources"
    | "staged"
    | "scan"
    | "integrity-flags"
    | "platform-integrity-flags"
    | "coverage-matrix"
    | "bulk-import"
    | "tier-opinions"
    | "ingest-rejections"
    | "jurisdiction-review"
    // H4 (2026-05-25): destination view for Section card 5 "Research
    // pipeline". Reached via section card click, NOT via the legacy
    // 11-tab strip. Per operator direction: the section card → destination
    // view pattern is the canonical /admin navigation; the visible
    // 11-tab strip is legacy chrome slated for retirement in a separate
    // Admin restructure dispatch.
    | "research-pipeline"
    // H5 (2026-05-25): destination view for Section card 6 "Community
    // pickups". Engagement-heuristic suggestion queue surfacing top-level
    // community posts with reply_count >= 3 and < 30 days old that
    // haven't been promoted. Same section-card → destination-view pattern
    // as H4; not added to the legacy 11-tab strip.
    | "community-pickups";
  const KNOWN_RENDERED_TABS: ReadonlyArray<AdminTab> = [
    "orgs",
    "sources",
    "staged",
    "scan",
    "integrity-flags",
    "platform-integrity-flags",
    "coverage-matrix",
    "bulk-import",
    "tier-opinions",
    "ingest-rejections",
    "jurisdiction-review",
    "research-pipeline",
    "community-pickups",
  ];
  const [activeTab, setActiveTab] = useState<AdminTab>("orgs");
  const [issueFilter, setIssueFilter] = useState<string | null>(null);

  const resolveAdminTab = (tab: string): AdminTab => {
    if (KNOWN_RENDERED_TABS.includes(tab as AdminTab)) return tab as AdminTab;
    return "orgs";
  };
  const handleIssueNavigate = (tab: string, filter?: string) => {
    setActiveTab(resolveAdminTab(tab));
    setIssueFilter(filter ?? null);
  };
  const [members, setMembers] = useState<any[]>(initialMembers);
  const [orgs, setOrgs] = useState<any[]>(initialOrgs);
  const [stagedUpdates, setStagedUpdates] = useState<any[]>(initialStagedUpdates);
  const [integrityFlagCount, setIntegrityFlagCount] = useState<number>(0);
  const [platformIntegrityFlagCount, setPlatformIntegrityFlagCount] = useState<number>(0);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [toast, setToast] = useState("");

  const supabase = createSupabaseBrowserClient();

  // Manual refresh — re-runs the same three reads the server hydrated us
  // with at first paint. Used by the Refresh button and after add-member /
  // approve-update side effects.
  const loadData = useCallback(async () => {
    try {
      const [orgRes, memberRes, updateRes, flagRes, platformFlagRes] = await Promise.all([
        supabase.from("organizations").select("id, name, slug, plan, created_at"),
        // Embed profiles via the user_id FK so the member list
        // can show "Jason Losh" instead of a raw uuid. The relation alias
        // `user:profiles!user_id` joins on the org_memberships.user_id ->
        // profiles.id FK added in migration 075. Migrated 2026-05-15
        // (migration 075 Phase 2): was user_profiles(name, headshot_url).
        supabase
          .from("org_memberships")
          .select(
            "id, org_id, user_id, role, created_at, user:profiles!user_id(full_name, avatar_url)"
          ),
        // Slim staged_updates select — same column list as the server
        // initial fetch in app/admin/page.tsx. Drops full_brief + other
        // wide columns the panel doesn't render.
        supabase.from("staged_updates").select("id, update_type, created_at, reason, proposed_changes, status").eq("status", "pending").order("created_at", { ascending: false }).limit(100),
        supabase
          .from("intelligence_items")
          .select("id", { count: "exact", head: true })
          .eq("agent_integrity_flag", true)
          .is("agent_integrity_resolved_at", null),
        // Platform integrity flags (migration 048) — open + in_review
        // counted together as the "needs attention" badge.
        supabase
          .from("integrity_flags")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "in_review"]),
      ]);

      setOrgs(orgRes.data || []);
      setMembers(memberRes.data || []);
      setStagedUpdates(updateRes.data || []);
      setIntegrityFlagCount(flagRes.count ?? 0);
      setPlatformIntegrityFlagCount(platformFlagRes.count ?? 0);
    } catch {
      // RLS may block some queries — still show the UI
    }
  }, [supabase]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Add member to the caller's current workspace.
  // The full "invite by email + provision" flow lives at /api/admin/users
  // (POST). This direct insert is the dev-mode shortcut that adds the
  // current user under a new role; it requires a resolved orgId from
  // auth context.
  const orgIdFromAuth = useWorkspaceStore((s) => s.orgId);
  const addMember = async () => {
    if (!newEmail) return;
    if (!orgIdFromAuth) {
      showToast("No workspace resolved — sign in to add members.");
      return;
    }

    const { error } = await supabase.from("org_memberships").insert({
      org_id: orgIdFromAuth,
      user_id: userId,
      role: newRole,
    });

    if (error) {
      showToast("Error: " + error.message);
    } else {
      showToast("Member added");
      setNewEmail("");
      loadData();
    }
  };

  // Approve/reject staged update
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
      if (result.error) {
        showToast("Error: " + result.error);
      } else {
        showToast(`Update ${action}d`);
        // Remove from local list immediately
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
      if (data.staged > 0) loadData(); // Refresh staged updates
    } catch (e: any) {
      setScanResult({ error: e.message });
    }
    setScanning(false);
  };

  // "integrations" and "audit" tabs stripped per the 2026-05-21 dead-code
  // disposition (no backing service; not in Sprint 2 scope). Add them back
  // when API integrations + audit-log read endpoints actually ship.
  const tabs: { id: AdminTab; label: string; count: number }[] = [
    { id: "orgs", label: "Organizations", count: orgs.length },
    { id: "sources", label: "Source registry", count: 0 },
    { id: "staged", label: "Staged updates", count: stagedUpdates.length },
    { id: "integrity-flags", label: "Integrity flags", count: integrityFlagCount },
    { id: "platform-integrity-flags", label: "Platform flags", count: platformIntegrityFlagCount },
    { id: "tier-opinions", label: "Tier disagreements", count: 0 },
    { id: "ingest-rejections", label: "Ingest rejections", count: 0 },
    { id: "jurisdiction-review", label: "Jurisdiction review", count: 0 },
    { id: "coverage-matrix", label: "Coverage matrix", count: 0 },
    { id: "bulk-import", label: "Bulk add sources", count: 0 },
    { id: "scan", label: "Regulatory scan", count: 0 },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <EditorialMasthead
        eyebrow="Platform Admin · May 24, 2026"
        title="Platform Admin"
        meta="Workspaces, sources, ingest, coverage. Aggregated needs-attention queue refreshes every 60 seconds."
      />

      <div style={{ padding: "28px 36px 60px" }}>
        {/* Issues queue (W2.E) — aggregated needs-attention list above
            the rest of the admin shell. Tap-throughs switch the active
            tab via handleIssueNavigate; sub-tab filters are captured in
            issueFilter for the target tab to consume. */}
        <IssuesQueue onNavigate={handleIssueNavigate} />

        {/* Navy admin-view banner */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-bd)",
            borderRadius: "var(--r-md)",
            padding: "10px 16px",
            marginBottom: 18,
            fontSize: 12,
            color: "var(--text)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--accent)",
              flexShrink: 0,
            }}
          />
          <span>
            <b style={{ color: "var(--accent)" }}>Caro&apos;s Ledge admin view</b> — you are
            looking at platform-wide controls. Per-org settings (members, billing) live on
            each org owner&apos;s{" "}
            <a
              href="/profile"
              style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "underline" }}
            >
              Profile
            </a>
            .
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadData}
            className="ml-auto"
          >
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>

        {/* Wave 1a MTD spend tile, read-only month-to-date agent run cost. */}
        <MtdSpendTile
          usd={initialMtdSpendUsd}
          runs={initialMtdRuns}
          errors={initialMtdErrors}
        />

        {/* Design rebuild 2026-05-24 (handoff design_handoff_2026-05/admin.html):
            6 section cards group the 11 underlying tabs into operator-meaningful
            categories. Clicking a card jumps the active tab to the first sub-view
            in that section. The full 11-tab strip below remains for direct access. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
            marginBottom: 24,
          }}
        >
          {(
            [
              {
                key: "workspaces",
                kicker: "Section 1",
                title: "Workspaces",
                desc: "Organizations, members, invitations. Per-tenant overrides and plan visibility.",
                target: "orgs" as AdminTab,
                count: orgs.length,
                unit: "orgs",
                urgent: false,
              },
              {
                key: "sources",
                kicker: "Section 2",
                title: "Sources",
                desc: "Source registry, bulk add, provisional candidate review and tier classification.",
                target: "sources" as AdminTab,
                count: 0,
                unit: "provisional pending",
                urgent: false,
              },
              {
                key: "ingest",
                kicker: "Section 3",
                title: "Ingest",
                desc: "Staged updates, integrity flags, rejections, regulatory scan scheduling.",
                target: "staged" as AdminTab,
                count: stagedUpdates.length + integrityFlagCount + platformIntegrityFlagCount,
                unit: "open",
                urgent: integrityFlagCount > 0 || platformIntegrityFlagCount > 0,
              },
              {
                key: "coverage",
                kicker: "Section 4",
                title: "Coverage",
                desc: "Jurisdiction review, coverage matrix, gap analysis.",
                target: "jurisdiction-review" as AdminTab,
                count: 0,
                unit: "critical gaps",
                urgent: false,
              },
              {
                key: "research-pipeline",
                kicker: "Section 5",
                title: "Research pipeline",
                desc: "Editorial draft-staging (moved from customer-facing /research per design rebuild).",
                // H4 (2026-05-25): retargeted from "tier-opinions"
                // placeholder to the new "research-pipeline" destination
                // view (ResearchPipelineQueueView). Section card click
                // → destination view is the canonical /admin navigation
                // pattern per operator direction.
                target: "research-pipeline" as AdminTab,
                count: 0,
                unit: "drafts",
                urgent: false,
              },
              {
                key: "community-pickups",
                kicker: "Section 6",
                title: "Community pickups",
                desc: "High-engagement community posts pending promotion to platform intelligence.",
                // H5 (2026-05-25): retargeted from "tier-opinions"
                // placeholder to the new "community-pickups" destination
                // view (CommunityPickupsQueueView). Section card click →
                // destination view per the H4 pattern.
                target: "community-pickups" as AdminTab,
                count: 0,
                unit: "pending",
                urgent: false,
              },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveTab(s.target)}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: s.urgent ? "3px solid var(--critical)" : "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "18px 22px",
                textAlign: "left",
                cursor: "pointer",
                color: "inherit",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: s.urgent ? "var(--critical)" : "var(--text-2)",
                  marginBottom: 8,
                }}
              >
                {s.kicker}
                {s.urgent && s.count > 0 ? ` · ${s.count} attention` : ""}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  margin: "0 0 6px",
                  fontWeight: 400,
                  lineHeight: 1.1,
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--text-2)",
                  margin: "0 0 12px",
                  lineHeight: 1.55,
                }}
              >
                {s.desc}
              </p>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--text-2)",
                  borderTop: "1px solid var(--border-sub)",
                  paddingTop: 10,
                }}
              >
                <b style={{ color: s.urgent ? "var(--critical)" : "var(--text)", fontWeight: 700 }}>
                  {s.count}
                </b>{" "}
                {s.unit}
              </div>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--border)",
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                position: "relative",
                padding: "12px 20px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: activeTab === t.id ? "var(--accent)" : "var(--text-2)",
                borderBottom:
                  activeTab === t.id
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "1px 7px",
                    borderRadius: 999,
                    background: "var(--raised)",
                    color: "var(--text-2)",
                    fontWeight: 700,
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Organizations Tab */}
        {activeTab === "orgs" && (
          <div className="space-y-4">
            {/* Workspace-level orgs roster: id/name/slug/plan/created_at +
                derived member counts, role rosters, and last-activity proxy.
                Replaces the prior Phase D placeholder. Data comes from
                app/admin/page.tsx server fetch (initialOrgs + initialMembers);
                the OrganizationsTable component derives everything else
                without an extra query. */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Organizations ({orgs.length})
              </h2>
              <OrganizationsTable orgs={orgs} members={members} />
            </div>

            {/* Workspace member shortcut — kept until Phase D Profile-side
                management ships; covers the dev-mode path of inviting users
                to the current workspace. */}
            <div className="space-y-2 pt-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Current workspace · members
              </h2>
              <div
                className="flex gap-2 p-4 rounded-lg border"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                }}
              >
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Email address"
                  className="flex-1 px-3 py-2 text-sm rounded-md border outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-background)",
                    color: "var(--color-text-primary)",
                  }}
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="px-3 py-2 text-sm rounded-md border"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-background)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button variant="primary" size="md" onClick={addMember}>
                  <Plus size={14} />
                  Add
                </Button>
              </div>

              {members.length === 0 ? (
                <p className="text-xs px-1" style={{ color: "var(--color-text-secondary)" }}>
                  No workspace members yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => {
                    // Display: prefer profiles.full_name (joined via the
                    // user_id FK in loadData); fall back to a short uuid
                    // for older accounts that have no profiles row,
                    // and to "(no profile)" if the embed object is null
                    // entirely. Auth.users.email isn't readable via
                    // anon-RLS, so it can't be the fallback here.
                    // Migrated 2026-05-15 (075 Phase 2): user.name -> user.full_name.
                    const profileName: string | null =
                      (m.user && typeof m.user === "object" && "full_name" in m.user
                        ? (m.user as { full_name?: string | null }).full_name ?? null
                        : null) || null;
                    const displayName =
                      profileName ||
                      (m.user_id
                        ? `${m.user_id.slice(0, 8)}…`
                        : "(no profile)");
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-surface)",
                        }}
                      >
                        <div>
                          <p
                            className="text-sm font-medium"
                            style={{ color: "var(--color-text-primary)" }}
                            title={m.user_id}
                          >
                            {displayName}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {m.role} · joined{" "}
                            {new Date(m.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
                          style={{
                            color:
                              m.role === "owner"
                                ? "var(--color-primary)"
                                : "var(--color-text-secondary)",
                            backgroundColor: "var(--color-surface-raised)",
                          }}
                        >
                          {m.role}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Workstream B: invitations panel — admin can invite by email,
                view pending/recent invitations, and revoke. Lives below
                the members list so the workflow is contiguous. */}
            {orgIdFromAuth && <InvitationsPanel orgId={orgIdFromAuth} />}
          </div>
        )}

        {/* Source registry Tab — wraps existing SourceHealthDashboard */}
        {activeTab === "sources" && (
          <div className="space-y-4">
            {issueFilter && (
              <IssueFilterCaption
                label={issueFilterLabel(issueFilter)}
                onClear={() => setIssueFilter(null)}
              />
            )}
            <SourceHealthDashboard />
          </div>
        )}

        {/* Staged updates Tab */}
        {activeTab === "staged" && (
          <div className="space-y-4">
            {issueFilter && (
              <IssueFilterCaption
                label={issueFilterLabel(issueFilter)}
                onClear={() => setIssueFilter(null)}
              />
            )}
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Pending Staged Updates
            </h2>
            {stagedUpdates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                  No pending updates
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  When the monitoring worker detects changes, they appear here for review.
                </p>
              </div>
            ) : (
              stagedUpdates.map((update) => (
                <div
                  key={update.id}
                  className="p-4 rounded-lg border space-y-3"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
                      style={{
                        color: "var(--color-warning)",
                        backgroundColor: "rgba(217, 119, 6, 0.08)",
                        border: "1px solid rgba(217, 119, 6, 0.15)",
                      }}
                    >
                      {update.update_type}
                    </span>
                    <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                      {new Date(update.created_at).toLocaleString()}
                    </span>
                  </div>
                  {/* Show full proposed item details */}
                  {update.proposed_changes && (
                    <div className="space-y-1.5">
                      {update.proposed_changes.title && (
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                          {update.proposed_changes.title}
                        </p>
                      )}
                      {update.proposed_changes.summary && (
                        <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                          {update.proposed_changes.summary}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        {update.proposed_changes.priority && (
                          <span className="px-1.5 py-0.5 rounded font-semibold" style={{ color: "var(--color-warning)", backgroundColor: "rgba(217,119,6,0.08)" }}>
                            {update.proposed_changes.priority}
                          </span>
                        )}
                        {update.proposed_changes.status && (
                          <span className="px-1.5 py-0.5 rounded" style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-raised)" }}>
                            {update.proposed_changes.status}
                          </span>
                        )}
                        {update.proposed_changes.jurisdictions?.map((j: string) => (
                          <span key={j} className="px-1.5 py-0.5 rounded" style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-raised)" }}>
                            {j.toUpperCase()}
                          </span>
                        ))}
                        {update.proposed_changes.transport_modes?.map((m: string) => (
                          <span key={m} className="px-1.5 py-0.5 rounded" style={{ color: "var(--color-primary)", backgroundColor: "var(--color-active-bg)" }}>
                            {m}
                          </span>
                        ))}
                      </div>
                      {update.proposed_changes.source_url && (
                        <a href={update.proposed_changes.source_url} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] hover:underline" style={{ color: "var(--color-primary)" }}>
                          {update.proposed_changes.source_url}
                        </a>
                      )}
                      {update.proposed_changes.entry_into_force && (
                        <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          Effective: {update.proposed_changes.entry_into_force}
                        </p>
                      )}
                    </div>
                  )}
                  {!update.proposed_changes?.title && (
                    <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {update.reason || JSON.stringify(update.proposed_changes, null, 2)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleUpdate(update.id, "approve")}
                    >
                      <CheckCircle size={12} />
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleUpdate(update.id, "reject")}
                    >
                      <XCircle size={12} />
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Integrity flags Tab — W2.C
            Surfaces intelligence_items.agent_integrity_flag rows from
            migration 035. Component owns its own data fetching + actions
            against /api/admin/integrity-flags. */}
        {activeTab === "integrity-flags" && (
          <div className="space-y-4">
            {issueFilter && (
              <IssueFilterCaption
                label={issueFilterLabel(issueFilter)}
                onClear={() => setIssueFilter(null)}
              />
            )}
            <IntegrityFlagsView />
          </div>
        )}

        {/* Platform integrity flags Tab — Wave 4
            Surfaces the integrity_flags table from migration 048 (design_drift,
            data_quality, source_issue, coverage_gap, data_integrity,
            surface_concern). Distinct from the per-brief Integrity flags
            tab above; this is the durable queue for agent-detected concerns
            that don't tie to a single intelligence_items row.  */}
        {activeTab === "platform-integrity-flags" && (
          <div className="space-y-4">
            {issueFilter && (
              <IssueFilterCaption
                label={issueFilterLabel(issueFilter)}
                onClear={() => setIssueFilter(null)}
              />
            )}
            <PlatformIntegrityFlagsView />
          </div>
        )}

        {activeTab === "coverage-matrix" && (
          <div className="space-y-4">
            {issueFilter && (
              <IssueFilterCaption
                label={issueFilterLabel(issueFilter)}
                onClear={() => setIssueFilter(null)}
              />
            )}
            <CoverageMatrixView
              onAction={(action) => {
                if (action.kind === "bulk-add") {
                  setActiveTab("bulk-import");
                  setIssueFilter(`coverage:${action.jurisdictionIso}`);
                }
              }}
            />
          </div>
        )}

        {activeTab === "bulk-import" && (
          <div className="space-y-4">
            {issueFilter && (
              <IssueFilterCaption
                label={issueFilterLabel(issueFilter)}
                onClear={() => setIssueFilter(null)}
              />
            )}
            <BulkImportView />
          </div>
        )}

        {/* Phase 7 admin chrome — tier-opinion disagreement review surface.
            Sources where the brief-generation agent's tier opinions
            disagree with current base_tier; operator can accept (writes
            tier_override), reject (dismisses opinions), or defer. */}
        {activeTab === "tier-opinions" && (
          <div className="space-y-4">
            <TierOpinionDisagreementsView />
          </div>
        )}

        {/* H4 (2026-05-25): Section card 5 destination view. The Research
            editorial draft-staging surface moved from customer-facing
            /research to /admin per platform-intent SKILL Section 5
            correction; this is the canonical workflow surface. Reached
            via Section card click, not via the legacy 11-tab strip. */}
        {activeTab === "research-pipeline" && (
          <div className="space-y-4">
            <ResearchPipelineQueueView />
          </div>
        )}

        {/* H5 (2026-05-25): Section card 6 destination view. Engagement-
            heuristic suggestion queue for community-to-intelligence
            promotion. Same section-card → destination-view pattern as
            H4; not in the legacy 11-tab strip. */}
        {activeTab === "community-pickups" && (
          <div className="space-y-4">
            <CommunityPickupsQueueView />
          </div>
        )}

        {/* Phase 7 admin chrome — ingest rejections triage queue. */}
        {activeTab === "ingest-rejections" && (
          <div className="space-y-4">
            <IngestRejectionsView />
          </div>
        )}

        {/* Phase 7 admin chrome — pending jurisdiction-review triage queue. */}
        {activeTab === "jurisdiction-review" && (
          <div className="space-y-4">
            <PendingJurisdictionReviewView />
          </div>
        )}

        {/* Regulatory Scan Tab */}
        {activeTab === "scan" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Regulatory Scan
            </h2>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Search for new regulations using AI. Leave fields empty to scan all freight sustainability topics globally.
              Results are staged for your review — nothing is published automatically.
              Automated scans run Monday/Wednesday/Friday at 07:00 UTC.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Topic (e.g., carbon pricing, packaging, SAF)"
                value={scanTopic}
                onChange={(e) => setScanTopic(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-md border"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }}
              />
              <input
                type="text"
                placeholder="Jurisdiction (e.g., EU, US, UK)"
                value={scanJurisdiction}
                onChange={(e) => setScanJurisdiction(e.target.value)}
                className="w-40 px-3 py-2 text-sm rounded-md border"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-primary)" }}
              />
              <Button variant="primary" onClick={handleScan} disabled={scanning}>
                <Search size={14} />
                {scanning ? "Scanning..." : "Scan Now"}
              </Button>
            </div>

            {scanResult && (
              <div
                className="p-4 rounded-lg border"
                style={{
                  borderColor: scanResult.error ? "var(--color-error)" : "var(--color-success)",
                  backgroundColor: scanResult.error ? "rgba(220,38,38,0.04)" : "rgba(22,163,74,0.04)",
                }}
              >
                {scanResult.error ? (
                  <p className="text-sm" style={{ color: "var(--color-error)" }}>{scanResult.error}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      Scan complete: {scanResult.discovered} regulations found, {scanResult.new_items} new, {scanResult.staged} staged for review
                      {scanResult.new_sources_discovered > 0 && ` · ${scanResult.new_sources_discovered} new sources discovered`}
                    </p>
                    {scanResult.staged_titles?.length > 0 && (
                      <ul className="space-y-1">
                        {scanResult.staged_titles.map((title: string, i: number) => (
                          <li key={i} className="text-xs flex items-center gap-1.5" style={{ color: "var(--color-text-secondary)" }}>
                            <CheckCircle size={10} style={{ color: "var(--color-success)" }} />
                            {title}
                          </li>
                        ))}
                      </ul>
                    )}
                    {scanResult.new_source_names?.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs font-medium" style={{ color: "var(--color-primary)" }}>New sources added to registry:</span>
                        <ul className="mt-1 space-y-0.5">
                          {scanResult.new_source_names.map((name: string, i: number) => (
                            <li key={i} className="text-xs" style={{ color: "var(--color-text-secondary)" }}>+ {name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
                      Review staged items in the Staged Updates tab to approve or reject.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm font-medium shadow-lg"
            style={{
              borderColor: "var(--color-success)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-success)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          >
            <CheckCircle size={14} className="inline mr-1.5" />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

