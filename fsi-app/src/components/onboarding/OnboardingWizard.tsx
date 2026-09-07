"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ALL_SECTORS, MODES, JURISDICTIONS } from "@/lib/constants";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button } from "@/components/ui/Button";
import { BandTile } from "@/components/ui/BandTile";
import { BAND_ORDER, bandFromPriority } from "@/lib/urgency/bands";
import type { WorkspaceAggregates } from "@/lib/supabase-server";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { DEFAULT_NOTIFICATION_PREFS } from "@/components/profile/NotificationPreferences";
import { BriefingScheduleSection } from "@/components/settings/BriefingScheduleSection";
import { Check, AlertCircle, Star } from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// OnboardingWizard — UI system handoff 2026-09-06, README screen 17
// "Onboarding": three steps that produce the three things every page is
// scoped by — workspace (done before this component mounts, at
// /workspace/new), modes + jurisdictions, sectors — plus a fourth
// "Briefing" step (the artboard's own stepper shows four pills: Workspace
// checked, Modes & jurisdictions active, Sectors, Briefing). Assembled from
// AuthFrame + OnboardingStepper + BandTile (the band scale "taught here,
// once", per the artboard note) + the pre-existing NotificationPreferences.
//
// This REPLACES the pre-existing 5-step wizard (choose path: LinkedIn vs
// fresh -> identity form -> sectors -> notifications -> done). Neither
// "choose path" nor "identity" exist in the artboard's 4-step design, and
// the artboard wins over the prior implementation (dispatch instruction).
// Full-name capture already lives on /profile (Personal tab); dropping it
// here does not remove the only place a user can set it.
//
// DORMANCY FLAG (CLAUDE.md rule 13 — decision-ready, not silently dropped):
// the LinkedIn import path this replaces (src/app/api/auth/linkedin/start
// and /callback) has no other UI entry point in the app as of this lane.
// Those two API routes are now unreferenced from any page. They are OUTSIDE
// this lane's write set (src/app/api/auth/linkedin/**), so this lane cannot
// delete them; logged in DEVIATION-LOG.md as a decision-ready follow-up
// (exact files named) rather than left as an unflagged dormant control.
// ───────────────────────────────────────────────────────────────────────────

const HIGHLIGHTED_SECTOR_IDS = [
  "fine-art",
  "live-events",
  "luxury-goods",
  "film-tv",
  "automotive",
  "humanitarian",
];

type Step = 2 | 3 | 4 | 5;

interface Props {
  userId: string;
  userEmail: string;
  orgId: string;
  /** Workspace-wide band counts (migration 068, same accessor the
   *  dashboard reads) — the step-2 preview panel shows these real counts
   *  rather than a live recompute against the in-progress mode/jurisdiction
   *  selection: no accessor exists to filter aggregates by an unsaved
   *  selection, and fabricating numbers is forbidden (CLAUDE.md rule 2).
   *  Logged in DEVIATION-LOG.md. */
  aggregates: WorkspaceAggregates;
}

export function OnboardingWizard({ userId, userEmail, orgId, aggregates }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const setSectorProfile = useWorkspaceStore((s) => s.setSectorProfile);

  const [step, setStep] = useState<Step>(2);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Step 2 — Modes & jurisdictions
  const [modes, setModes] = useState<string[]>([]);
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [showAllJurisdictions, setShowAllJurisdictions] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);

  // Step 3 — Sectors
  const [sectors, setSectors] = useState<string[]>([]);
  const [savingSectors, setSavingSectors] = useState(false);
  const [sectorError, setSectorError] = useState<string | null>(null);

  // Prefill from the existing profile row (mirrors the pattern the prior
  // wizard used for its own identity prefill — a single-row read by primary
  // key, not a bulk/unbounded query).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("jurisdiction_overrides, transport_mode_overrides")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || !data) {
        setLoadingProfile(false);
        return;
      }
      if (Array.isArray(data.transport_mode_overrides) && data.transport_mode_overrides.length > 0) {
        setModes(data.transport_mode_overrides);
      }
      if (Array.isArray(data.jurisdiction_overrides) && data.jurisdiction_overrides.length > 0) {
        setJurisdictions(data.jurisdiction_overrides);
      }
      setLoadingProfile(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const orderedSectors = useMemo(() => {
    const highlighted = HIGHLIGHTED_SECTOR_IDS.map((id) =>
      ALL_SECTORS.find((s) => s.id === id)
    ).filter(Boolean) as typeof ALL_SECTORS;
    const rest = ALL_SECTORS.filter((s) => !HIGHLIGHTED_SECTOR_IDS.includes(s.id));
    return { highlighted, rest };
  }, []);

  const toggleMode = (id: string) =>
    setModes((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const toggleJurisdiction = (id: string) =>
    setJurisdictions((prev) => (prev.includes(id) ? prev.filter((j) => j !== id) : [...prev, id]));

  const toggleSector = (id: string) =>
    setSectors((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  // ── Persistence — writes to `profiles` (jurisdiction_overrides,
  // transport_mode_overrides). No existing writer touches these two
  // columns as of this lane (only UserProfilePage.tsx reads them, as a
  // read-only summary that points at Settings) — this is the first write
  // path for them, using the same simple update-by-id pattern the prior
  // wizard already used for `profiles.full_name`. ──────────────────────
  const persistScope = async () => {
    setScopeError(null);
    setSavingScope(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        transport_mode_overrides: modes,
        jurisdiction_overrides: jurisdictions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    setSavingScope(false);
    if (error) {
      setScopeError(error.message);
      return false;
    }
    return true;
  };

  // Unchanged from the prior wizard — writes the workspace-anchored
  // destination the dashboard actually reads (see original comment, kept).
  const persistSectors = async () => {
    setSectorError(null);
    setSavingSectors(true);
    const { error } = await supabase
      .from("workspace_settings")
      .update({ sector_profile: sectors })
      .eq("org_id", orgId);
    setSavingSectors(false);
    if (error) {
      setSectorError(error.message);
      return false;
    }
    setSectorProfile(sectors);
    return true;
  };

  const seedNotificationDefaults = async () => {
    await supabase.from("notification_preferences").upsert(
      {
        user_id: userId,
        ...DEFAULT_NOTIFICATION_PREFS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
  };

  const goNext = async () => {
    if (step === 2) {
      const ok = await persistScope();
      if (ok) setStep(3);
      return;
    }
    if (step === 3) {
      const ok = await persistSectors();
      if (ok) {
        await seedNotificationDefaults();
        setStep(4);
      }
      return;
    }
    if (step === 4) {
      setStep(5);
    }
  };

  const goBack = () => {
    if (step === 2) return;
    setStep((s) => (s - 1) as Step);
  };

  const skip = () => router.push("/");

  const stepperCurrent = step === 5 ? 4 : (step as 2 | 3 | 4);

  if (step === 5) {
    return <StepDone router={router} />;
  }

  return (
    <AuthFrame>
      <div style={{ width: 520, display: "flex", flexDirection: "column", gap: 18 }}>
        <OnboardingStepper current={stepperCurrent} />

        {step === 2 && (
          <StepModesJurisdictions
            modes={modes}
            jurisdictions={jurisdictions}
            showAll={showAllJurisdictions}
            onToggleMode={toggleMode}
            onToggleJurisdiction={toggleJurisdiction}
            onShowAll={() => setShowAllJurisdictions(true)}
            aggregates={aggregates}
            loading={loadingProfile}
            error={scopeError}
          />
        )}

        {step === 3 && (
          <StepSectors
            highlighted={orderedSectors.highlighted}
            rest={orderedSectors.rest}
            selected={sectors}
            onToggle={toggleSector}
            error={sectorError}
          />
        )}

        {step === 4 && <StepBriefing />}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {step > 2 ? (
            <button
              type="button"
              onClick={goBack}
              style={{ fontSize: "var(--fs-125)", fontWeight: 600, color: "var(--ink)", background: "none", border: "none", cursor: "pointer" }}
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={skip}
              style={{ padding: "8px 14px", fontSize: "var(--fs-125)", fontWeight: 600, whiteSpace: "nowrap" }}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={goNext}
              disabled={
                (step === 2 && (savingScope || modes.length === 0 || jurisdictions.length === 0)) ||
                (step === 3 && (savingSectors || sectors.length === 0))
              }
              style={{ padding: "8px 14px", fontSize: "var(--fs-125)", fontWeight: 700, whiteSpace: "nowrap" }}
            >
              {step === 2 && "Continue → Sectors"}
              {step === 3 && "Continue → Briefing"}
              {step === 4 && "Finish"}
            </Button>
          </div>
        </div>
      </div>
    </AuthFrame>
  );
}

// ── Step 2 — Modes & jurisdictions ─────────────────────────────────────────

function StepModesJurisdictions({
  modes,
  jurisdictions,
  showAll,
  onToggleMode,
  onToggleJurisdiction,
  onShowAll,
  aggregates,
  loading,
  error,
}: {
  modes: string[];
  jurisdictions: string[];
  showAll: boolean;
  onToggleMode: (id: string) => void;
  onToggleJurisdiction: (id: string) => void;
  onShowAll: () => void;
  aggregates: WorkspaceAggregates;
  loading: boolean;
  error: string | null;
}) {
  const shown = showAll ? JURISDICTIONS : JURISDICTIONS.slice(0, 6);
  const remaining = JURISDICTIONS.length - shown.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontSize: 24,
            lineHeight: 1.1,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Where do you move freight?
        </h1>
        <p style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5, maxWidth: "62ch" }}>
          This scopes every count, tile and row you will see. Change it any
          time in Account → Jurisdictions.
        </p>
      </div>

      <div>
        <SectionHeader>Modes</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {MODES.map((m) => (
            <ChoiceChip key={m.id} label={m.label} selected={modes.includes(m.id)} onToggle={() => onToggleMode(m.id)} />
          ))}
        </div>
      </div>

      <div>
        <SectionHeader>Home jurisdictions · {jurisdictions.length} selected</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {shown.map((j) => (
            <ChoiceChip
              key={j.id}
              label={j.label}
              selected={jurisdictions.includes(j.id)}
              onToggle={() => onToggleJurisdiction(j.id)}
            />
          ))}
        </div>
        {!showAll && remaining > 0 && (
          <button
            type="button"
            onClick={onShowAll}
            style={{
              fontSize: "var(--fs-12)",
              fontWeight: 600,
              color: "var(--ink)",
              background: "none",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
              marginTop: 8,
              padding: 0,
            }}
          >
            + {remaining} more jurisdictions
          </button>
        )}
      </div>

      <div
        style={{
          background: "var(--page)",
          border: "1px solid var(--line-1)",
          borderRadius: 8,
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Preview · your workspace today
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {BAND_ORDER.map((band) => (
            <BandTile
              key={band.key}
              band={band}
              count={aggregates.byPriority[band.priority]}
              loading={loading}
            />
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
    </div>
  );
}

function ChoiceChip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        minHeight: 44,
        border: `1px solid ${selected ? "var(--brand)" : "rgba(0,0,0,.15)"}`,
        borderRadius: "var(--radius-control)",
        fontSize: "var(--fs-125)",
        background: selected ? "var(--tag)" : "var(--card)",
        cursor: "pointer",
        textAlign: "left",
        color: "var(--ink)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: "none",
          width: 13,
          height: 13,
          border: `1.5px solid ${selected ? "var(--brand)" : "rgba(0,0,0,.3)"}`,
          borderRadius: 3,
          background: selected ? "var(--brand)" : "var(--card)",
          boxSizing: "border-box",
        }}
      />
      {label}
    </button>
  );
}

// ── Step 3 — Sectors ────────────────────────────────────────────────────────

function StepSectors({
  highlighted,
  rest,
  selected,
  onToggle,
  error,
}: {
  highlighted: typeof ALL_SECTORS;
  rest: typeof ALL_SECTORS;
  selected: string[];
  onToggle: (id: string) => void;
  error: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontSize: 24,
            lineHeight: 1.1,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Which sectors do you watch?
        </h1>
        <p style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
          Pick all that apply. We use these to weight regulatory urgency,
          filter feeds, and translate intelligence into your context. You
          can change them any time.
        </p>
      </div>

      <div>
        <SectionHeader>
          <Star size={11} style={{ display: "inline-block", marginRight: 4 }} />
          Highlighted niches
        </SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
          {highlighted.map((s) => (
            <SectorPill key={s.id} label={s.label} selected={selected.includes(s.id)} onToggle={() => onToggle(s.id)} highlighted />
          ))}
        </div>
      </div>

      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        <SectionHeader>All sectors</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
          {rest.map((s) => (
            <SectorPill key={s.id} label={s.label} selected={selected.includes(s.id)} onToggle={() => onToggle(s.id)} />
          ))}
        </div>
      </div>

      <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-3)" }}>
        {selected.length === 0
          ? "Pick at least one sector to continue."
          : `${selected.length} sector${selected.length !== 1 ? "s" : ""} selected.`}
      </p>

      {error && <ErrorBanner message={error} />}
    </div>
  );
}

function SectorPill({
  label,
  selected,
  onToggle,
  highlighted,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        minHeight: 44,
        borderRadius: "var(--radius-control)",
        border: `1px solid ${selected ? "var(--brand)" : "rgba(0,0,0,.15)"}`,
        background: selected ? "var(--tag)" : "var(--card)",
        textAlign: "left",
        fontSize: "var(--fs-125)",
        cursor: "pointer",
        fontWeight: selected ? 600 : 400,
        color: "var(--ink)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: "none",
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1px solid ${selected ? "var(--brand)" : "rgba(0,0,0,.25)"}`,
          background: selected ? "var(--brand)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && <Check size={10} color="white" />}
      </span>
      {highlighted && <Star size={9} style={{ color: "var(--brand)" }} />}
      {label}
    </button>
  );
}

// ── Step 4 — Briefing ────────────────────────────────────────────────────────
//
// FOLD-56 (F9, operator ruling 3, 2026-09-07): "keep it. Build from the Settings
// Briefing schedule card in the step frame." Renders the SAME BriefingScheduleSection
// (src/components/settings/BriefingScheduleSection.tsx) Settings mounts — same
// cadence/day/time/jurisdiction-weight fields, same workspace_settings.alert_config
// read-modify-write API — inside this step's own frame, so there is ONE
// briefing-schedule implementation, not a second onboarding-local form. Replaces
// the step's prior NotificationPreferences mount (a different concern — in-app
// notification-channel toggles, not the briefing cadence/schedule).
function StepBriefing() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontSize: 24,
            lineHeight: 1.1,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          How should we brief you?
        </h1>
        <p style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
          We&apos;ve started you off with a conservative set of defaults.
          Higher-volume notifications are off until you opt in. You can
          change these any time from Settings.
        </p>
      </div>
      <BriefingScheduleSection />
    </div>
  );
}

// ── Step 5 — Done ────────────────────────────────────────────────────────────

function StepDone({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <AuthFrame>
      <div style={{ width: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--accent-bg)",
            color: "var(--brand)",
          }}
        >
          <Check size={22} />
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontSize: 24,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          You&apos;re set up
        </h1>
        <p style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)", lineHeight: 1.5 }}>
          Your dashboard is filtered against your modes, jurisdictions and
          sector profile, and your briefing is conservative by default. You
          can revisit any of this from Account or Settings any time.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Button variant="primary" onClick={() => router.push("/")} style={{ padding: "10px 16px", fontSize: "var(--fs-125)", fontWeight: 700 }}>
            Go to dashboard
          </Button>
          <Button variant="secondary" onClick={() => router.push("/community")} style={{ padding: "10px 16px", fontSize: "var(--fs-125)", fontWeight: 600 }}>
            Browse the community
          </Button>
        </div>
      </div>
    </AuthFrame>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        fontWeight: 700,
        marginBottom: 6,
        marginTop: 0,
      }}
    >
      {children}
    </h3>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 10,
        borderRadius: "var(--radius-control)",
        background: "var(--immediate-tint)",
        border: "1px solid rgba(220,38,38,.2)",
        color: "var(--immediate)",
        fontSize: "var(--fs-125)",
      }}
    >
      <AlertCircle size={14} />
      {message}
    </div>
  );
}
