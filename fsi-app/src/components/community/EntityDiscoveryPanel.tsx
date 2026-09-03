"use client";

/**
 * EntityDiscoveryPanel — cross-group topic discovery + topic follow/digest (spec 05 §5 component 3
 * "cross-group topic discovery" and component 6 "topic follow and digest").
 *
 * Why entities ARE the cross-group topic here: this platform's only cross-group grouping concept
 * is `community_topics` (migration 031), and it is structurally per-user/private (RLS:
 * `owner_user_id = auth.uid()` on every policy) — it cannot back a shared, discoverable topic
 * surface. Spec 05 §5 component 2's own framing is the way out: "entity-bound posting... makes
 * Community reachable from the other four surfaces" — a spine entity (corridor / jurisdiction /
 * instrument / technology / organisation) already IS the cross-cutting topic the spec wants,
 * because a thread bound to one lives in whatever group its author posted it in, and
 * GET /api/community/entities/[entityId]/threads pulls it back regardless of group. Picking an
 * entity here surfaces every thread bound to it, across every group. [INFERRED] — see this lane's
 * report.
 *
 * "Follow" persists the watched entity list to the browser's localStorage — no follow/notification
 * storage exists in this lane's write set or contract (grep of
 * src/app/api/community/notifications found kinds {mention, reply, promote, invite, moderation},
 * no topic/entity-follow kind), so this is a deliberate, labelled, per-device convenience rather
 * than a durable cross-device subscription. "Digest" is the live result: for every followed
 * entity, its most recent threads render inline below — fetched ONCE per watch-list change, no
 * polling.
 */

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { getEntityThreads, type EntityThread } from "./api-client";
import { EntityPicker } from "./EntityPicker";
import { AuthorIdentityChip } from "./AuthorIdentityChip";
import { PromotionStateBadge } from "./PromotionStateBadge";
import { EvidenceAgeChip } from "./EvidenceAgeChip";
// `@/` form — see Post.tsx's import of the same file for why (esbuild alias constraint in the
// rendering-guard smoke harness).
import "@/components/community/community.css";
import type { CommunityEntityRef } from "./types";

const STORAGE_KEY = "cl-community-followed-entities-v1";

function loadWatched(): CommunityEntityRef[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CommunityEntityRef =>
        e && typeof e.entity_id === "string" && typeof e.kind === "string"
    );
  } catch {
    return [];
  }
}

function saveWatched(entities: CommunityEntityRef[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entities));
  } catch {
    // Private browsing / storage disabled — the follow list just doesn't persist. Non-fatal.
  }
}

interface EntityDiscoveryPanelProps {
  candidateEntities: CommunityEntityRef[];
}

export function EntityDiscoveryPanel({ candidateEntities }: EntityDiscoveryPanelProps) {
  const [watched, setWatched] = useState<CommunityEntityRef[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [threadsByEntity, setThreadsByEntity] = useState<Record<string, EntityThread[] | null>>({});

  useEffect(() => {
    setWatched(loadWatched());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWatched(watched);
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        watched.map(async (e) => {
          const result = await getEntityThreads(e.entity_id, { limit: 5 });
          return [e.entity_id, result?.threads ?? null] as const;
        })
      );
      if (!cancelled) {
        setThreadsByEntity(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the watch list itself changes
  }, [hydrated, watched.map((w) => w.entity_id).join(",")]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          padding: 16,
        }}
      >
        <EntityPicker
          candidates={candidateEntities}
          value={watched}
          onChange={setWatched}
        />
        <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
          Follows are saved on this device only. Each followed entity's most recent threads —
          across every group that discusses it — appear below.
        </p>
      </div>

      {watched.length === 0 && (
        <div
          style={{
            background: "var(--color-bg-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: 6,
            padding: "28px 20px",
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--color-text-secondary)",
          }}
        >
          Follow a corridor, jurisdiction, instrument, technology, or organisation to see every
          thread that touches it, wherever in Community it was posted.
        </div>
      )}

      {watched.map((entity) => (
        <EntityDigestSection
          key={entity.entity_id}
          entity={entity}
          threads={threadsByEntity[entity.entity_id] ?? null}
          onUnfollow={() => setWatched((prev) => prev.filter((e) => e.entity_id !== entity.entity_id))}
        />
      ))}
    </div>
  );
}

function EntityDigestSection({
  entity,
  threads,
  onUnfollow,
}: {
  entity: CommunityEntityRef;
  threads: EntityThread[] | null;
  onUnfollow: () => void;
}) {
  return (
    <section
      aria-label={`Threads about ${entity.canonical_name}`}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        className="cl-comm-row"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
      >
        <h3
          data-guard-title
          style={{
            margin: 0,
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            overflowWrap: "anywhere",
          }}
        >
          {entity.canonical_name}
        </h3>
        <button
          type="button"
          onClick={onUnfollow}
          aria-label={`Unfollow ${entity.canonical_name}`}
          className="cl-comm-row-aside"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "4px 9px",
            /* UX law 2's small-target alternative floor (>=24px + 8px clearance) — this row's only
               other target is the Follow control inside EntityPicker above, well clear of this
               button, so 24px+ is sufficient here without forcing the full 44px floor onto a
               secondary per-card action. */
            minHeight: 26,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <BellOff size={11} />
          Unfollow
        </button>
      </div>

      {threads === null && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>Loading…</p>
      )}
      {threads !== null && threads.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>
          No threads yet.
        </p>
      )}
      {threads !== null && threads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {threads.map((t) => (
            <article
              key={t.id}
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <p
                data-guard-title
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  overflowWrap: "anywhere",
                  minWidth: 0,
                }}
              >
                {t.title || t.body.slice(0, 120)}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {t.author_identity && <AuthorIdentityChip identity={t.author_identity} />}
                <PromotionStateBadge state={t.promotion_state} originClass={t.origin_class} />
                <EvidenceAgeChip chip={t.evidence_chip} />
              </div>
              <span style={{ fontSize: 10.5, color: "var(--color-text-muted)" }}>
                <Bell size={9} aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: 3 }} />
                {t.reply_count} repl{t.reply_count === 1 ? "y" : "ies"}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
