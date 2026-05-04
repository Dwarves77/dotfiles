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
import { BulkImportView } from "@/components/admin/BulkImportView";
import { CoverageMatrixView } from "@/components/admin/CoverageMatrixView";

interface AdminDashboardProps {
  userId: string;
  userEmail: string;
  initialSources?: Source[];
  initialProvisionalSources?: ProvisionalSource[];
  initialOpenConflicts?: SourceConflict[];
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
  // Tab IDs match the design_handoff_2026-04/preview/admin.html structure.
  // "orgs" + "integrations" are placeholders pending Phase D multi-tenant
  // architecture; the four operational tabs (sources, staged, scan, audit)
  // map to existing functional code that ships now.
  //
  // "integrity-flags" and "coverage-matrix" are reserved for W2.C and W2.D
  // respectively. They appear as targets in the IssuesQueue tap-throughs;
  // when the IssuesQueue navigates to one before its tab body ships we
  // gracefully fall back to a sibling tab (see resolveAdminTab below).
  type AdminTab =
    | "orgs"
    | "integrations"
    | "sources"
    | "staged"
    | "scan"
    | "audit"
    | "integrity-flags"
    | "coverage-matrix"
    | "bulk-import";
  const KNOWN_RENDERED_TABS: ReadonlyArray<AdminTab> = [
    "orgs",
    "integrations",
    "sources",
    "staged",
    "scan",
    "audit",
    "integrity-flags",
    "coverage-matrix",
    "bulk-import",
  ];
  const [activeTab, setActiveTab] = useState<AdminTab>("orgs");
  const [issueFilter, setIssueFilter] = useState<string | null>(null);

  // IssuesQueue → tab navigation. When a tap-through targets a tab that
  // hasn't shipped yet ("integrity-flags" pre-W2.C, "coverage-matrix"
  // pre-W2.D), fall back to the closest live tab so the click never
  // dead-ends. Future Ws can drop these mappings as their tabs land.
  const resolveAdminTab = (tab: string): AdminTab => {
    if (KNOWN_RENDERED_TABS.includes(tab as AdminTab)) return tab as AdminTab;
    return "orgs";
  };
  const handleIssueNavigate = (tab: string, filter?: string) => {
    setActiveTab(resolveAdminTab(tab));
    setIssueFilter(filter ?? null);
  };
  const [members, setMembers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [stagedUpdates, setStagedUpdates] = useState<any[]>([]);
  const [integrityFlagCount, setIntegrityFlagCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [toast, setToast] = useState("");

  const supabase = createSupabaseBrowserClient();

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [orgRes, memberRes, updateRes, flagRes] = await Promise.all([
        supabase.from("organizations").select("*"),
        supabase.from("org_memberships").select("*"),
        supabase.from("staged_updates").select("*").eq("status", "pending").order("created_at", { ascending: false }),
        // Tab strip count — head:true keeps payload at zero rows. RLS may
        // block this for non-admins; failure path falls through to 0.
        supabase
          .from("intelligence_items")
          .select("id", { count: "exact", head: true })
          .eq("agent_integrity_flag", true)
          .is("agent_integrity_resolved_at", null),
      ]);

      setOrgs(orgRes.data || []);
      setMembers(memberRes.data || []);
      setStagedUpdates(updateRes.data || []);
      setIntegrityFlagCount(flagRes.count ?? 0);
    } catch {
      // RLS may block some queries — still show the UI
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const tabs: { id: AdminTab; label: string; count: number }[] = [
    { id: "orgs", label: "Organizations", count: orgs.length },
    { id: "integrations", label: "API & integrations", count: 0 },
    { id: "sources", label: "Source registry", count: 0 },
    { id: "staged", label: "Staged updates", count: stagedUpdates.length },
    { id: "integrity-flags", label: "Integrity flags", count: integrityFlagCount },
    { id: "coverage-matrix", label: "Coverage matrix", count: 0 },
    { id: "bulk-import", label: "Bulk add sources", count: 0 },
    { id: "scan", label: "Regulatory scan", count: 0 },
    { id: "audit", label: "Audit log", count: 0 },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <EditorialMasthead
        eyebrow="Caro's Ledge · Platform Operations"
        title="Admin"
        meta="Organizations · integrations · sources · staged updates · regulatory scan · audit"
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
            <ComingSoonBanner
              note="Multi-tenant organization management lands in Phase D. The list below shows orgs already provisioned in the database for the current admin scope. Per-org member, plan, and billing controls move to each org owner's Profile."
            />

            {orgs.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Organizations ({orgs.length})
                </h2>
                {orgs.map((org) => (
                  <div
                    key={org.id}
                    className="p-4 rounded-lg border"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                          {org.name}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {org.slug} · {org.plan}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
                        style={{
                          color: "var(--color-primary)",
                          backgroundColor: "var(--color-active-bg)",
                        }}
                      >
                        {org.plan}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-surface)",
                      }}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {m.profiles?.email || m.user_id}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {m.role} · joined {new Date(m.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
                        style={{
                          color: m.role === "owner" ? "var(--color-primary)" : "var(--color-text-secondary)",
                          backgroundColor: "var(--color-surface-raised)",
                        }}
                      >
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* API & integrations Tab — Coming soon */}
        {activeTab === "integrations" && (
          <div className="space-y-4">
            <ComingSoonBanner
              note="Integration catalog lands in Phase D. Master catalog (SAP, CBAM Reporting API, Slack, MS Teams, outbound webhooks, Oracle TMS, Salesforce Net Zero) will be published platform-wide and per-org enablement controlled here."
            />
            <div
              className="p-4 rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                Planned catalog
              </h2>
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                SAP S/4HANA · CBAM Reporting API (sandbox + production) · Slack alerting ·
                Microsoft Teams · Outbound webhooks · Oracle TMS · Salesforce Net Zero Cloud
              </p>
            </div>
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

        {/* Audit log Tab — placeholder (audit log surface lands in Phase D) */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <ComingSoonBanner
              note="Workspace-wide audit log lands in Phase D. Action history (member changes, source approvals, staged-update decisions) is already captured at the database level and will surface here once the audit_log read endpoint ships."
            />
            <div
              className="p-4 rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
                Last 30 days · workspace-wide
              </h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                No entries to display.
              </p>
            </div>
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

// ── Helpers ──

/**
 * ComingSoonBanner — placeholder banner for tabs whose backing service
 * isn't online yet. Used on Organizations / API & integrations / Audit.
 * Mirrors the navy admin-view banner above the tab strip but is amber-
 * tinted so it reads as informational rather than navigational.
 */
function ComingSoonBanner({ note }: { note: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        background: "var(--high-bg)",
        border: "1px solid var(--high-bd)",
        borderRadius: "var(--r-md)",
        padding: "12px 16px",
        fontSize: 12,
        color: "var(--text)",
        lineHeight: 1.55,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--high)",
          flexShrink: 0,
          marginTop: 5,
        }}
      />
      <span>
        <b style={{ color: "var(--high)", letterSpacing: "0.04em" }}>
          Coming soon — Phase D
        </b>{" "}
        — {note}
      </span>
    </div>
  );
}
