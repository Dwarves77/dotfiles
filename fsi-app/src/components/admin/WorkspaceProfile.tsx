"use client";

import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ALL_SECTORS } from "@/lib/constants";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Check, Save } from "lucide-react";

interface WorkspaceProfileProps {
  userId: string;
  userEmail: string;
}

export function WorkspaceProfile({ userId, userEmail }: WorkspaceProfileProps) {
  const { orgId, orgName, sectorProfile, setSectorProfile } = useWorkspaceStore();
  const [selectedSectors, setSelectedSectors] = useState<string[]>(sectorProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const supabase = createSupabaseBrowserClient();

  // Load from DB on mount
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("workspace_settings")
      .select("sector_profile")
      .eq("org_id", orgId)
      .single()
      .then(({ data }) => {
        if (data?.sector_profile?.length) {
          setSelectedSectors(data.sector_profile);
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

    const { error } = await supabase
      .from("workspace_settings")
      .update({ sector_profile: selectedSectors })
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
        {/* Header */}
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

        {/* Sector Selection */}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_SECTORS.map((sector) => {
              const isSelected = selectedSectors.includes(sector.id);
              return (
                <button
                  key={sector.id}
                  onClick={() => toggleSector(sector.id)}
                  className="flex items-center gap-3 p-3 rounded-lg border text-left cursor-pointer transition-colors"
                  style={{
                    borderColor: isSelected ? "var(--color-active-border)" : "var(--color-border)",
                    backgroundColor: isSelected ? "var(--color-active-bg)" : "var(--color-surface)",
                  }}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center shrink-0 border"
                    style={{
                      borderColor: isSelected ? "var(--color-primary)" : "var(--color-border)",
                      backgroundColor: isSelected ? "var(--color-primary)" : "transparent",
                    }}
                  >
                    {isSelected && <Check size={12} color="white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {sector.label}
                    </span>
                    <p
                      className="text-[11px] mt-0.5 line-clamp-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Keywords: {sector.keywords.slice(0, 4).join(", ")}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Save */}
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
