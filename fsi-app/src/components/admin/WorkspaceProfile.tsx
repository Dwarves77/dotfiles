"use client";

import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { SectorSelector } from "@/components/profile/SectorSelector";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Bell, Check, Save } from "lucide-react";

interface WorkspaceProfileProps {
  userId: string;
  userEmail: string;
}

export function WorkspaceProfile({ userId, userEmail }: WorkspaceProfileProps) {
  const { orgId, orgName, sectorProfile, setSectorProfile } = useWorkspaceStore();
  const [selectedSectors, setSelectedSectors] = useState<string[]>(sectorProfile);
  const [notifyOnActivation, setNotifyOnActivation] = useState(false);
  const [signupAt, setSignupAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("workspace_settings")
      .select("sector_profile, notify_on_sector_activation, sectors_activation_signup_at")
      .eq("org_id", orgId)
      .single()
      .then(({ data }) => {
        if (data?.sector_profile?.length) setSelectedSectors(data.sector_profile);
        if (typeof data?.notify_on_sector_activation === "boolean") {
          setNotifyOnActivation(data.notify_on_sector_activation);
        }
        if (data?.sectors_activation_signup_at) {
          setSignupAt(data.sectors_activation_signup_at);
        }
      });
  }, [orgId, supabase]);

  const toggleSector = (id: string) => {
    setSelectedSectors((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
    setSaved(false);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);

    const updates: Record<string, unknown> = {
      sector_profile: selectedSectors,
      notify_on_sector_activation: notifyOnActivation,
    };
    // Only stamp signup_at on first opt-in. Never overwrite once set.
    if (notifyOnActivation && !signupAt) {
      const now = new Date().toISOString();
      updates.sectors_activation_signup_at = now;
      setSignupAt(now);
    }

    const { error } = await supabase
      .from("workspace_settings")
      .update(updates)
      .eq("org_id", orgId);

    if (!error) {
      setSectorProfile(selectedSectors);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">
        <div className="mb-6">
          <a
            href="/"
            className="flex items-center gap-1 text-xs mb-2 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <ArrowLeft size={12} />
            Dashboard
          </a>
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Workspace Profile
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {orgName} · {userEmail}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h2
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Freight Sectors
            </h2>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Select the freight sectors your organization operates in. The platform will
              weight regulatory intelligence and filter recommendations based on your selection.
              You can change these at any time.
            </p>
          </div>

          <SectorSelector
            selectedSectors={selectedSectors}
            onToggle={toggleSector}
          />

          <label
            className="flex items-start gap-3 p-3 rounded-lg border mt-2 cursor-pointer"
            style={{
              borderColor: notifyOnActivation
                ? "var(--color-active-border)"
                : "var(--color-border)",
              backgroundColor: notifyOnActivation
                ? "var(--color-active-bg)"
                : "var(--color-surface)",
            }}
          >
            <input
              type="checkbox"
              checked={notifyOnActivation}
              onChange={(e) => {
                setNotifyOnActivation(e.target.checked);
                setSaved(false);
              }}
              className="mt-1"
            />
            <div className="flex-1">
              <div
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                <Bell size={14} />
                Notify me when per-sector reporting activates
              </div>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Per-sector synopses are on the platform roadmap. We&apos;ll let
                you know when they&apos;re available for your selected sectors.
                {signupAt && (
                  <>
                    {" "}You opted in on {new Date(signupAt).toLocaleDateString()}.
                  </>
                )}
              </p>
            </div>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={14} />
              {saving ? "Saving..." : "Save Sector Profile"}
            </Button>
            {saved && (
              <span
                className="text-xs font-medium flex items-center gap-1"
                style={{ color: "var(--color-success)" }}
              >
                <Check size={12} />
                Saved
              </span>
            )}
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {selectedSectors.length} sector{selectedSectors.length !== 1 ? "s" : ""} selected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
