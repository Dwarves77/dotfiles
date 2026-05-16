"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { JURISDICTIONS } from "@/lib/constants";
import { Toast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { Save, Mail, Bell } from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// BriefingScheduleSection (PR-L Settings restoration — Decision #14, F9)
//
// Cadence + time + jurisdictions + delivery method for the weekly briefing.
//
// Storage: workspace_settings.alert_config (JSONB) augmented with
//   { briefingDay, briefingTime, briefingCadence, briefingDelivery,
//     briefingJurisdictions }.
// Existing fields (priorities, briefingDay) are preserved. The settingsStore
// already reads/writes briefingDay; this component extends the same JSONB
// document with the additional schedule fields, keeping in-app state in
// the store and persisting to Supabase via direct workspace_settings update.
//
// Delivery method shows in-app today; email/push are surfaced as
// "available in Phase D" per the existing Phase C scope marker on
// NotificationPreferences.
// ───────────────────────────────────────────────────────────────────────────

type Cadence = "daily" | "weekly" | "biweekly";
type Delivery = "in_app" | "email";

interface ScheduleState {
  cadence: Cadence;
  day: string; // monday..friday
  time: string; // HH:MM 24h, local TZ
  jurisdictions: string[];
  delivery: Delivery;
}

const DEFAULT_SCHEDULE: ScheduleState = {
  cadence: "weekly",
  day: "monday",
  time: "08:00",
  jurisdictions: [],
  delivery: "in_app",
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

export function BriefingScheduleSection() {
  const orgId = useSettingsStore((s) => s.orgId);
  const briefingDay = useSettingsStore((s) => s.briefingDay);
  const setBriefingDay = useSettingsStore((s) => s.setBriefingDay);
  const userRole = useWorkspaceStore((s) => s.userRole);

  // Workspace-level settings are owner/admin scoped. Members/viewers see
  // the current schedule but can't change it (mirrors workspace_settings
  // RLS gate; we render disabled controls so it's clear *why*).
  const canEdit = userRole === "owner" || userRole === "admin";

  const [schedule, setSchedule] = useState<ScheduleState>({
    ...DEFAULT_SCHEDULE,
    day: briefingDay,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  // Load on mount: workspace_settings.alert_config has the full schedule
  // payload. The settingsStore already loaded briefingDay/priorities; we
  // refetch the row here once to pick up the extended fields.
  useEffect(() => {
    if (!orgId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("workspace_settings")
        .select("alert_config")
        .eq("org_id", orgId)
        .maybeSingle();

      if (cancelled) return;
      const ac = (data?.alert_config ?? {}) as Record<string, unknown>;
      setSchedule({
        cadence: (ac.briefingCadence as Cadence) ?? "weekly",
        day: (ac.briefingDay as string) ?? briefingDay,
        time: (ac.briefingTime as string) ?? "08:00",
        jurisdictions:
          (ac.briefingJurisdictions as string[] | undefined) ?? [],
        delivery: (ac.briefingDelivery as Delivery) ?? "in_app",
      });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, briefingDay]);

  const updateField = <K extends keyof ScheduleState>(
    key: K,
    value: ScheduleState[K]
  ) => {
    setSchedule((prev) => ({ ...prev, [key]: value }));
  };

  const toggleJurisdiction = (id: string) => {
    setSchedule((prev) => ({
      ...prev,
      jurisdictions: prev.jurisdictions.includes(id)
        ? prev.jurisdictions.filter((j) => j !== id)
        : [...prev.jurisdictions, id],
    }));
  };

  const save = async () => {
    if (!orgId || !canEdit) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // Preserve existing fields (priorities, etc.) — read-modify-write
      // on the JSONB document.
      const { data: row } = await supabase
        .from("workspace_settings")
        .select("alert_config")
        .eq("org_id", orgId)
        .maybeSingle();

      const existingAlertConfig = (row?.alert_config ?? {}) as Record<
        string,
        unknown
      >;

      const next = {
        ...existingAlertConfig,
        briefingCadence: schedule.cadence,
        briefingDay: schedule.day,
        briefingTime: schedule.time,
        briefingDelivery: schedule.delivery,
        briefingJurisdictions: schedule.jurisdictions,
      };

      await supabase
        .from("workspace_settings")
        .update({ alert_config: next })
        .eq("org_id", orgId);

      // Keep settingsStore.briefingDay in sync (it powers the legacy
      // DashboardSettings dropdown that still renders elsewhere).
      setBriefingDay(schedule.day as typeof briefingDay);

      setToast({ message: "Briefing schedule saved", visible: true });
    } catch {
      setToast({ message: "Could not save schedule", visible: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {canEdit
            ? "Tune how often we send the briefing, when it lands, and which jurisdictions it weights."
            : "Your workspace owner controls the briefing schedule. You see what's coming."}
        </p>
        {!orgId && loaded && (
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Schedule is workspace-scoped. Join or create a workspace to
            persist preferences.
          </p>
        )}
      </div>

      {/* Cadence */}
      <Field label="Cadence">
        <ChipRow>
          {(
            [
              { id: "daily", label: "Daily" },
              { id: "weekly", label: "Weekly" },
              { id: "biweekly", label: "Biweekly" },
            ] as const
          ).map((opt) => (
            <Chip
              key={opt.id}
              label={opt.label}
              selected={schedule.cadence === opt.id}
              onClick={() => updateField("cadence", opt.id)}
              disabled={!canEdit}
            />
          ))}
        </ChipRow>
      </Field>

      {/* Day (only if weekly/biweekly) */}
      {schedule.cadence !== "daily" && (
        <Field label="Day">
          <ChipRow>
            {DAYS.map((d) => (
              <Chip
                key={d}
                label={d.slice(0, 3).toUpperCase()}
                selected={schedule.day === d}
                onClick={() => updateField("day", d)}
                disabled={!canEdit}
              />
            ))}
          </ChipRow>
        </Field>
      )}

      {/* Time */}
      <Field label="Time (24h, your local timezone)">
        <input
          type="time"
          value={schedule.time}
          onChange={(e) => updateField("time", e.target.value)}
          disabled={!canEdit}
          className="px-3 py-2 text-sm rounded-md border outline-none disabled:cursor-not-allowed"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-primary)",
            opacity: canEdit ? 1 : 0.6,
          }}
        />
      </Field>

      {/* Jurisdictions */}
      <Field
        label="Weight these jurisdictions"
        meta={
          schedule.jurisdictions.length === 0
            ? "All jurisdictions weighted equally"
            : `${schedule.jurisdictions.length} selected`
        }
      >
        <ChipRow wrap>
          {JURISDICTIONS.map((j) => (
            <Chip
              key={j.id}
              label={j.label}
              selected={schedule.jurisdictions.includes(j.id)}
              onClick={() => toggleJurisdiction(j.id)}
              disabled={!canEdit}
            />
          ))}
        </ChipRow>
      </Field>

      {/* Delivery */}
      <Field label="Delivery">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DeliveryCard
            icon={<Bell size={14} />}
            label="In-app"
            description="Lands in your dashboard. Available now."
            selected={schedule.delivery === "in_app"}
            onClick={() => updateField("delivery", "in_app")}
            disabled={!canEdit}
          />
          <DeliveryCard
            icon={<Mail size={14} />}
            label="Email"
            description="Phase D — currently captured but not yet sent."
            selected={schedule.delivery === "email"}
            onClick={() => updateField("delivery", "email")}
            disabled={!canEdit}
            phaseD
          />
        </div>
      </Field>

      <div>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || !canEdit || !orgId}
        >
          {saving ? (
            "Saving…"
          ) : (
            <>
              <Save size={14} />
              Save schedule
            </>
          )}
        </Button>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDismiss={() => setToast({ message: "", visible: false })}
      />
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Field({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span
          className="text-[10px] font-semibold uppercase"
          style={{
            letterSpacing: "0.14em",
            color: "var(--color-text-muted)",
          }}
        >
          {label}
        </span>
        {meta && (
          <span
            className="text-[11px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ChipRow({
  children,
  wrap,
}: {
  children: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <div className={cn("flex gap-1.5", wrap && "flex-wrap")}>{children}</div>
  );
}

function Chip({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className="px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer transition-colors disabled:cursor-not-allowed"
      style={{
        backgroundColor: selected
          ? "var(--color-active-bg)"
          : "var(--color-surface)",
        color: selected
          ? "var(--color-text-primary)"
          : "var(--color-text-secondary)",
        borderColor: selected
          ? "var(--color-primary)"
          : "var(--color-border)",
        opacity: disabled && !selected ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

function DeliveryCard({
  icon,
  label,
  description,
  selected,
  onClick,
  disabled,
  phaseD,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  phaseD?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className="rounded-md border p-3 text-left cursor-pointer transition-colors disabled:cursor-not-allowed"
      style={{
        borderColor: selected
          ? "var(--color-primary)"
          : "var(--color-border)",
        backgroundColor: selected
          ? "var(--color-active-bg)"
          : "var(--color-surface)",
        opacity: disabled && !selected ? 0.6 : 1,
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--color-text-secondary)" }}>{icon}</span>
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </span>
        {phaseD && (
          <span
            className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
            style={{
              letterSpacing: "0.1em",
              color: "var(--color-text-muted)",
              backgroundColor: "var(--color-surface-overlay)",
            }}
          >
            Phase D
          </span>
        )}
      </div>
      <p
        className="text-xs mt-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        {description}
      </p>
    </button>
  );
}
