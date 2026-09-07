"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getWorkspaceProfile } from "@/lib/workspace/profile";
import { ALL_SECTORS, JURISDICTIONS } from "@/lib/constants";
import { useAdminAttention } from "@/lib/hooks/useAdminAttention";
import { formatNumber, formatLocaleDate } from "@/lib/format";
import { Masthead } from "@/components/ui/Masthead";
import { TabRow, type TabRowItem } from "@/components/ui/TabRow";
import { StatBlock } from "@/components/ui/StatBlock";
import { resolveInitialProfileTab } from "@/lib/account/initial-tab";
import {
  AccountCard,
  HonestFrame,
  PlainCard,
  FieldLabel,
  TextInput,
  TextArea,
  InkButton,
} from "@/components/account/AccountPrimitives";
import { OrganizationPanel } from "@/components/profile/OrganizationPanel";
import { MembersPanel } from "@/components/profile/MembersPanel";

// ───────────────────────────────────────────────────────────────────────────
// UserProfilePage — Account · Profile (redesign T10, HANDOFF §6.10).
// Rebuilt against "Pages - 10 Account". Content wins from the live
// `profiles` row; layout/hierarchy/spacing/colour win from the mock.
//
// Reads/writes the canonical `profiles` table (migration 075 phase 2).
// Sector / jurisdiction editing lives in Settings; the Sector profile and
// Jurisdictions tabs here are read-only summaries that link there.
//
// Sector profile fix (Wave H1, REC-2 §14): the Sector profile tab and the
// "Sectors followed" stat tile used to read `profiles.sector_overrides` — a
// per-user column nothing ever writes going forward (Settings and the
// onboarding wizard both write `workspace_settings.sector_profile`; see
// OnboardingWizard.tsx's persistSectors comment) and that the platform's
// actual read-time relevance lens (`getWorkspaceProfile` in
// lib/workspace/profile.ts, the one live consumer of "sectors" data) never
// reads either. That made this panel's own copy — "These sectors filter
// your default view, briefings, and urgency scoring" — false for every org:
// the tab would show "No sectors selected" regardless of what the workspace
// actually had configured. Fixed by reading the same `workspace_settings`
// row `getWorkspaceProfile` reads, so the summary matches what the platform
// really uses. See src/lib/workspace/profile.npmtest.mjs for the pinned
// contract this now depends on.
// ───────────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  userEmail: string;
}

type TabKey =
  | "personal"
  | "organization"
  | "members"
  | "sectors"
  | "jurisdictions"
  | "verifier"
  | "activity";


// The six highlighted "core" verticals (fine art, live events, luxury,
// film/TV, automotive, humanitarian) — the operator's specialised niches.
const CORE_SECTORS = new Set([
  "fine-art",
  "live-events",
  "luxury-goods",
  "film-tv",
  "automotive",
  "humanitarian",
]);

interface ProfileRow {
  id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
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
  jurisdiction_overrides: [],
  transport_mode_overrides: [],
  verifier_status: "none",
  verifier_since: null,
  created_at: null,
};

const SECTOR_LABEL = new Map<string, string>(ALL_SECTORS.map((s) => [s.id, s.label]));
const JURIS_LABEL = new Map<string, string>(JURISDICTIONS.map((j) => [j.id, j.label]));

export function UserProfilePage({ userId, userEmail }: Props) {
  const supabase = createSupabaseBrowserClient();
  const userRole = useWorkspaceStore((s) => s.userRole);
  const orgName = useWorkspaceStore((s) => s.orgName);
  const orgId = useWorkspaceStore((s) => s.orgId);
  const isOwner = userRole === "owner";
  const isAdmin = userRole === "owner" || userRole === "admin";
  const { total: adminAttentionTotal } = useAdminAttention();

  // Cross-page tab restore (README screen 15: Settings' merged tab row links
  // its first seven entries back here as `/profile?tab=<key>`) — read once on
  // mount via window.location, same convention SettingsPage's own
  // hash-based initialTab already uses (no useSearchParams Suspense
  // boundary needed, and the read is genuinely client-only: SSR always
  // renders the "personal" default, then this effect corrects it before
  // paint on a real browser navigation).
  const initialTab: TabKey = useMemo(() => {
    if (typeof window === "undefined") return "personal";
    return resolveInitialProfileTab(new URLSearchParams(window.location.search).get("tab"));
  }, []);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [profile, setProfile] = useState<ProfileRow>({ ...EMPTY_PROFILE, id: userId });
  const [workspaceSectors, setWorkspaceSectors] = useState<string[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real count for the merged tab row's "Members & roles · N" (README screen
  // 14) — MembersPanel owns its own member list state for the tab body; this
  // is the same table, head-only, so the tab-row number can never disagree
  // with what that panel shows once it loads.
  useEffect(() => {
    if (!orgId) {
      setMemberCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from("org_memberships")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);
      if (!cancelled) setMemberCount(error || count == null ? null : count);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, bio, avatar_url, jurisdiction_overrides, transport_mode_overrides, verifier_status, verifier_since, created_at"
        )
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error && error.code !== "PGRST116") setError(error.message);
      if (data) {
        setProfile({
          ...EMPTY_PROFILE,
          ...data,
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

  // Sector profile tab (REC-2 §14 fix): read the same workspace_settings row
  // getWorkspaceProfile reads for the platform's actual relevance lens — not
  // the dead profiles.sector_overrides column. See the header comment above.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wp = await getWorkspaceProfile(supabase, orgId);
      if (!cancelled) setWorkspaceSectors(wp.verticals);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, supabase]);

  const persist = async (patch: Partial<ProfileRow>) => {
    setError(null);
    setProfile((p) => ({ ...p, ...patch }));
    const { error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  };

  const stats = useMemo(() => {
    const juris = profile.jurisdiction_overrides ?? [];
    return {
      sectorCount: workspaceSectors.length,
      highlighted: workspaceSectors.filter((id) => CORE_SECTORS.has(id)).length,
      jurisCount: juris.length,
      jurisLabels: juris.slice(0, 3).map((id) => JURIS_LABEL.get(id) || id),
    };
  }, [profile, workspaceSectors]);

  const dateLabel = formatLocaleDate(new Date(), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const email = userEmail;

  // Merged tab row (README screen 14: "one tab row" — replaces the
  // pre-existing stacked pair, AccountMasthead's own Profile/Settings tabs
  // over AccountPrimitives' SubTabBar). The seven Profile sub-tabs are
  // in-page state switches; "Settings" is the eighth entry and a real link
  // to the sibling route — SettingsPage renders the SAME merged row with
  // "Settings" active and these first seven as links back here.
  const accountTabs: TabRowItem[] = [
    { key: "personal", label: "Personal", active: tab === "personal", onClick: () => setTab("personal") },
    { key: "organization", label: "Organization", active: tab === "organization", onClick: () => setTab("organization") },
    {
      key: "members",
      label: `Members & roles${memberCount != null ? ` · ${formatNumber(memberCount)}` : ""}`,
      active: tab === "members",
      onClick: () => setTab("members"),
    },
    {
      key: "sectors",
      label: `Sector profile${stats.sectorCount > 0 ? ` · ${formatNumber(stats.sectorCount)}` : ""}`,
      active: tab === "sectors",
      onClick: () => setTab("sectors"),
    },
    {
      key: "jurisdictions",
      label: `Jurisdictions${stats.jurisCount > 0 ? ` · ${formatNumber(stats.jurisCount)}` : ""}`,
      active: tab === "jurisdictions",
      onClick: () => setTab("jurisdictions"),
    },
    { key: "verifier", label: "Verifier badge", active: tab === "verifier", onClick: () => setTab("verifier") },
    { key: "activity", label: "Activity", active: tab === "activity", onClick: () => setTab("activity") },
    { key: "settings", label: "Settings", href: "/settings" },
  ];

  if (loading) {
    return (
      <div>
        <div style={{ padding: "20px 40px 0" }}>
          <Masthead
            title="Account"
            dateLabel={dateLabel}
            eyebrowSuffix="Personal"
            dek={`${email} · loading…`}
            commandBar={{ itemCount: 0, scope: "account", placeholder: 'Search settings — or ask "how do I add a member…"' }}
          />
        </div>
        <div style={{ padding: "16px 40px 0" }}>
          <TabRow tabs={accountTabs} ariaLabel="Account sections" />
        </div>
        <div style={{ padding: "16px 40px 80px" }}>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading profile…</p>
        </div>
      </div>
    );
  }

  const memberSince = formatMonthYear(profile.created_at);

  return (
    <div>
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title="Account"
          dateLabel={dateLabel}
          eyebrowSuffix="Personal"
          dek={
            <>
              {email} · <b style={{ color: "var(--ink)" }}>{orgName || "No workspace"}</b>
              {userRole ? ` · ${capitalize(userRole)}` : ""}
              {memberSince ? ` · member since ${memberSince}` : ""}
            </>
          }
          commandBar={{
            itemCount: 0,
            scope: "account",
            placeholder: 'Search settings — or ask "how do I add a member…"',
          }}
        />
      </div>
      <div style={{ padding: "16px 40px 0" }}>
        <TabRow tabs={accountTabs} ariaLabel="Account sections" />
      </div>
      <div style={{ padding: "16px 40px 80px" }}>
        {/* Owner banner */}
        {isOwner && (
          <div
            style={{
              background: "var(--color-bg-ai-strip)",
              border: "1px solid var(--color-active-border)",
              borderLeft: "3px solid var(--color-primary)",
              borderRadius: 8,
              padding: "13px 18px",
              margin: "0 0 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <p style={{ fontSize: "12.5px", margin: 0, color: "var(--color-text-primary)" }}>
              <b>You are Owner of {orgName || "this workspace"}.</b>{" "}
              <span style={{ color: "var(--color-text-secondary)" }}>
                Owners control workspace settings, invitations, billing, and platform admin access.
              </span>
            </p>
            <a
              href="/admin"
              style={{
                fontSize: "11.5px",
                fontWeight: 800,
                color: "var(--color-primary)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Admin panel →
            </a>
          </div>
        )}

        {/* Stat blocks (README screen 14: "statistics are stat blocks, never
            band tiles" — replaces the page-local StatTile, a duplicate of
            the shared StatBlock). */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            margin: "0 0 18px",
          }}
          className="cl-acct-stats"
        >
          <style>{`
            @media (max-width: 900px) { .cl-acct-stats { grid-template-columns: repeat(2, 1fr) !important; } }
            @media (max-width: 520px) { .cl-acct-stats { grid-template-columns: 1fr !important; } }
          `}</style>
          <StatTileCard>
            <StatBlock
              label="Sectors followed"
              value={formatNumber(stats.sectorCount)}
              note={stats.highlighted > 0 ? `${stats.highlighted} highlighted niches` : "No highlighted niches yet"}
            />
          </StatTileCard>
          <StatTileCard>
            <StatBlock
              label="Home jurisdictions"
              value={formatNumber(stats.jurisCount)}
              note={stats.jurisLabels.length > 0 ? stats.jurisLabels.join(" · ") : "None followed yet"}
            />
          </StatTileCard>
          <StatTileCard>
            <StatBlock
              label="Member since"
              value={memberSince ?? "—"}
              note={
                orgName
                  ? `${orgName}${userRole ? ` · ${userRole}` : ""}`
                  : memberSince
                    ? "Not in a workspace"
                    : "Join date not recorded"
              }
            />
          </StatTileCard>
          {isAdmin ? (
            <StatTileCard alarm={adminAttentionTotal > 0}>
              <StatBlock
                label="Admin attention"
                value={formatNumber(adminAttentionTotal)}
                tone={adminAttentionTotal > 0 ? "critical" : "default"}
                note={
                  <a href="/admin" style={{ color: "var(--brand)", fontWeight: 700, textDecoration: "none" }}>
                    items for review →
                  </a>
                }
              />
            </StatTileCard>
          ) : (
            <StatTileCard>
              <StatBlock
                label="Account role"
                value={userRole ? capitalize(userRole) : "—"}
                note={orgName ? `In ${orgName}` : "No workspace role"}
              />
            </StatTileCard>
          )}
        </div>

        {error && (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: 12,
              borderRadius: 6,
              fontSize: 13,
              margin: "0 0 16px",
              background: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.15)",
              color: "var(--color-error)",
            }}
          >
            {error}
          </div>
        )}

        {tab === "personal" && (
          <PersonalTab profile={profile} userEmail={userEmail} isAdmin={isAdmin} onSave={persist} />
        )}
        {tab === "organization" && <OrganizationPanel orgId={orgId} />}
        {tab === "members" && <MembersPanel orgId={orgId} callerUserId={userId} />}
        {tab === "sectors" && <SectorProfileTab sectorIds={workspaceSectors} />}
        {tab === "jurisdictions" && <JurisdictionsTab jurisIds={profile.jurisdiction_overrides ?? []} />}
        {tab === "verifier" && <VerifierTab status={profile.verifier_status ?? "none"} onApply={() => persist({ verifier_status: "pending" })} />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </div>
  );
}

// ── Stat block card chrome ──────────────────────────────────────────────
// Just the bordered card frame around a shared <StatBlock/> — not a second
// stat component. Kept here (not promoted to src/components/ui/) because
// it is pure chrome with no props beyond "which stat is inside" and admin's
// equivalent tiles are buttons, not cards; if a third surface needs the
// same frame it should move to a shared part then, not be copied again.
function StatTileCard({ children, alarm = false }: { children: React.ReactNode; alarm?: boolean }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderLeft: alarm ? "3px solid var(--immediate)" : "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        padding: "13px 16px",
      }}
    >
      {children}
    </div>
  );
}

// ── Personal tab (form + quick-links rail) ──────────────────────────────────

function PersonalTab({
  profile,
  userEmail,
  isAdmin,
  onSave,
}: {
  profile: ProfileRow;
  userEmail: string;
  isAdmin: boolean;
  onSave: (patch: Partial<ProfileRow>) => Promise<boolean>;
}) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const ok = await onSave({
      full_name: fullName.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      bio: bio.trim() || null,
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    }
  };

  return (
    <div id="cl-acct-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 18, alignItems: "start" }}>
      <style>{`@media (max-width: 1100px) { #cl-acct-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
      <AccountCard title="Personal profile" meta="Visible to your workspace">
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, margin: "0 0 14px" }}>
            <div>
              <FieldLabel>Full name</FieldLabel>
              <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <FieldLabel>Headshot URL</FieldLabel>
              <TextInput value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div style={{ margin: "0 0 14px" }}>
            <FieldLabel>Work email</FieldLabel>
            <TextInput value={userEmail} readOnly disabled />
          </div>
          <div style={{ margin: "0 0 16px" }}>
            <FieldLabel>Bio</FieldLabel>
            <TextArea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short bio for the community" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <InkButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save personal profile"}
            </InkButton>
            {saved && (
              <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--color-success)" }}>Saved.</span>
            )}
          </div>
        </form>
      </AccountCard>

      <QuickLinksRail isAdmin={isAdmin} />
    </div>
  );
}

function QuickLinksRail({ isAdmin }: { isAdmin: boolean }) {
  const links = [
    { href: "/", label: "Dashboard", sub: "Today's intelligence and weekly briefing" },
    { href: "/regulations", label: "Regulations", sub: "The regulatory intelligence index" },
    { href: "/market", label: "Market intel", sub: "Carbon prices, fuel mandates, market signals" },
    { href: "/map", label: "Map", sub: "Geographic view of regulations and sources" },
    { href: "/settings", label: "Settings", sub: "Notifications, briefings, dashboard sections" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin panel", sub: "Issues queue, flags, staged updates" }] : []),
  ];
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--color-border-subtle)" }}>
        <p
          style={{
            fontSize: "9.5px",
            fontWeight: 800,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          Quick links
        </p>
      </div>
      {links.map((l, i) => (
        <a
          key={l.href}
          href={l.href}
          style={{
            display: "block",
            padding: "11px 16px",
            borderBottom: i < links.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-overlay)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ display: "block", fontSize: "12.5px", fontWeight: 800, color: "var(--color-text-primary)" }}>
            {l.label}
          </span>
          <span style={{ display: "block", fontSize: "10.5px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
            {l.sub}
          </span>
        </a>
      ))}
    </div>
  );
}

// ── Sector profile (read-only summary) ─────────────────────────────────────

function SectorProfileTab({ sectorIds }: { sectorIds: string[] }) {
  const labels = sectorIds.map((id) => SECTOR_LABEL.get(id) || id);
  return (
    <AccountCard title="Sector profile" maxWidth={720}>
      {labels.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }}>
          {labels.map((label) => (
            <span
              key={label}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-primary)",
                background: "rgba(232,97,10,0.07)",
                border: "1px solid var(--color-active-border)",
                borderRadius: 999,
                padding: "6px 13px",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: "11.5px", color: "var(--color-text-muted)", margin: "0 0 12px" }}>
          No sectors selected — the platform shows all freight sectors by default.
        </p>
      )}
      <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", margin: 0 }}>
        {labels.length > 0
          ? "These sectors filter your default view, briefings, and urgency scoring. Edit the full list in "
          : "Sectors filter your default view, briefings, and urgency scoring. Choose yours in "}
        <a href="/settings#general" style={{ fontWeight: 800, color: "var(--color-primary)", textDecoration: "none" }}>
          Settings → Freight sectors
        </a>
        .
      </p>
    </AccountCard>
  );
}

// ── Jurisdictions (read-only summary) ──────────────────────────────────────

function JurisdictionsTab({ jurisIds }: { jurisIds: string[] }) {
  const labels = jurisIds.map((id) => JURIS_LABEL.get(id) || id);
  const shown = labels.slice(0, 3);
  const rest = labels.length - shown.length;
  return (
    <AccountCard title="Home jurisdictions" meta={`${labels.length} followed`} maxWidth={720}>
      {labels.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }}>
          {shown.map((label) => (
            <span
              key={label}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: 999,
                padding: "6px 13px",
              }}
            >
              {label}
            </span>
          ))}
          {rest > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-text-muted)",
                border: "1px dashed rgba(0,0,0,0.25)",
                borderRadius: 999,
                padding: "6px 13px",
              }}
            >
              + {rest} more · weighted equally
            </span>
          )}
        </div>
      ) : (
        <p style={{ fontSize: "11.5px", color: "var(--color-text-muted)", margin: "0 0 12px" }}>
          No home jurisdictions set — the briefing weights every jurisdiction equally.
        </p>
      )}
      <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", margin: 0 }}>
        Jurisdiction weighting for the briefing lives in{" "}
        <a href="/settings#general" style={{ fontWeight: 800, color: "var(--color-primary)", textDecoration: "none" }}>
          Settings → Briefing schedule
        </a>
        .
      </p>
    </AccountCard>
  );
}

// ── Verifier badge ─────────────────────────────────────────────────────────

function VerifierTab({ status, onApply }: { status: string; onApply: () => Promise<boolean> }) {
  const [applying, setApplying] = useState(false);
  const headline =
    status === "active"
      ? "Verified contributor"
      : status === "pending"
        ? "Application under review"
        : status === "revoked"
          ? "Previous verification revoked"
          : "Not a verifier";

  const apply = async () => {
    setApplying(true);
    await onApply();
    setApplying(false);
  };

  return (
    <PlainCard>
      <p style={{ fontSize: "12.5px", fontWeight: 800, margin: "0 0 4px", color: "var(--color-text-primary)" }}>
        {headline}
      </p>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: 0 }}>
        Verifier credentials mark community members whose claims are checked against primary documents before
        they carry weight in threads.{" "}
        {status === "active"
          ? "This account holds a verifier badge."
          : status === "pending"
            ? "This account's application is with the editorial team."
            : "This account holds no verifier badge."}
      </p>
      {(status === "none" || status === "revoked") && (
        <button
          type="button"
          onClick={apply}
          disabled={applying}
          style={{
            marginTop: 12,
            fontFamily: "var(--font-sans)",
            fontSize: "11.5px",
            fontWeight: 800,
            color: "var(--color-primary)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: applying ? "default" : "pointer",
          }}
        >
          {applying ? "Submitting…" : "Request verifier sign-off →"}
        </button>
      )}
    </PlainCard>
  );
}

// ── Activity (honest pending — §7 per-account activity events) ──────────────

function ActivityTab() {
  return (
    <HonestFrame heading="Activity not yet recorded">
      Per-account activity events haven&apos;t shipped. When they do, this tab lists briefs read, searches
      saved, and community posts — the same events that feed the Admin usage overview.
    </HonestFrame>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocaleDate(d, { month: "short", year: "numeric", timeZone: "UTC" });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
