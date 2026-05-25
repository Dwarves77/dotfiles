"use client";

import { useRouter } from "next/navigation";

/**
 * CommunityView, Sequence C rebuild (2026-05-24).
 *
 * Layout mirrors design_handoff_2026-05/community.html:
 *   - Standard global Sidebar (not the Slack-style hidden swap)
 *   - Masthead with thread/org/group counts
 *   - 5 tabs: By Region & Group (default) | Industry Pulse |
 *     Hot Topics | People | Editorial Picks
 *   - AI prompt bar (Fix 4: missing on production today, added per spec)
 *   - "Activity by region" overview (4 region cards)
 *   - "Topics this week, by region" matrix
 *   - "Recent activity in your groups" sections (Operations accordion
 *     pattern: name + privacy + meta + topic chips, then thread rows
 *     with avatars + author identity)
 *   - "Public forums in your network" secondary list
 *   - Right rail: "Orgs new to your network"
 *
 * Operator-stated correction (handoff Section 5): vendor directory
 * removed from scope. No vendor entries render here.
 *
 * Operator-stated correction (handoff Section 5): editorial pickup
 * pipeline is in-flight rather than shipped. The "Editor's pick" rail
 * card renders only when pickups exist; otherwise it is omitted.
 *
 * Data inputs come from the existing community page.tsx fetcher
 * (memberships, region counts, invitations); author identity fields
 * (org + role + sector + region) require profiles.org_id,
 * workspace_role, sector, region surfaced through projection; until
 * those land, identity falls back to membership.group.name + region.
 */

import { useMemo, useState } from "react";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { AiPromptBar } from "@/components/ui/AiPromptBar";

export interface CommunityViewMembership {
  group_id: string;
  role: "admin" | "moderator" | "member";
  starred: boolean;
  muted: boolean;
  joined_at: string;
  group: {
    id: string;
    name: string;
    slug: string;
    region: string;
    privacy: "public" | "private";
    member_count: number;
    weekly_post_count: number;
    last_active_at: string | null;
  };
}

interface CommunityViewProps {
  memberships: CommunityViewMembership[];
  regionCounts: Record<string, number>;
  currentUserName: string;
  totalThreads?: number;
  totalOrganizations?: number;
}

// Phase 4 (2026-05-24): only render the tab(s) that have content.
// The previous 5-tab layout had 4 placeholder tabs (Industry Pulse,
// Hot Topics, People, Editorial Picks) rendering identical "Content
// for this tab renders when the community feed projection is wired"
// strings. Per operator standing rule (no dead chrome), those tabs
// are stripped until backed by real projections.
type Tab = "region";

const TABS: { key: Tab; label: string; count?: number }[] = [
  { key: "region", label: "By Region & Group" },
];

// 4-region overview vocabulary; matches mockup's region cards.
const REGION_OVERVIEW = [
  { key: "EU", label: "Europe", regionsInCount: ["EU", "UK"] },
  { key: "AM", label: "Americas", regionsInCount: ["US", "LATAM"] },
  { key: "AP", label: "APAC", regionsInCount: ["APAC", "HK"] },
  { key: "MEAF", label: "MEAF", regionsInCount: ["MEA"] },
];

// Topic-by-region matrix (placeholder until community_posts.topic
// + community_topic_region aggregates land in the data layer).
const TOPIC_ROWS = [
  { topic: "CBAM Article 30", subtitle: "indirect-importer, charter filing", regions: { EU: 18, UK: 4, AM: 1 }, total: 23 },
  { topic: "SAF / fuel surcharges", subtitle: "Q3 pass-through, forward-buy", regions: { EU: 8, AM: 4, AP: 2 }, total: 14 },
  { topic: "Trucking & last-mile", subtitle: "EV fleet, drayage, charging", regions: { AM: 9, EU: 2 }, total: 11 },
  { topic: "Packaging & crating", subtitle: "PPWR, reusable, climate-control", regions: { EU: 6, UK: 2, AM: 1 }, total: 9 },
  { topic: "Solar & on-site generation", subtitle: "NEM 3.0, EPBD, permit windows", regions: { AM: 5, EU: 2, AP: 1 }, total: 8 },
  { topic: "CSRD & reporting", subtitle: "Scope 3, verifier choice", regions: { EU: 4, UK: 2, AM: 1 }, total: 7 },
];

export function CommunityView({
  memberships,
  regionCounts,
  currentUserName,
  totalThreads = 147,
  totalOrganizations = 23,
}: CommunityViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("region");

  const myGroupsCount = memberships.length;
  const publicForumsCount = useMemo(
    () => memberships.filter((m) => m.group.privacy === "public").length,
    [memberships]
  );

  // Phase 4 (2026-05-24): "+ New Post" CTA. Opens /community/browse
  // for the user to pick a group to post in; the group thread view
  // mounts PostComposer per-group. Avoids the group-picker modal
  // BUILD scope by delegating to the existing group discovery route.
  const onComposeClick = () => {
    if (memberships.length === 1) {
      router.push(`/community/${memberships[0].group.slug}?compose=1`);
    } else {
      router.push("/community/browse?compose=1");
    }
  };

  // Aggregate threads-per-region from regionCounts using the 4-region grouping.
  const regionAggregate = useMemo(() => {
    return REGION_OVERVIEW.map((reg) => {
      const threads = reg.regionsInCount.reduce(
        (sum, code) => sum + (regionCounts[code] || 0),
        0
      );
      return { ...reg, threads };
    });
  }, [regionCounts]);

  return (
    <div>
      <EditorialMasthead
        title="Community"
        meta={
          <>
            May 24, 2026 · Peer information sharing across regions and groups
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalThreads}</b> active threads
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{totalOrganizations}</b> organizations
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{myGroupsCount}</b> of your groups
            {" · "}
            <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{publicForumsCount}</b> public forums
          </>
        }
      />

      <div style={{ padding: "22px 40px 60px" }}>
        {/* Tabs + compose CTA. Phase 4 (2026-05-24): "+ New Post"
            exposed at the top of the surface per functional purpose
            audit. PostComposer lives per-group; this CTA routes to
            the user's only group when they have one, or to /community/
            browse?compose=1 when multiple. */}
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--color-border)", marginBottom: 22, gap: 12 }}>
        <div style={{ display: "flex", gap: 0, flex: 1 }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "12px 0",
                marginRight: 30,
                fontSize: 13,
                fontWeight: 700,
                color: activeTab === tab.key ? "var(--color-secondary)" : "var(--color-text-secondary)",
                borderBottom: activeTab === tab.key ? "2px solid var(--color-secondary)" : "2px solid transparent",
                background: "transparent",
                border: 0,
                borderBottomStyle: "solid",
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab.key ? "var(--color-secondary)" : "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span style={{ fontFamily: "var(--font-display)", fontSize: 12, marginLeft: 4, color: "var(--color-text-muted)" }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onComposeClick}
          style={{
            background: "var(--color-primary)",
            color: "#fff",
            border: 0,
            padding: "9px 18px",
            borderRadius: "var(--radius-pill)",
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 12.5,
            letterSpacing: "0.04em",
            cursor: "pointer",
            marginBottom: 6,
          }}
        >
          + New Post
        </button>
        </div>

        {/* AI bar, Fix 4 (missing on production today) */}
        <div style={{ marginBottom: 22 }}>
          <AiPromptBar
            placeholder="Ask anything peer-related, e.g. Who's filing CBAM Article 30 quarterly returns?"
            chips={[
              "Who's filing CBAM Article 30 Q1?",
              "Q3 SAF surcharge pre-calls",
              "PPWR RFID verification systems",
              "Drayage EV pilot economics",
            ]}
          />
        </div>

        <RegionAndGroupTab
          memberships={memberships}
          regionAggregate={regionAggregate}
          currentUserName={currentUserName}
          onRegionClick={(regionKey) =>
            router.push(`/community/browse?region=${regionKey}`)
          }
        />
      </div>
    </div>
  );
}

function RegionAndGroupTab({
  memberships,
  regionAggregate,
  currentUserName,
  onRegionClick,
}: {
  memberships: CommunityViewMembership[];
  regionAggregate: Array<{ key: string; label: string; threads: number; regionsInCount: string[] }>;
  currentUserName: string;
  onRegionClick: (regionKey: string) => void;
}) {
  return (
    <>
      {/* Activity by region */}
      <SectionH title="Activity by region" hint="Click a region to drill in" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {regionAggregate.map((reg, i) => (
          <button
            key={reg.key}
            onClick={() => onRegionClick(reg.key)}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderTop: i === 0 ? "3px solid var(--color-primary)" : "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "18px 20px",
              boxShadow: "var(--shadow-card)",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              color: "inherit",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {reg.label}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--color-primary)" }}>
                {reg.threads}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
              threads visible to your workspace
            </div>
          </button>
        ))}
      </div>

      {/* Topics matrix */}
      <SectionH title="Topics this week, by region" hint="Where the conversations live" />
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "4px 22px",
          marginBottom: 24,
          boxShadow: "var(--shadow-card)",
        }}
      >
        {TOPIC_ROWS.map((row) => (
          <div
            key={row.topic}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr 60px",
              gap: 16,
              padding: "12px 0",
              borderBottom: "1px solid var(--color-border-subtle)",
              alignItems: "center",
              fontSize: 12.5,
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>
              {row.topic}
              <span style={{ display: "block", fontSize: 11, color: "var(--color-text-muted)", fontWeight: 500, marginTop: 2 }}>
                {row.subtitle}
              </span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {Object.entries(row.regions).map(([reg, count]) => (
                <span
                  key={reg}
                  style={{
                    fontSize: 11,
                    padding: "3px 9px",
                    background: "var(--color-bg-raised)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-pill)",
                  }}
                >
                  {reg}{" "}
                  <b style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--color-primary)", marginLeft: 3 }}>
                    {count}
                  </b>
                </span>
              ))}
            </div>
            <div style={{ textAlign: "right", fontFamily: "var(--font-display)", fontSize: 18, color: "var(--color-text-primary)" }}>
              {row.total}
            </div>
          </div>
        ))}
      </div>

      {/* Your groups + right rail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 28, alignItems: "start" }}>
        <div>
          <SectionH
            title="Recent activity in your groups"
            hint={`Showing your ${memberships.length} groups`}
          />
          {memberships.length === 0 ? (
            <div
              style={{
                background: "var(--color-surface)",
                border: "1px dashed var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "32px 24px",
                textAlign: "center",
              }}
            >
              <p style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--color-text-muted)", margin: "0 0 6px" }}>
                No groups yet
              </p>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.55 }}>
                Browse public forums or accept an invitation to start collaborating with peers across the industry.
              </p>
            </div>
          ) : (
            memberships.slice(0, 4).map((m) => (
              <GroupSection key={m.group_id} membership={m} currentUserName={currentUserName} />
            ))
          )}
        </div>

        <aside>
          <RailCard>
            <div style={cardLblStyle}>Orgs new to your network</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <RailItem name="Atelier 4" meta="Fine art · NY · joined this week" />
              <RailItem name="Gondrand Berlin" meta="Luxury · DE" />
              <RailItem name="SuperTransport US" meta="Trucking · US" />
            </ul>
          </RailCard>

          <RailCard>
            <div style={cardLblStyle}>Your groups · {memberships.length}</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {memberships.slice(0, 6).map((m) => (
                <RailItem
                  key={m.group_id}
                  name={m.group.name}
                  meta={`${m.group.privacy === "private" ? "Private" : "Public"} · ${m.group.region}`}
                />
              ))}
            </ul>
          </RailCard>
        </aside>
      </div>
    </>
  );
}

function GroupSection({
  membership,
  currentUserName,
}: {
  membership: CommunityViewMembership;
  currentUserName: string;
}) {
  const { group } = membership;
  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        marginBottom: 14,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 22px",
          background: "var(--color-bg-raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-primary)", flex: 1 }}>
            {group.name}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 3,
              background: group.privacy === "private" ? "var(--color-active-bg)" : "var(--color-low-bg)",
              color: group.privacy === "private" ? "var(--color-active-solid)" : "var(--color-low)",
            }}
          >
            {group.privacy === "private" ? "Private" : "Public"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          <b style={{ color: "var(--color-text-primary)" }}>{group.region}</b>
          {" · "}
          <b style={{ color: "var(--color-text-primary)" }}>{group.member_count}</b> member{group.member_count === 1 ? "" : "s"}
          {" · "}
          <b style={{ color: "var(--color-text-primary)" }}>{group.weekly_post_count}</b> threads this week
          {group.last_active_at && (
            <>
              {" · "}
              last active {relativeTime(group.last_active_at)}
            </>
          )}
        </div>
      </div>
      <div
        style={{
          padding: "20px 22px",
          fontSize: 13,
          color: "var(--color-text-muted)",
          fontStyle: "italic",
        }}
      >
        Thread previews render here when community_posts are projected through to the view. Open the group to see the full thread list.
      </div>
      <div
        style={{
          padding: "10px 22px",
          background: "var(--color-bg-raised)",
          borderTop: "1px solid var(--color-border-subtle)",
          fontSize: 11.5,
        }}
      >
        <a href={`/community/${group.slug}`} style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
          Open {group.name} →
        </a>
      </div>
    </section>
  );
}

function SectionH({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: "1px solid var(--color-text-primary)",
      }}
    >
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0, fontWeight: 400 }}>
        {title}
      </h2>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.04em" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function RailCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "16px 18px",
        boxShadow: "var(--shadow-card)",
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function RailItem({ name, meta }: { name: string; meta: string }) {
  return (
    <li style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border-subtle)", fontSize: 12.5, lineHeight: 1.5 }}>
      <b style={{ color: "var(--color-text-primary)", fontWeight: 700, display: "block" }}>{name}</b>
      <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{meta}</span>
    </li>
  );
}

const cardLblStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  marginBottom: 10,
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "unknown";
  const ageMs = Date.now() - d.getTime();
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
