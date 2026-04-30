"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { SectorSelector } from "@/components/profile/SectorSelector";
import { Button } from "@/components/ui/Button";
import { Bell, ArrowRight } from "lucide-react";

interface SectorOnboardingProps {
  userId: string;
  userEmail: string;
}

export function SectorOnboarding({ userId, userEmail }: SectorOnboardingProps) {
  const router = useRouter();
  const { orgId, orgName, setSectorProfile } = useWorkspaceStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [notifyOnActivation, setNotifyOnActivation] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createSupabaseBrowserClient();

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const handleSubmit = async () => {
    if (!orgId || selected.length === 0) return;
    setSaving(true);

    const updates: Record<string, unknown> = {
      sector_profile: selected,
      notify_on_sector_activation: notifyOnActivation,
    };
    if (notifyOnActivation) {
      updates.sectors_activation_signup_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("workspace_settings")
      .update(updates)
      .eq("org_id", orgId);

    if (!error) {
      setSectorProfile(selected);
      router.push("/");
    }
    setSaving(false);
  };

  const handleSkip = () => {
    router.push("/");
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p
            className="text-xs uppercase tracking-wide mb-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Welcome · {orgName || userEmail}
          </p>
          <h1
            className="text-2xl font-bold mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            Tell us which sectors you operate in
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Caro&apos;s Ledge weights regulatory intelligence and filters
            recommendations against your sector profile. Pick all that apply —
            you can change these any time from your workspace settings.
          </p>
        </div>

        <SectorSelector selectedSectors={selected} onToggle={toggle} />

        <label
          className="flex items-start gap-3 p-3 rounded-lg border mt-6 cursor-pointer"
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
            onChange={(e) => setNotifyOnActivation(e.target.checked)}
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
            </p>
          </div>
        </label>

        <div className="flex items-center gap-3 mt-6">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={saving || selected.length === 0}
          >
            {saving ? "Saving..." : "Continue"}
            <ArrowRight size={14} />
          </Button>
          <button
            onClick={handleSkip}
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Skip for now
          </button>
          <span
            className="text-xs ml-auto"
            style={{ color: "var(--color-text-muted)" }}
          >
            {selected.length} sector{selected.length !== 1 ? "s" : ""} selected
          </span>
        </div>
      </div>
    </div>
  );
}
