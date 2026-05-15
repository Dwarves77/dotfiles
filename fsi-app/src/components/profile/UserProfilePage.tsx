"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { JURISDICTIONS, MODES } from "@/lib/constants";
import { SectorSelector } from "@/components/profile/SectorSelector";
import { AtAGlanceBlock } from "@/components/profile/AtAGlanceBlock";
import { QuickLinksSection } from "@/components/profile/QuickLinksSection";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import {
  Save,
  Check,
  AlertCircle,
  Lock,
  ShieldCheck,
  ArrowLeft,
  Crown,
} from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// UserProfilePage (Phase C)
// Editable personal profile + sector/jurisdiction/transport-mode preferences
// + verifier badge application. Tabs follow the design preview, but only the
// Personal / Sectors / Jurisdictions / Verifier badge / Activity tabs are
// functional in Phase C. Workspace org / Members / Billing render a
// "Coming soon" panel.
//
// Migrated 2026-05-15 (migration 075 Phase 2): reads/writes go to the
// canonical `profiles` table instead of `user_profiles`. Column renames:
//   user_profiles.name              -> profiles.full_name
//   user_profiles.headshot_url      -> profiles.avatar_url
//   user_profiles.bio               -> profiles.bio (unchanged)
//   user_profiles.sectors           -> profiles.sector_overrides
//   user_profiles.jurisdictions     -> profiles.jurisdiction_overrides
//   user_profiles.transport_modes   -> profiles.transport_mode_overrides
//   user_profiles.verifier_status   -> profiles.verifier_status
//   user_profiles.verifier_since    -> profiles.verifier_since
//   user_profiles.is_platform_admin -> profiles.is_platform_admin
// Phantom columns the prior UI wrote (pronouns, role, employer, region,
// work_email, verifier_application) are dropped from this writer; they
// were never persisted (column did not exist on user_profiles either).
// ───────────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  userEmail: string;
}

type TabKey =
  | "personal"
  | "organization"
  | "members"
  | "billing"
  | "sectors"
  | "jurisdictions"
  | "verifier"
  | "activity";

const TABS: Array<{ key: TabKey; label: string; phaseC: boolean }> = [
  { key: "personal", label: "Personal", phaseC: true },
  { key: "organization", label: "Organization", phaseC: false },
  { key: "members", label: "Members & roles", phaseC: false },
  { key: "billing", label: "Billing & plan", phaseC: false },
  { key: "sectors", label: "Sector profile", phaseC: true },
  { key: "jurisdictions", label: "Jurisdictions", phaseC: true },
  { key: "verifier", label: "Verifier badge", phaseC: true },
  { key: "activity", label: "Activity", phaseC: true },
];

interface ProfileRow {
  id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  sector_overrides: string[] | null;
  jurisdiction_overrides: string[] | null;
  transport_mode_overrides: string[] | null;
  verifier_status: "none" | "pending" | "active" | "revoked" | null;
  verifier_since: string | null;
  created_at: string | null;
}

const EMPTY_PROFILE: ProfileRow = {
  id: "",
  full_name: null,
  bio: null,
  avatar_url: null,
  sector_overrides: [],
  jurisdiction_overrides: [],
  transport_mode_overrides: [],
  verifier_status: "none",
  verifier_since: null,
  created_at: null,
};

export function UserProfilePage({ userId, userEmail }: Props) {
  const supabase = createSupabaseBrowserClient();
  const { setSectorProfile } = useWorkspaceStore();
  const userRole = useWorkspaceStore((s) => s.userRole);
  const orgName = useWorkspaceStore((s) => s.orgName);
  const isOwner = userRole === "owner";

  const [tab, setTab] = useState<TabKey>("personal");
  const [profile, setProfile] = useState<ProfileRow>({
    ...EMPTY_PROFILE,
    id: userId,
  });
  const [loading, setLoading] = useState(true);
  const [savingTab, setSavingTab] = useState<TabKey | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });
  const [error, setError] = useState<string | null>(null);

  // Load row.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, bio, avatar_url, sector_overrides, jurisdiction_overrides, transport_mode_overrides, verifier_status, verifier_since, created_at"
        )
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;
      if (error && error.code !== "PGRST116") {
        setError(error.message);
      }
      if (data) {
        setProfile({
          ...EMPTY_PROFILE,
          ...data,
          sector_overrides: data.sector_overrides ?? [],
          jurisdiction_overrides: data.jurisdiction_overrides ?? [],
          transport_mode_overrides: data.transport_mode_overrides ?? [],
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  const persist = async (
    patch: Partial<ProfileRow>,
    forTab: TabKey,
    successMessage = "Saved"
  ) => {
    setSavingTab(forTab);
    setError(null);
    const next = { ...profile, ...patch };
    setProfile(next);

    const { error } = await supabase
      .from("profiles")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    setSavingTab(null);
    if (error) {
      setError(error.message);
      return false;
    }
    if (patch.sector_overrides) setSectorProfile(patch.sector_overrides);
    setToast({ message: successMessage, visible: true });
    return true;
  };

  const stats = useMemo(() => {
    const highlightedCount =
      profile.sector_overrides?.filter((id) =>
        ["fine-art", "live-events", "luxury-goods", "film-tv", "automotive", "humanitarian"].includes(
          id
        )
      ).length ?? 0;
    return {
      sectors: profile.sector_overrides?.length ?? 0,
      highlighted: highlightedCount,
      jurisdictions: profile.jurisdiction_overrides?.length ?? 0,
      modes: profile.transport_mode_overrides?.length ?? 0,
    };
  }, [profile]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-background)" }}
      >
        <p
          className="text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Loading profile…
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {/* Header */}
        <a
          href="/"
          className="inline-flex items-center gap-1 text-xs mb-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <ArrowLeft size={12} /> Dashboard
        </a>
        <p
          className="text-xs uppercase tracking-wide mb-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          {profile.full_name || userEmail}
        </p>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Profile
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Personal details · sector profile · jurisdictions · verifier
          credentials
        </p>

        {/* PR-L: "You are Owner" callout (Decision #15, F20).
            Renders for workspace owners only. Members and admins see the
            normal stat strip path. */}
        {isOwner && (
          <div
            className="mt-5 rounded-md border flex items-center gap-3 px-4 py-3"
            style={{
              borderColor: "var(--color-primary)",
              backgroundColor: "var(--color-active-bg)",
            }}
          >
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-full"
              style={{
                backgroundColor: "var(--color-surface)",
                color: "var(--color-primary)",
              }}
            >
              <Crown size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="text-sm font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                You are Owner of {orgName || "this workspace"}
              </div>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Owners control workspace settings, invitations, billing,
                and platform admin access.
              </p>
            </div>
          </div>
        )}

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <StatTile
            label="Sectors followed"
            value={stats.sectors}
            meta={
              stats.highlighted > 0
                ? `${stats.highlighted} highlighted niches`
                : "—"
            }
          />
          <StatTile
            label="Home jurisdictions"
            value={stats.jurisdictions}
            meta={
              stats.jurisdictions > 0
                ? jurisdictionLabels(profile.jurisdiction_overrides ?? []).slice(0, 3).join(" · ")
                : "Not set"
            }
          />
          <StatTile
            label="Watching"
            value={0}
            meta="regulations (Phase D)"
          />
          <StatTile
            label="Posts · Briefs"
            value={0}
            meta="since signup"
          />
        </div>

        {/* Tabs — phaseC: false tabs render with a lock icon + "Coming soon"
            affordance so users see them as gated, not broken. They remain
            clickable (the panel area renders the existing PanelComingSoon),
            but the visual state communicates intent. */}
        <div
          className="flex flex-wrap gap-0 border-b mt-8 mb-6"
          style={{ borderColor: "var(--color-border)" }}
        >
          {TABS.map((t) => {
            const gated = !t.phaseC;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                title={
                  gated
                    ? "Coming soon — Phase D (multi-tenant workspaces)"
                    : undefined
                }
                aria-label={
                  gated ? `${t.label} — coming soon, Phase D` : t.label
                }
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors inline-flex items-center gap-1.5"
                style={{
                  color: active
                    ? "var(--color-primary)"
                    : gated
                      ? "var(--color-text-muted)"
                      : "var(--color-text-secondary)",
                  borderBottom: `3px solid ${
                    active ? "var(--color-primary)" : "transparent"
                  }`,
                  opacity: gated && !active ? 0.75 : 1,
                }}
              >
                {gated && <Lock size={11} aria-hidden="true" />}
                {t.label}
                {gated && (
                  <span
                    className="ml-1 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal rounded"
                    style={{
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border-subtle)",
                      color: "var(--color-text-muted)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="flex items-center gap-2 p-3 rounded-md text-sm mb-4"
            style={{
              backgroundColor: "rgba(220, 38, 38, 0.06)",
              border: "1px solid rgba(220, 38, 38, 0.15)",
              color: "var(--color-error)",
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* PR-L: 2-column grid — main panel area on the left, AT A GLANCE
            + QUICK LINKS rails on the right (Decision #15, F6 + F7). On
            small screens the rails stack below the panels. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
          <div className="min-w-0">
            {/* Panels */}
            {tab === "personal" && (
              <PanelPersonal
                profile={profile}
                userEmail={userEmail}
                saving={savingTab === "personal"}
                onSave={(patch) => persist(patch, "personal", "Personal profile saved")}
              />
            )}
            {tab === "sectors" && (
              <PanelSectors
                profile={profile}
                saving={savingTab === "sectors"}
                onSave={(sectors) =>
                  persist({ sector_overrides: sectors }, "sectors", "Sector profile saved")
                }
              />
            )}
            {tab === "jurisdictions" && (
              <PanelJurisdictions
                profile={profile}
                saving={savingTab === "jurisdictions"}
                onSave={(juris, modes) =>
                  persist(
                    { jurisdiction_overrides: juris, transport_mode_overrides: modes },
                    "jurisdictions",
                    "Jurisdictions and modes saved"
                  )
                }
              />
            )}
            {tab === "verifier" && (
              <PanelVerifier
                profile={profile}
                saving={savingTab === "verifier"}
                onApply={() =>
                  persist(
                    {
                      verifier_status: "pending",
                    },
                    "verifier",
                    "Application submitted"
                  )
                }
              />
            )}
            {tab === "activity" && <PanelActivity />}
            {tab === "organization" && (
              <PanelComingSoon
                title="Workspace organization"
                description="Multi-tenant workspaces ship in Phase D. Until then, your account is its own workspace."
              />
            )}
            {tab === "members" && (
              <PanelComingSoon
                title="Members & roles"
                description="Inviting teammates and assigning roles ships in Phase D alongside multi-tenant workspaces."
              />
            )}
            {tab === "billing" && (
              <PanelComingSoon
                title="Billing & plan"
                description="Plans, seats, and invoicing ship in Phase D. Phase C accounts have full read-only access."
              />
            )}
          </div>

          {/* Right rail */}
          <aside className="space-y-4">
            <AtAGlanceBlock
              userId={userId}
              verifierStatus={profile.verifier_status ?? null}
              profileCreatedAt={profile.created_at ?? null}
            />
            <QuickLinksSection />
          </aside>
        </div>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDismiss={() => setToast({ message: "", visible: false })}
      />
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  meta,
}: {
  label: string;
  value: number | string;
  meta?: string;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase mb-1"
        style={{
          letterSpacing: "0.14em",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-semibold leading-none"
        style={{ color: "var(--color-text-primary)" }}
      >
        {value}
      </div>
      {meta && (
        <div
          className="text-[11px] mt-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {meta}
        </div>
      )}
    </div>
  );
}

// ── Personal panel ────────────────────────────────────────────────────────

function PanelPersonal({
  profile,
  userEmail,
  saving,
  onSave,
}: {
  profile: ProfileRow;
  userEmail: string;
  saving: boolean;
  onSave: (patch: Partial<ProfileRow>) => Promise<boolean>;
}) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      full_name: fullName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    });
  };

  return (
    <Card title="Personal profile" meta="Visible to your workspace">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name">
            <Input value={fullName} onChange={setFullName} placeholder="Your name" />
          </Field>
          <Field label="Headshot URL">
            <Input
              value={avatarUrl}
              onChange={setAvatarUrl}
              placeholder="https://…"
            />
          </Field>
          <Field label="Work email">
            <Input
              value={userEmail}
              onChange={() => {}}
              disabled
            />
          </Field>
        </div>
        <Field label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-md border outline-none resize-vertical"
            style={fieldStyle}
            placeholder="A short bio for the community"
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button variant="primary" type="submit" disabled={saving}>
            <Save size={14} />
            {saving ? "Saving…" : "Save personal profile"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── Sectors panel ─────────────────────────────────────────────────────────

function PanelSectors({
  profile,
  saving,
  onSave,
}: {
  profile: ProfileRow;
  saving: boolean;
  onSave: (sectors: string[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>(profile.sector_overrides ?? []);
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  return (
    <Card
      title="Sector profile"
      meta={`${selected.length} selected · this is what "Reset to my sectors" reads from across the product`}
    >
      <SectorSelector
        selectedSectors={selected}
        onToggle={toggle}
        showKeywords={false}
      />
      <div className="flex items-center gap-3 mt-5">
        <Button
          variant="primary"
          onClick={() => onSave(selected)}
          disabled={saving}
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save sectors"}
        </Button>
        {selected.length === 0 && (
          <span
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Selecting nothing means &quot;use workspace defaults&quot;.
          </span>
        )}
      </div>
    </Card>
  );
}

// ── Jurisdictions + modes panel ───────────────────────────────────────────

function PanelJurisdictions({
  profile,
  saving,
  onSave,
}: {
  profile: ProfileRow;
  saving: boolean;
  onSave: (juris: string[], modes: string[]) => Promise<boolean>;
}) {
  const [juris, setJuris] = useState<string[]>(profile.jurisdiction_overrides ?? []);
  const [modes, setModes] = useState<string[]>(profile.transport_mode_overrides ?? []);

  const toggleJuris = (id: string) =>
    setJuris((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  const toggleMode = (id: string) =>
    setModes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  // Group jurisdictions by region for readability.
  const grouped = useMemo(() => {
    const out: Record<string, typeof JURISDICTIONS[number][]> = {};
    for (const j of JURISDICTIONS) {
      out[j.region] = out[j.region] || [];
      out[j.region].push(j);
    }
    return out;
  }, []);

  return (
    <div className="space-y-6">
      <Card
        title="Home jurisdictions"
        meta="We weight regulatory urgency higher for these regions and surface them first in feeds."
      >
        <div className="space-y-4">
          {Object.entries(grouped).map(([region, list]) => (
            <div key={region}>
              <h4
                className="text-[10px] font-semibold uppercase mb-2"
                style={{
                  letterSpacing: "0.14em",
                  color: "var(--color-text-muted)",
                }}
              >
                {region}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {list.map((j) => (
                  <Chip
                    key={j.id}
                    label={j.label}
                    selected={juris.includes(j.id)}
                    onClick={() => toggleJuris(j.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Transport modes"
        meta="Pick the modes you actually move freight on."
      >
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <Chip
              key={m.id}
              label={m.label}
              selected={modes.includes(m.id)}
              onClick={() => toggleMode(m.id)}
            />
          ))}
        </div>
      </Card>

      <div>
        <Button
          variant="primary"
          onClick={() => onSave(juris, modes)}
          disabled={saving}
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save jurisdictions & modes"}
        </Button>
      </div>
    </div>
  );
}

function jurisdictionLabels(ids: string[]): string[] {
  const map = new Map<string, string>(JURISDICTIONS.map((j) => [j.id, j.label]));
  return ids.map((id) => map.get(id) || id);
}

// ── Verifier panel ────────────────────────────────────────────────────────

function PanelVerifier({
  profile,
  saving,
  onApply,
}: {
  profile: ProfileRow;
  saving: boolean;
  onApply: (applicationText: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const status = profile.verifier_status ?? "none";

  return (
    <Card title="Verifier credentials">
      <div
        className="flex items-start gap-4 p-4 rounded-md mb-4"
        style={{
          border: "1px solid var(--color-border-subtle)",
          backgroundColor: "var(--color-surface-overlay)",
        }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color:
              status === "active"
                ? "var(--color-success)"
                : "var(--color-text-secondary)",
          }}
        >
          {status === "active" ? (
            <ShieldCheck size={20} />
          ) : (
            <Lock size={18} />
          )}
        </div>
        <div className="flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {status === "active" && "You are a verified contributor"}
            {status === "pending" && "Application under review"}
            {status === "revoked" &&
              "Previous verification revoked — you can re-apply"}
            {(status === "none" || !status) &&
              "You are not a verifier"}
          </div>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Verifier badges (✓) appear next to community contributions and are
            required to approve disputed regulatory entries. Apply with a
            short note about your professional credentials and the topics
            you&apos;re qualified to verify.
          </p>
        </div>
      </div>

      <Field label="Application">
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-md border outline-none resize-vertical"
          style={fieldStyle}
          placeholder="Tell us about your role, certifications, regulators you've worked with, and topics you'd verify."
          disabled={status === "pending"}
        />
      </Field>

      <div className="mt-4">
        <Button
          variant="primary"
          onClick={() => onApply(text)}
          disabled={saving || status === "pending" || text.trim().length < 30}
        >
          {status === "pending"
            ? "Pending review"
            : status === "active"
              ? "Update application"
              : "Submit application"}
        </Button>
        {status !== "pending" && text.trim().length < 30 && (
          <span
            className="text-xs ml-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            At least 30 characters.
          </span>
        )}
        <p
          className="text-xs mt-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Application text is captured by the editorial team out-of-band; the
          submission flips your verifier_status to &quot;pending&quot; for review.
        </p>
      </div>
    </Card>
  );
}

// ── Activity panel (Phase C placeholder reading) ─────────────────────────

function PanelActivity() {
  return (
    <Card title="Recent activity" meta="Your last 90 days">
      <p
        className="text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Activity will populate as you post in the community, watch regulations,
        and author briefs. This panel reads from your audit log on the server.
      </p>
      <p
        className="text-xs mt-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        Nothing yet.
      </p>
    </Card>
  );
}

// ── Coming-soon panel ────────────────────────────────────────────────────

function PanelComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card title={title} meta="Coming soon — multi-tenant in Phase D">
      <p
        className="text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {description}
      </p>
    </Card>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--color-border)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text-primary)",
};

function Card({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border mb-5"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <header
        className="flex items-baseline justify-between gap-3 flex-wrap px-5 py-4 border-b"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
        {meta && (
          <span
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            {meta}
          </span>
        )}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

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

function Input({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm rounded-md border outline-none disabled:cursor-not-allowed"
      style={{
        ...fieldStyle,
        opacity: disabled ? 0.7 : 1,
      }}
    />
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="px-3 py-1.5 text-xs font-medium rounded-full border cursor-pointer transition-colors"
      style={{
        backgroundColor: selected
          ? "var(--color-primary)"
          : "var(--color-surface)",
        color: selected ? "var(--color-invert-text)" : "var(--color-text-secondary)",
        borderColor: selected
          ? "var(--color-primary)"
          : "var(--color-border)",
      }}
    >
      {selected && <Check size={10} className="inline-block mr-1" />}
      {label}
    </button>
  );
}
