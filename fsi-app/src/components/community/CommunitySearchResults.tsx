"use client";

/**
 * CommunitySearchResults — dropdown shown below the masthead when the
 * user submits a search or types more than 2 characters with the
 * dropdown enabled.
 *
 * Build 10: previously the masthead form fired a "Search coming soon"
 * toast. This component consumes /api/community/search and renders the
 * three result groups (posts, groups, people) with click-through links.
 *
 * Light-weight by design: no virtualization, no recursive subqueries.
 * Each group caps at 8 rows so the dropdown footprint stays bounded.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, FileText, Users, User, Lock, Globe, X } from "lucide-react";

type Scope = "all" | "posts" | "groups" | "people";

interface PostHit {
  id: string;
  title: string;
  body_excerpt: string;
  group_id: string;
  group_name: string;
  group_slug: string;
  created_at: string;
}

interface GroupHit {
  id: string;
  name: string;
  slug: string;
  region: string;
  privacy: "public" | "private";
  member_count: number;
}

interface PeopleHit {
  user_id: string;
  name: string;
  headshot_url: string | null;
}

interface SearchResponse {
  posts: PostHit[];
  groups: GroupHit[];
  people: PeopleHit[];
}

interface CommunitySearchResultsProps {
  query: string;
  scope: Scope;
  onClose: () => void;
}

export function CommunitySearchResults({
  query,
  scope,
  onClose,
}: CommunitySearchResultsProps) {
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/community/search?q=${encodeURIComponent(query.trim())}&scope=${scope}`,
          { cache: "no-store" }
        );
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(j?.error ?? `Search failed (${res.status})`);
          return;
        }
        setResults(j);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, scope]);

  const empty =
    !!results &&
    results.posts.length === 0 &&
    results.groups.length === 0 &&
    results.people.length === 0;

  return (
    <section
      role="region"
      aria-label="Search results"
      style={{
        marginTop: 12,
        maxWidth: 880,
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "14px 16px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingBottom: 8,
          marginBottom: 10,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          Results for &ldquo;{query}&rdquo;
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search results"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--color-text-muted)",
            cursor: "pointer",
            padding: 2,
            display: "inline-flex",
          }}
        >
          <X size={14} />
        </button>
      </header>

      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--color-text-muted)",
          }}
        >
          <Loader2 size={14} className="animate-spin" /> Searching…
        </div>
      )}

      {error && (
        <p style={{ fontSize: 12, color: "var(--color-critical, #b91c1c)" }}>
          {error}
        </p>
      )}

      {empty && !loading && !error && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          No matches in posts, groups, or people for &ldquo;{query}&rdquo;.
        </p>
      )}

      {results && (results.posts.length > 0 || results.groups.length > 0 || results.people.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {results.groups.length > 0 && (
            <ResultSection
              icon={<Users size={12} />}
              title={`Groups (${results.groups.length})`}
            >
              {results.groups.map((g) => (
                <GroupHitRow key={g.id} group={g} onSelect={onClose} />
              ))}
            </ResultSection>
          )}
          {results.posts.length > 0 && (
            <ResultSection
              icon={<FileText size={12} />}
              title={`Posts (${results.posts.length})`}
            >
              {results.posts.map((p) => (
                <PostHitRow key={p.id} post={p} onSelect={onClose} />
              ))}
            </ResultSection>
          )}
          {results.people.length > 0 && (
            <ResultSection
              icon={<User size={12} />}
              title={`People (${results.people.length})`}
            >
              {results.people.map((p) => (
                <PeopleHitRow key={p.user_id} person={p} />
              ))}
            </ResultSection>
          )}
        </div>
      )}
    </section>
  );
}

function ResultSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: "0 0 6px",
        }}
      >
        {icon}
        {title}
      </h3>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {children}
      </ul>
    </section>
  );
}

function GroupHitRow({
  group,
  onSelect,
}: {
  group: GroupHit;
  onSelect: () => void;
}) {
  return (
    <li>
      <Link
        href={`/community/${group.slug}`}
        onClick={onSelect}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 4,
          textDecoration: "none",
          color: "var(--color-text-primary)",
          background: "transparent",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background =
            "var(--color-bg-base)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        {group.privacy === "private" ? (
          <Lock size={14} color="var(--color-high, #b45309)" />
        ) : (
          <Globe size={14} color="var(--color-text-muted)" />
        )}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
          {group.name}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {group.region} · {group.member_count} member
          {group.member_count === 1 ? "" : "s"}
        </span>
      </Link>
    </li>
  );
}

function PostHitRow({
  post,
  onSelect,
}: {
  post: PostHit;
  onSelect: () => void;
}) {
  return (
    <li>
      <Link
        href={`/community/${post.group_slug}`}
        onClick={onSelect}
        style={{
          display: "block",
          padding: "8px 10px",
          borderRadius: 4,
          textDecoration: "none",
          color: "var(--color-text-primary)",
          background: "transparent",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background =
            "var(--color-bg-base)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
        }
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>{post.title}</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          in <b>{post.group_name}</b> ·{" "}
          {new Date(post.created_at).toLocaleDateString()}
        </div>
        {post.body_excerpt && (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              marginTop: 4,
              lineHeight: 1.45,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
            }}
          >
            {post.body_excerpt}
          </div>
        )}
      </Link>
    </li>
  );
}

function PeopleHitRow({ person }: { person: PeopleHit }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 4,
      }}
    >
      {person.headshot_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.headshot_url}
          alt=""
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: "var(--color-primary)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
          }}
        >
          {(person.name ?? "?")
            .split(/\s+/)
            .map((p) => p[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
      )}
      <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
        {person.name}
      </span>
    </li>
  );
}
