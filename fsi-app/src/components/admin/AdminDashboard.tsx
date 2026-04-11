"use client";

import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  Users, Building, FileCheck, Plus, Trash2,
  CheckCircle, XCircle, RefreshCw, Shield, ArrowLeft,
  Search, Radar,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_NAME } from "@/lib/constants";

interface AdminDashboardProps {
  userId: string;
  userEmail: string;
}

export function AdminDashboard({ userId, userEmail }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"users" | "orgs" | "updates" | "scan">("users");
  const [members, setMembers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [stagedUpdates, setStagedUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [toast, setToast] = useState("");

  const supabase = createSupabaseBrowserClient();

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [orgRes, memberRes, updateRes] = await Promise.all([
        supabase.from("organizations").select("*"),
        supabase.from("org_memberships").select("*"),
        supabase.from("staged_updates").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      ]);

      setOrgs(orgRes.data || []);
      setMembers(memberRes.data || []);
      setStagedUpdates(updateRes.data || []);
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

  // Add member to the dev org
  const addMember = async () => {
    if (!newEmail) return;

    // Look up user by email in auth.users (needs service role — use API route)
    const { error } = await supabase.from("org_memberships").insert({
      org_id: "a0000000-0000-0000-0000-000000000001",
      user_id: userId, // For now, add current user
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

  const tabs = [
    { id: "users" as const, label: "Users", icon: Users, count: members.length },
    { id: "orgs" as const, label: "Organizations", icon: Building, count: orgs.length },
    { id: "updates" as const, label: "Staged Updates", icon: FileCheck, count: stagedUpdates.length },
    { id: "scan" as const, label: "Regulatory Scan", icon: Radar, count: 0 },
  ];

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a
                href="/"
                className="flex items-center gap-1 text-xs transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <ArrowLeft size={12} />
                Dashboard
              </a>
            </div>
            <h1
              className="text-xl font-bold"
              style={{ color: "var(--color-text-primary)" }}
            >
              <Shield size={18} className="inline mr-2" />
              Admin Panel
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {userEmail} · {APP_NAME}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadData}>
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 border-b mb-6"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer"
              style={{
                color: activeTab === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              }}
            >
              <t.icon size={14} />
              {t.label}
              {t.count > 0 && (
                <span
                  className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--color-surface-raised)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {t.count}
                </span>
              )}
              {activeTab === t.id && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{ backgroundColor: "var(--color-primary)" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Workspace Members
            </h2>

            {/* Add member form */}
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

            {/* Member list */}
            {members.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                  No members yet
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  Add yourself as the first member using the form above.
                </p>
              </div>
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
        )}

        {/* Organizations Tab */}
        {activeTab === "orgs" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Organizations
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

        {/* Staged Updates Tab */}
        {activeTab === "updates" && (
          <div className="space-y-4">
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
