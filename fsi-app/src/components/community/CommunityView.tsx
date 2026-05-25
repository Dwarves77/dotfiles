"use client";

/**
 * CommunityView — H6 rebuild (2026-05-25).
 *
 * Binds to design_handoff_2026-05/community.html. The mockup is the
 * authoritative shape; the prior rebuild (Sequence C, 2026-05-24) had
 * three elements inferred from the Phase 1.5 audit framework rather
 * than the mockup — those are stripped here:
 *
 *   - "+ New Post" top-level CTA  → removed (not in mockup; compose
 *     lives per-group via /community/[slug] PostComposer)
 *   - AiPromptBar                  → removed (not in mockup)
 *   - Right rail "Your groups"
 *     duplicate card                → removed (not in mockup)
 *
 * Restored from the mockup:
 *
 *   - 5-tab strip (By Region & Group default + Industry Pulse, Hot
 *     Topics, People, Editorial Picks). Tabs 2-5 render as labeled
 *     functional empty states per Option A — the mockup detailed only
 *     tab 1's content shape.
 *   - Thread rows inside each group section (was italic placeholder)
 *     rendered with id="post-{uuid}" on the outer element so /admin
 *     CommunityPickups "View thread" anchors resolve.
 *   - "Public forums in your network" section below "Recent activity"
 *   - Right rail: single "Orgs new to your network" + "Peer
 *     directory →" link
 *
 * Author identity (mockup line: name + org + role + sector + region)
 * surfaces what migration 105 projections expose — full_name, org
 * name (orange), workspace_role, sector[], region[]. Missing fields
 * degrade silently rather than rendering placeholders.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";

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

export interface CommunityViewThread {
  id: string;
  group_id: string;
  title: string | null;
  body: string;
  reply_count: number;
  created_at: string;
  last_reply_at: string | null;
  referenced_intelligence_item_ids: string[];
  author: {
    full_name: string | null;
    org_name: string | null;
    workspace_role: string | null;
    sector: string[];
    region: string[];
  };
}

export interface CommunityViewPublicForum {
  id: string;
  name: string;
  slug: string;
  region: string;
  member_count: number;
  weekly_post_count: number;
  last_active_at: string | null;
}

interface CommunityViewProps {
  memberships: CommunityViewMembership[];
  regionCounts: Record<string, number>;
  threads: CommunityViewThread[];
  publicForums: CommunityViewPublicForum[];
  currentUserName: string;
  totalThreads?: number;
  totalOrganizations?: number;
}

type Tab = "region" | "pulse" | "hot" | "people" | "editorial";

// 4-region overview vocabulary; matches mockup's region cards. The
// regionsInCount mapping aggregates raw region codes (EU+UK,
// US+LATAM, APAC+HK, MEA) into the 4-card display vocabulary used by
// the mockup.
const REGION_OVERVIEW = [
  { key: "EU", label: "Europe", regionsInCount: ["EU", "UK"] },
  { key: "AM", label: "Americas", regionsInCount: ["US", "LATAM"] },
  { key: "AP", label: "APAC", regionsInCount: ["APAC", "HK"] },
  { key: "MEAF", label: "MEAF", regionsInCount: ["MEA"] },
] as const;

// Topic-by-region matrix. Placeholder counts until
// community_posts.topic + a region-aggregate RPC land in the data
// layer. Structure binds to mockup; values are stand-in.
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
  threads,
  publicForums,
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

  const regionAggregate = useMemo(() => {
    return REGION_OVERVIEW.map((reg) => {
      const groups = reg.regionsInCount.reduce(
        (sum, code) => sum + (regionCounts[code] || 0),
        0
      );
      return { ...reg, threads: groups };
    });
  }, [regionCounts]);

  // Group threads by group_id; top 3 per group by last_reply_at order
  // (the fetch is already ordered, just trim per group).
  const threadsByGroup = useMemo(() => {
    const map = new Map<string, CommunityViewThread[]>();
    for (const t of threads) {
      const list = map.get(t.group_id) ?? [];
      if (list.length < 3) {
        list.push(t);
        map.set(t.group_id, list);
      }
    }
    return map;
  }, [threads]);

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "region", label: "By Region & Group" },
    { key: "pulse", label: "Industry Pulse", count: totalThreads },
    { key: "hot", label: "Hot Topics" },
    { key: "people", label: "People", count: 412 },
    { key: "editorial", label: "Editorial Picks", count: 8 },
  ];

  return (
    <div>
      <EditorialMasthead
        title="Community"
        meta={
          <>
            Peer information sharing across regions and groups
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

      <div className="cl-page-pad">
        {/* 5-tab strip per mockup. Tab 1 (region) gets full content;
            tabs 2-5 render labeled empty states per Option A (their
            content shape was not in the mockup file). */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--color-border)",
            marginBottom: 22,
            gap: 0,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "12px 0",
                marginRight: 30,
                fontSize: 13,
                fontWeight: 700,
                color: activeTab === tab.key ? "var(--color-secondary)" : "var(--color-text-secondary)",
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
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 12,
                    marginLeft: 4,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "region" && (
          <RegionAndGroupTab
            memberships={memberships}
            regionAggregate={regionAggregate}
            threadsByGroup={threadsByGroup}
            publicForums={publicForums}
            onRegionClick={(regionKey) =>
              router.push(`/community/browse?region=${regionKey}`)
            }
          />
        )}

        {activeTab === "pulse" && (
          <TabEmptyState
            title="Industry Pulse"
            description="Industry-wide signal aggregation across all groups and regions. Pulses surface here when the activity-aggregation projection lands."
          />
        )}
        {activeTab === "hot" && (
          <TabEmptyState
            title="Hot Topics"
            description="Trending topics across the network with thread-count momentum. Available when the topic-momentum projection ships."
          />
        )}
        {activeTab === "people" && (
          <TabEmptyState
            title="People"
            description="Peer directory across organizations active in the network. Available when the cross-org profile projection ships."
          />
        )}
        {activeTab === "editorial" && (
          <TabEmptyState
            title="Editorial Picks"
            description="Hand-curated highlights from the editorial team. Available when the editorial pickup pipeline activates."
          />
        )}
      </div>
    </div>
  );
}

function RegionAndGroupTab({
  memberships,
  regionAggregate,
  threadsByGroup,
  publicForums,
  onRegionClick,
}: {
  memberships: CommunityViewMembership[];
  regionAggregate: Array<{ key: string; label: string; threads: number; regionsInCount: readonly string[] }>;
  threadsByGroup: Map<string, CommunityViewThread[]>;
  publicForums: CommunityViewPublicForum[];
  onRegionClick: (regionKey: string) => void;
}) {
  return (
    <>
      {/* Activity by region */}
      <SectionH title="Activity by region" hint="Click a region to drill in" />
      <div className="cl-coverage-rail cl-coverage-rail--4" style={{ gap: 14, marginBottom: 24 }}>
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

      {/* Two-col layout: main groups column + right rail */}
      <div className="cl-two-col cl-two-col--wide">
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
              <GroupSection
                key={m.group_id}
                membership={m}
                threads={threadsByGroup.get(m.group_id) ?? []}
              />
            ))
          )}

          {/* Public forums in your network */}
          {publicForums.length > 0 && (
            <>
              <div style={{ marginTop: 24 }}>
                <SectionH
                  title="Public forums in your network"
                  hint={`By region · ${publicForums.length} listed`}
                />
              </div>
              {publicForums.map((forum) => (
                <PublicForumCard key={forum.id} forum={forum} />
              ))}
            </>
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
            <a
              href="/community/browse"
              style={{
                color: "var(--color-primary)",
                fontWeight: 700,
                fontSize: 11.5,
                textDecoration: "none",
                letterSpacing: "0.04em",
                marginTop: 8,
                display: "inline-block",
              }}
            >
              Peer directory →
            </a>
          </RailCard>
        </aside>
      </div>
    </>
  );
}

function GroupSection({
  membership,
  threads,
}: {
  membership: CommunityViewMembership;
  threads: CommunityViewThread[];
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

      {/* Body: render thread rows OR empty-state when no threads yet */}
      <div style={{ padding: "4px 0" }}>
        {threads.length === 0 ? (
          <div
            style={{
              padding: "20px 22px",
              fontSize: 13,
              color: "var(--color-text-muted)",
              fontStyle: "italic",
            }}
          >
            No recent activity in this group.
          </div>
        ) : (
          threads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} groupSlug={group.slug} />
          ))
        )}
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
          All {group.weekly_post_count} threads in {group.name} →
        </a>
      </div>
    </section>
  );
}

function ThreadRow({ thread, groupSlug }: { thread: CommunityViewThread; groupSlug: string }) {
  // Author identity from migration 105 projections. Render only what
  // is available; degrade silently per H1 honest empty-state pattern.
  const author = thread.author;
  const initials = initialsFor(author.full_name);
  const hasXref = thread.referenced_intelligence_item_ids.length > 0;

  return (
    <a
      id={`post-${thread.id}`}
      href={`/community/${groupSlug}#post-${thread.id}`}
      style={{
        padding: "12px 22px",
        borderBottom: "1px solid var(--color-border-subtle)",
        display: "grid",
        gridTemplateColumns: "36px 1fr auto",
        gap: 14,
        alignItems: "start",
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: "var(--color-bg-raised)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontSize: 13,
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-border)",
        }}
      >
        {initials}
      </div>
      <div style={{ minWidth: 0 }}>
        <h4
          style={{
            fontSize: 14.5,
            fontWeight: 700,
            margin: "0 0 4px",
            lineHeight: 1.4,
            color: "var(--color-text-primary)",
          }}
        >
          {thread.title || "(Untitled thread)"}
        </h4>
        <div style={{ fontSize: 11.5, color: "var(--color-text-secondary)" }}>
          {author.full_name && (
            <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{author.full_name}</span>
          )}
          {author.org_name && (
            <>
              {" · "}
              <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>{author.org_name}</span>
            </>
          )}
          {author.workspace_role && (
            <>
              {" · "}
              <span>{author.workspace_role}</span>
            </>
          )}
          {author.sector && author.sector.length > 0 && (
            <>
              {" · "}
              <span>{author.sector.slice(0, 2).join(", ")}</span>
            </>
          )}
          {author.region && author.region.length > 0 && (
            <>
              {" · "}
              <span>{author.region.slice(0, 2).join(", ")}</span>
            </>
          )}
        </div>
        {hasXref && (
          <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 10,
                padding: "1px 7px",
                borderRadius: "var(--radius-pill)",
                background: "rgba(232,97,10,0.08)",
                color: "var(--color-primary)",
                border: "1px solid var(--color-border-ai)",
                fontWeight: 700,
              }}
            >
              → {thread.referenced_intelligence_item_ids.length} platform reference{thread.referenced_intelligence_item_ids.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
        <b
          style={{
            display: "block",
            color: "var(--color-text-primary)",
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          {thread.reply_count}
        </b>
        repl{thread.reply_count === 1 ? "y" : "ies"}
        {thread.last_reply_at && (
          <>
            {" · "}
            {relativeTime(thread.last_reply_at)}
          </>
        )}
      </div>
    </a>
  );
}

function PublicForumCard({ forum }: { forum: CommunityViewPublicForum }) {
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
            {forum.name}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 3,
              background: "var(--color-low-bg)",
              color: "var(--color-low)",
            }}
          >
            Public
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          <b style={{ color: "var(--color-text-primary)" }}>{forum.region}</b>
          {" · "}
          <b style={{ color: "var(--color-text-primary)" }}>{forum.member_count}</b> members
          {" · "}
          <b style={{ color: "var(--color-text-primary)" }}>{forum.weekly_post_count}</b> threads this week
          {forum.last_active_at && (
            <>
              {" · "}
              last active {relativeTime(forum.last_active_at)}
            </>
          )}
        </div>
      </div>
      <div
        style={{
          padding: "10px 22px",
          background: "var(--color-bg-raised)",
          fontSize: 11.5,
        }}
      >
        <a href={`/community/${forum.slug}`} style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
          Join discussion →
        </a>
      </div>
    </section>
  );
}

function TabEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px dashed var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "60px 32px",
        textAlign: "center",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: "0 0 12px",
          fontWeight: 400,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: 13.5,
          color: "var(--color-text-secondary)",
          margin: "0 auto",
          maxWidth: 520,
          lineHeight: 1.55,
        }}
      >
        {description}
      </p>
    </div>
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

function initialsFor(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0][0] || "") + (parts[parts.length - 1][0] || "")).toUpperCase();
}

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
