// community-topics-seed.mjs — MAINT dispatch step for scripts/seed/community-topics-seed.mjs.
//
// WHY THIS EXISTS (Lane MAINT, 2026-09-02). scripts/seed/community-topics-seed.mjs is real, tested,
// dry-by-default code with no runtime — its own header says "coordinator applies; this lane does not
// run --apply" and nothing ever dispatched it. Live count: 0 community_topics rows. This wrapper is
// that dispatch, not a reimplementation: the ONE piece of decision logic (which topics/links this run
// would create, given the taxonomy and whatever rooms already exist) is `planTopicLinks` from that
// script, imported unmodified. What's added here is orchestration only — read the current DB state,
// call the imported pure planner, write through the SAME guarded calls
// (`guardedInsert("community_topics"/"community_topic_groups", ...)`) the original script's own main()
// makes, with deps injected so this is testable without a database (COMMON's deps-injection rule).
// `resolveOwner` below duplicates ~5 lines of the original's internal (unexported) resolveOwner() — not
// logic worth a shared export, and the original never exports it.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOPICS, CANONICAL_ROOM_SLUGS, planTopicLinks } from "../seed/community-topics-seed.mjs";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "caros-ledge-platform-intent",
  reason:
    "MAINT community-topics-seed dispatch (Lane MAINT, 2026-09-02) — the runtime scripts/seed/" +
    "community-topics-seed.mjs never had. Writes exactly what that script's own main() would write " +
    "(topics + topic-room links for the S2 7-topic freight-sustainability taxonomy); planTopicLinks " +
    "imported unmodified from that file.",
});

/** Mirrors community-topics-seed.mjs's internal (unexported) resolveOwner: first platform admin, else
 *  the first profile row, else null (nothing to own the topics — caller must not proceed to write). */
export async function resolveOwner(deps) {
  const admins = await deps.readAll("profiles", "id, is_platform_admin", { match: (q) => q.eq("is_platform_admin", true) });
  if (admins && admins.length) return admins[0].id;
  const any = await deps.readClient().from("profiles").select("id").limit(1);
  if (any?.data?.length) return any.data[0].id;
  return null;
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{ readAll: Function, guardedInsert: Function, readClient: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "community-topics-seed", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rooms = await deps.readAll("community_groups", "id, slug");
  const roomIdBySlug = new Map((rooms || []).map((r) => [r.slug, r.id]));
  const missingRooms = CANONICAL_ROOM_SLUGS.filter((s) => !roomIdBySlug.has(s));

  const ownerId = await resolveOwner(deps);
  if (!ownerId) {
    summary.counts = { topics_planned: TOPICS.length, owner_resolved: false, missing_rooms: missingRooms };
    summary.note = "no profiles row found to own the topics — onboard a user first. Nothing planned or written.";
    summary.exitCode = apply ? 2 : 0;
    return summary;
  }

  const existingTopics = await deps.readAll("community_topics", "id, owner_user_id, label", { match: (q) => q.eq("owner_user_id", ownerId) });
  const topicIdByLabel = new Map((existingTopics || []).map((t) => [t.label, t.id]));
  const plan = planTopicLinks(TOPICS, roomIdBySlug);

  let topicsCreated = 0, linksCreated = 0, topicsExisting = 0, linksExisting = 0, topicsWouldCreate = 0, linksWouldCreate = 0;

  for (const t of plan) {
    let topicId = topicIdByLabel.get(t.label);
    if (topicId) {
      topicsExisting += 1;
    } else if (!apply) {
      topicsWouldCreate += 1;
    } else {
      const res = await deps.guardedInsert("community_topics", { owner_user_id: ownerId, label: t.label }, { cite: CITE });
      topicId = res.inserted.id;
      topicIdByLabel.set(t.label, topicId);
      topicsCreated += 1;
    }

    const existingLinks = topicId
      ? await deps.readAll("community_topic_groups", "topic_id, group_id", { match: (q) => q.eq("topic_id", topicId), orderBy: "group_id" })
      : [];
    const linkedGroupIds = new Set((existingLinks || []).map((l) => l.group_id));

    for (const link of t.resolved) {
      if (linkedGroupIds.has(link.group_id)) { linksExisting += 1; continue; }
      if (!apply || !topicId) { linksWouldCreate += 1; continue; }
      await deps.guardedInsert("community_topic_groups", { topic_id: topicId, group_id: link.group_id }, { cite: CITE, select: "topic_id, group_id" });
      linksCreated += 1;
    }
  }

  summary.counts = {
    owner_user_id: ownerId,
    missing_rooms: missingRooms,
    topics_existing: topicsExisting,
    topics_would_create: topicsWouldCreate,
    topics_created: topicsCreated,
    links_existing: linksExisting,
    links_would_create: linksWouldCreate,
    links_created: linksCreated,
  };
  summary.applied = topicsCreated + linksCreated;

  const afterTopics = await deps.readAll("community_topics", "id", { match: (q) => q.eq("owner_user_id", ownerId) });
  let afterLinks = 0;
  for (const id of topicIdByLabel.values()) {
    const l = await deps.readAll("community_topic_groups", "topic_id, group_id", { match: (q) => q.eq("topic_id", id), orderBy: "group_id" });
    afterLinks += l?.length ?? 0;
  }
  summary.read_back = { topics_live_for_owner: afterTopics.length, links_live_for_owner: afterLinks };

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) {
  await runCli({
    step: "community-topics-seed",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedInsert, readClient } = await import("../lib/db.mjs");
      return { readAll, guardedInsert, readClient };
    },
  });
}
