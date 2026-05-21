"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ALL_SECTORS } from "@/lib/constants";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button } from "@/components/ui/Button";
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFS } from "@/components/profile/NotificationPreferences";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Linkedin,
  Sparkles,
  AlertCircle,
  Star,
} from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// OnboardingWizard
// 4-step full-page wizard. Lives at /onboarding (NOT a modal) so users can
// return to re-run setup any time.
//
// Step 1 — Choose path
// Step 2 — Identity (fresh path only)
// Step 3 — Sector profile (SectorSelector reused, highlighted niches up top)
// Step 4 — Notifications (NotificationPreferences reused)
// Done   — confirmation + "Browse the community" CTA → /community
// ───────────────────────────────────────────────────────────────────────────

// The 6 highlighted niches (per design preview & project context). These are
// the specialized high-value cargo sectors that ride at the top of the sector
// picker. The IDs match the entries in ALL_SECTORS.
const HIGHLIGHTED_SECTOR_IDS = [
  "fine-art",
  "live-events",
  "luxury-goods",
  "film-tv",
  "automotive",
  "humanitarian",
];

const REGION_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "americas", label: "Americas" },
  { id: "europe", label: "Europe" },
  { id: "asia-pacific", label: "Asia-Pacific" },
  { id: "middle-east", label: "Middle East" },
  { id: "africa", label: "Africa" },
  { id: "global", label: "Global / multi-region" },
];

type Step = 1 | 2 | 3 | 4 | 5;

interface Props {
  userId: string;
  userEmail: string;
  orgId: string;
  // True when LINKEDIN_CLIENT_ID is provisioned for the current deployment.
  // When false, the wizard renders the LinkedIn card disabled with a
  // "not configured for this deployment" affordance rather than wiring the
  // start endpoint (which would itself short-circuit to ?linkedin=error).
  linkedinEnabled?: boolean;
}

// Maps the failure-reason keys emitted by /api/auth/linkedin/callback to
// user-facing toast copy. Unknown reasons fall through to a generic message.
const LINKEDIN_ERROR_COPY: Record<string, string> = {
  "not-configured": "LinkedIn import is not configured for this deployment.",
  "not-authenticated": "Sign in first, then try LinkedIn import again.",
  "state-mismatch": "LinkedIn import expired or the link was tampered with. Please try again.",
  "missing-code": "LinkedIn didn't return an authorization code. Please try again.",
  "provider-denied": "LinkedIn declined the request, or you cancelled the prompt.",
  "token-exchange-failed": "Couldn't complete the LinkedIn handshake. Please try again.",
  "profile-fetch-failed": "Couldn't read your LinkedIn profile. Please try again.",
  "profile-upsert-failed": "We imported the LinkedIn data but couldn't save it. Please try again.",
};

function linkedinErrorMessage(reason: string | null): string {
  if (!reason) return "LinkedIn import failed. Please try again.";
  return LINKEDIN_ERROR_COPY[reason] ?? "LinkedIn import failed. Please try again.";
}

export function OnboardingWizard({ userId, userEmail, orgId, linkedinEnabled = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();
  const setSectorProfile = useWorkspaceStore((s) => s.setSectorProfile);

  const [step, setStep] = useState<Step>(1);
  const [path, setPath] = useState<"fresh" | "linkedin" | null>(null);

  // Step 2 — Identity
  const [name, setName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [role, setRole] = useState("");
  const [employer, setEmployer] = useState("");
  const [region, setRegion] = useState("global");
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [savingIdentity, setSavingIdentity] = useState(false);

  // LinkedIn round-trip toast (non-modal). Set by the ?linkedin=error&reason=
  // detector below and dismissed automatically after a short window.
  const [linkedinToast, setLinkedinToast] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  // Step 3 — Sectors
  const [sectors, setSectors] = useState<string[]>([]);
  const [savingSectors, setSavingSectors] = useState(false);
  const [sectorError, setSectorError] = useState<string | null>(null);

  // Sort sector list with highlighted up top, in the order specified.
  const orderedSectors = useMemo(() => {
    const highlighted = HIGHLIGHTED_SECTOR_IDS.map((id) =>
      ALL_SECTORS.find((s) => s.id === id)
    ).filter(Boolean) as typeof ALL_SECTORS;
    const rest = ALL_SECTORS.filter(
      (s) => !HIGHLIGHTED_SECTOR_IDS.includes(s.id)
    );
    return { highlighted, rest };
  }, []);

  const toggleSector = (id: string) =>
    setSectors((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  // LinkedIn round-trip handler. The callback route redirects back here with
  // either ?linkedin=imported (success) or ?linkedin=error&reason=... On
  // success we read the now-updated profile row and prefill the identity
  // step so the user can review and continue. On failure we raise a non-
  // modal toast and stay on step 1 so the user can retry or fall back to
  // "Start fresh".
  useEffect(() => {
    const status = searchParams.get("linkedin");
    if (!status) return;

    // Strip the query params so a refresh does not re-fire the effect.
    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete("linkedin");
    cleaned.searchParams.delete("reason");
    window.history.replaceState(null, "", cleaned.toString());

    if (status === "imported") {
      setLinkedinToast({ tone: "success", message: "LinkedIn profile imported. Review your details and continue." });
      setPath("linkedin");
      (async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("full_name, headline, linkedin_url")
          .eq("id", userId)
          .maybeSingle();
        if (error || !data) return;
        if (typeof data.full_name === "string" && data.full_name.length > 0) {
          setName(data.full_name);
        }
        if (typeof data.headline === "string" && data.headline.length > 0) {
          setRole(data.headline);
        }
        setStep(2);
      })();
      return;
    }

    if (status === "error") {
      const reason = searchParams.get("reason");
      setLinkedinToast({ tone: "error", message: linkedinErrorMessage(reason) });
    }
  }, [searchParams, supabase, userId]);

  // Auto-dismiss the LinkedIn toast after 6 seconds so it does not linger
  // through subsequent wizard interaction.
  useEffect(() => {
    if (!linkedinToast) return;
    const t = setTimeout(() => setLinkedinToast(null), 6000);
    return () => clearTimeout(t);
  }, [linkedinToast]);

  // ── Persistence helpers ───────────────────────────────────────────────

  // Migrated 2026-05-15 (migration 075 Phase 2): writes to `profiles`
  // instead of `user_profiles`. Column renames applied. Phantom columns
  // (pronouns, role, employer, work_email) the prior wizard wrote did
  // not exist on user_profiles either; they are dropped from the writer.
  // Region remains a wizard input but is not persisted (no destination
  // column on profiles; collected for future use).
  const persistIdentity = async () => {
    setIdentityError(null);
    if (!name.trim()) {
      setIdentityError("Please add your name so teammates can find you.");
      return false;
    }
    setSavingIdentity(true);
    const { error } = await supabase
      .from("profiles")
      .update(
        {
          full_name: name.trim(),
          updated_at: new Date().toISOString(),
        }
      )
      .eq("id", userId);
    setSavingIdentity(false);
    if (error) {
      setIdentityError(error.message);
      return false;
    }
    return true;
  };

  // Writes the sector selection to `workspace_settings.sector_profile` for the
  // current workspace. This is the workspace-anchored destination the dashboard
  // (resolveServerBootstrap → getAppData) actually reads to filter intelligence.
  //
  // Prior to 2026-05-18 this writer targeted `profiles.sector_overrides`
  // (per-user override layer). That destination was wrong: the per-user → per-
  // workspace composition layer described at lib/api/server-bootstrap.ts:42-46
  // is not wired into the dashboard query path, so per-user writes were
  // functionally inert. Founder-of-fresh-org would pick sectors, see no error,
  // and the dashboard would render against an empty workspace_settings.
  // sector_profile. Fix per docs/sprint-1/onboarding-audit-2026-05-18.md
  // Section D (REC-OBS-O-2). The wizard now writes the workspace-anchored
  // destination directly; the orphaned components/onboarding/SectorOnboarding.tsx
  // was retired in the same change.
  //
  // /onboarding's server gate (app/onboarding/page.tsx) bounces users with no
  // workspace to /workspace/new, so orgId is always present here.
  const persistSectors = async () => {
    setSectorError(null);
    setSavingSectors(true);
    const { error } = await supabase
      .from("workspace_settings")
      .update(
        {
          sector_profile: sectors,
        }
      )
      .eq("org_id", orgId);
    setSavingSectors(false);
    if (error) {
      setSectorError(error.message);
      return false;
    }
    // Sync the client-side workspace store so any same-session UI reading
    // sectorProfile (FilterBar, SectorSelector defaults, scoring) reflects the
    // new selection without a full reload.
    setSectorProfile(sectors);
    return true;
  };

  // First-time write of notification_preferences with the conservative
  // defaults. NotificationPreferences component itself will manage subsequent
  // edits via upsert; we seed the row up front so any pre-Phase-D triggers
  // (e.g. invite emails) have something to read.
  const seedNotificationDefaults = async () => {
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: userId,
          ...DEFAULT_NOTIFICATION_PREFS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id", ignoreDuplicates: true }
      );
    return !error;
  };

  // ── Step transitions ─────────────────────────────────────────────────

  const goNext = async () => {
    if (step === 1) {
      // Both the "fresh" and "linkedin" (post-import) paths advance to the
      // identity step. The linkedin path arrives here with prefilled state
      // courtesy of the ?linkedin=imported effect above.
      if (path === "fresh" || path === "linkedin") setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await persistIdentity();
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
      return;
    }
  };

  const goBack = () => {
    if (step === 1) return;
    setStep((s) => (s - 1) as Step);
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
        {linkedinToast && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
            style={{
              borderColor:
                linkedinToast.tone === "success"
                  ? "var(--color-success-border, var(--color-border))"
                  : "var(--color-danger-border, var(--color-border))",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            {linkedinToast.tone === "success" ? (
              <Check size={14} style={{ marginTop: 1 }} />
            ) : (
              <AlertCircle size={14} style={{ marginTop: 1 }} />
            )}
            <span style={{ flex: 1 }}>{linkedinToast.message}</span>
            <button
              type="button"
              onClick={() => setLinkedinToast(null)}
              aria-label="Dismiss"
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              Dismiss
            </button>
          </div>
        )}

        <Header step={step} />

        <div className="mt-8">
          {step === 1 && (
            <StepChoosePath
              path={path}
              setPath={setPath}
              linkedinEnabled={linkedinEnabled}
            />
          )}

          {step === 2 && (
            <StepIdentity
              userEmail={userEmail}
              name={name}
              pronouns={pronouns}
              role={role}
              employer={employer}
              region={region}
              setName={setName}
              setPronouns={setPronouns}
              setRole={setRole}
              setEmployer={setEmployer}
              setRegion={setRegion}
              error={identityError}
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

          {step === 4 && (
            <StepNotifications userId={userId} />
          )}

          {step === 5 && <StepDone router={router} />}
        </div>

        {step < 5 && (
          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1}
              className="inline-flex items-center gap-1 text-sm disabled:opacity-30"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <ArrowLeft size={12} /> Back
            </button>

            <div className="flex items-center gap-3">
              {step === 4 && (
                <p
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  You can change these any time from Settings.
                </p>
              )}
              <Button
                variant="primary"
                onClick={goNext}
                disabled={
                  (step === 1 && path !== "fresh" && path !== "linkedin") ||
                  (step === 2 && savingIdentity) ||
                  (step === 3 && (savingSectors || sectors.length === 0))
                }
              >
                {step === 4 ? "Finish" : "Continue"}
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Header / progress ─────────────────────────────────────────────────────

function Header({ step }: { step: Step }) {
  const total = 4;
  const current = Math.min(step, total);
  return (
    <div>
      <p
        className="text-xs uppercase tracking-wide mb-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        Welcome to Caro&apos;s Ledge · Step {current} of {total}
      </p>
      <h1
        className="text-2xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        {step === 1 && "Let's get you set up"}
        {step === 2 && "Tell us who you are"}
        {step === 3 && "Which sectors do you operate in?"}
        {step === 4 && "How should we notify you?"}
        {step === 5 && "You're set"}
      </h1>
      <div
        className="mt-4 grid grid-cols-4 gap-1.5"
        aria-hidden="true"
      >
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="h-1 rounded-full"
            style={{
              backgroundColor:
                n <= current
                  ? "var(--color-primary)"
                  : "var(--color-border-subtle)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Step 1 — Choose path ──────────────────────────────────────────────────

function StepChoosePath({
  path,
  setPath,
  linkedinEnabled,
}: {
  path: "fresh" | "linkedin" | null;
  setPath: (p: "fresh" | "linkedin" | null) => void;
  linkedinEnabled: boolean;
}) {
  const startLinkedin = () => {
    // Navigate via full document load so the server-issued state cookie is
    // applied before the 302 hop to LinkedIn. router.push would not work
    // here because the start endpoint Set-Cookie + redirect chain must be
    // followed by the browser, not by the Next router.
    window.location.href = "/api/auth/linkedin/start";
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* LinkedIn — live when LINKEDIN_CLIENT_ID is provisioned, disabled
          with explanatory copy when the deployment is unconfigured. */}
      <button
        type="button"
        onClick={linkedinEnabled ? startLinkedin : undefined}
        disabled={!linkedinEnabled}
        aria-disabled={!linkedinEnabled}
        className={
          "rounded-lg border p-5 text-left transition-colors " +
          (linkedinEnabled
            ? "cursor-pointer"
            : "cursor-not-allowed")
        }
        style={{
          borderColor:
            linkedinEnabled && path === "linkedin"
              ? "var(--color-active-border)"
              : "var(--color-border)",
          backgroundColor:
            linkedinEnabled && path === "linkedin"
              ? "var(--color-active-bg)"
              : "var(--color-surface)",
          opacity: linkedinEnabled ? 1 : 0.7,
        }}
      >
        <Linkedin
          size={22}
          style={{
            color: linkedinEnabled
              ? "var(--color-primary)"
              : "var(--color-text-secondary)",
          }}
        />
        <h3
          className="text-base font-semibold mt-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          Import from LinkedIn
        </h3>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {linkedinEnabled
            ? "Pre-fill your name, role, and employer from your LinkedIn profile."
            : "LinkedIn import not configured for this deployment."}
        </p>
        <span
          className="inline-flex items-center gap-1 text-xs font-medium mt-4"
          style={{
            color: linkedinEnabled
              ? "var(--color-primary)"
              : "var(--color-text-muted)",
          }}
        >
          {linkedinEnabled ? (
            <>
              Continue with LinkedIn <ArrowRight size={12} />
            </>
          ) : (
            <>Unavailable</>
          )}
        </span>
      </button>

      {/* Start fresh */}
      <button
        type="button"
        onClick={() => setPath("fresh")}
        className="rounded-lg border p-5 text-left cursor-pointer transition-colors"
        style={{
          borderColor:
            path === "fresh"
              ? "var(--color-active-border)"
              : "var(--color-border)",
          backgroundColor:
            path === "fresh"
              ? "var(--color-active-bg)"
              : "var(--color-surface)",
        }}
      >
        <Sparkles
          size={22}
          style={{ color: "var(--color-primary)" }}
        />
        <h3
          className="text-base font-semibold mt-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          Start fresh
        </h3>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Fill in a few details, pick the sectors you watch, and we&apos;ll
          tailor your dashboard from day one.
        </p>
        <span
          className="inline-flex items-center gap-1 text-xs font-medium mt-4"
          style={{
            color:
              path === "fresh"
                ? "var(--color-primary)"
                : "var(--color-text-secondary)",
          }}
        >
          {path === "fresh" ? (
            <>
              <Check size={12} /> Selected
            </>
          ) : (
            <>
              Use this path <ArrowRight size={12} />
            </>
          )}
        </span>
      </button>
    </div>
  );
}

// ── Step 2 — Identity ─────────────────────────────────────────────────────

function StepIdentity(props: {
  userEmail: string;
  name: string;
  pronouns: string;
  role: string;
  employer: string;
  region: string;
  setName: (v: string) => void;
  setPronouns: (v: string) => void;
  setRole: (v: string) => void;
  setEmployer: (v: string) => void;
  setRegion: (v: string) => void;
  error: string | null;
}) {
  const {
    userEmail,
    name,
    pronouns,
    role,
    employer,
    region,
    setName,
    setPronouns,
    setRole,
    setEmployer,
    setRegion,
    error,
  } = props;

  return (
    <div className="space-y-4">
      <p
        className="text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Visible to your workspace. You can edit any of this later from your
        Profile.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Full name *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border outline-none"
            style={fieldStyle}
            placeholder="Your name"
            required
          />
        </Field>
        <Field label="Pronouns">
          <input
            type="text"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border outline-none"
            style={fieldStyle}
            placeholder="she / her"
          />
        </Field>
        <Field label="Role / title">
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border outline-none"
            style={fieldStyle}
            placeholder="Head of Sustainability"
          />
        </Field>
        <Field label="Employer">
          <input
            type="text"
            value={employer}
            onChange={(e) => setEmployer(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border outline-none"
            style={fieldStyle}
            placeholder="Company or organization"
          />
        </Field>
        <Field label="Primary region">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border outline-none"
            style={fieldStyle}
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Work email">
          <input
            type="email"
            value={userEmail}
            readOnly
            disabled
            className="w-full px-3 py-2 text-sm rounded-md border outline-none cursor-not-allowed"
            style={{
              ...fieldStyle,
              backgroundColor: "var(--color-surface-overlay)",
              color: "var(--color-text-muted)",
            }}
          />
        </Field>
      </div>

      {error && <ErrorBanner message={error} />}
    </div>
  );
}

// ── Step 3 — Sectors ──────────────────────────────────────────────────────

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
    <div className="space-y-4">
      <p
        className="text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Pick all that apply. We use these to weight regulatory urgency, filter
        feeds, and translate intelligence into your context. You can change
        them any time.
      </p>

      <div>
        <SectionHeader>
          <Star size={11} className="inline-block mr-1" />
          Highlighted niches
        </SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {highlighted.map((s) => (
            <SectorPill
              key={s.id}
              id={s.id}
              label={s.label}
              selected={selected.includes(s.id)}
              onToggle={() => onToggle(s.id)}
              highlighted
            />
          ))}
        </div>
      </div>

      <div>
        <SectionHeader>All sectors</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {rest.map((s) => (
            <SectorPill
              key={s.id}
              id={s.id}
              label={s.label}
              selected={selected.includes(s.id)}
              onToggle={() => onToggle(s.id)}
            />
          ))}
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {selected.length === 0
          ? "Pick at least one sector to continue."
          : `${selected.length} sector${selected.length !== 1 ? "s" : ""} selected.`}
      </p>

      {error && <ErrorBanner message={error} />}
    </div>
  );
}

function SectorPill({
  id,
  label,
  selected,
  onToggle,
  highlighted,
}: {
  id: string;
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
      className="flex items-center gap-2.5 px-3 py-2 rounded-md border text-left text-sm cursor-pointer transition-colors"
      style={{
        borderColor: selected
          ? "var(--color-active-border)"
          : "var(--color-border)",
        backgroundColor: selected
          ? "var(--color-active-bg)"
          : "var(--color-surface)",
        fontWeight: selected ? 600 : 400,
      }}
    >
      <span
        className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
        style={{
          borderColor: selected
            ? "var(--color-primary)"
            : "var(--color-border-strong, var(--color-border))",
          backgroundColor: selected ? "var(--color-primary)" : "transparent",
        }}
      >
        {selected && <Check size={10} color="white" />}
      </span>
      <span style={{ color: "var(--color-text-primary)" }}>
        {highlighted && (
          <Star
            size={9}
            className="inline-block mr-1"
            style={{ color: "var(--color-primary)" }}
          />
        )}
        {label}
      </span>
    </button>
  );
}

// ── Step 4 — Notifications ────────────────────────────────────────────────

function StepNotifications({ userId }: { userId: string }) {
  return (
    <div className="space-y-4">
      <p
        className="text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        We&apos;ve started you off with a conservative set of defaults. Higher-
        volume notifications are off until you opt in.
      </p>
      <NotificationPreferences userId={userId} compact />
    </div>
  );
}

// ── Step 5 — Done ─────────────────────────────────────────────────────────

function StepDone({
  router,
}: {
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="space-y-5 text-center">
      <div
        className="mx-auto w-12 h-12 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: "var(--color-active-bg)",
          color: "var(--color-primary)",
        }}
      >
        <Check size={22} />
      </div>
      <h2
        className="text-xl font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        You&apos;re set up.
      </h2>
      <p
        className="text-sm max-w-md mx-auto"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Your dashboard is filtered against your sector profile and your
        notifications are conservative by default. You can revisit any of this
        from your Profile or Settings any time.
      </p>
      <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
        <Button variant="primary" onClick={() => router.push("/community")}>
          Browse the community <ArrowRight size={14} />
        </Button>
        <Button variant="secondary" onClick={() => router.push("/")}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--color-border)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text-primary)",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block text-[10px] font-semibold uppercase mb-1.5"
        style={{
          letterSpacing: "0.12em",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-[10px] font-semibold uppercase mt-4 mb-2"
      style={{
        letterSpacing: "0.14em",
        color: "var(--color-text-muted)",
      }}
    >
      {children}
    </h3>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2 p-3 rounded-md text-sm"
      style={{
        backgroundColor: "rgba(220, 38, 38, 0.06)",
        border: "1px solid rgba(220, 38, 38, 0.15)",
        color: "var(--color-error)",
      }}
    >
      <AlertCircle size={14} />
      {message}
    </div>
  );
}

// Note: jurisdiction chip-toggle lives on /profile (UserProfilePage). The
// wizard collects only a single primary region to keep the flow short.
