/**
 * community-topics-seed.mjs
 *
 * S2 (ship-wires II) — seed a freight-sustainability TOPIC TAXONOMY as community_topics rows,
 * each linked (via community_topic_groups) to the subset of the 7 canonical regional ROOMS it
 * actually concentrates in.
 *
 * SCHEMA REALITY CHECK (read migration 031 before touching this file): community_topics is NOT
 * a global/shared taxonomy table. Per its own comment, it is "per-user sidebar groupings ...
 * private to the owning user. They do NOT change group membership and do NOT alter group
 * visibility — they are pure UI bookmarks." Every row REQUIRES a real owner_user_id (FK to
 * auth.users, RLS-gated to `owner_user_id = auth.uid()`). There is no concept of an
 * anonymous/platform-shared topic anywhere in the schema.
 *
 * This seed therefore follows the EXACT precedent of seed-community-regional-rooms.mjs (which
 * faced the analogous problem for community_groups.owner_user_id): it resolves ONE owner — the
 * first platform admin, same fallback chain — and seeds a worked-example taxonomy for that
 * owner's sidebar. These rows are a reference grouping an admin can see and use (and a template a
 * future onboarding-clone step could copy per new user), NOT a taxonomy every user automatically
 * gets — the schema has no mechanism for that, and inventing one here would be a silent product
 * decision this script has no authority to make. If per-user auto-provisioning of default topics
 * is wanted, that is a separate, explicit unit.
 *
 * TAXONOMY (operator-directed, S2 lane, 2026-08-31): 7 freight-sustainability subject topics,
 * each mapped to the room(s) where that subject's regulatory/commercial geography actually
 * concentrates (see the `rationale` on each entry in TOPICS below) — not a maximal "link
 * everything to everything" seed. Every one of the 7 canonical rooms is reachable from at least 2
 * topics (asserted in community-topics-seed.test.mjs).
 *
 * SAFETY (mirrors seed-community-regional-rooms.mjs + rule 015 — the guarded db.mjs path):
 *   - DRY-RUN by default. Pass --apply to actually write. (Sibling room-seed used --execute; this
 *     lane was directed to use --apply — same guard, different flag name.)
 *   - Every write goes through guardedInsert (cite + snapshot + service-role) — see
 *     scripts/lib/db.mjs. No raw client, no unguarded write.
 *   - Idempotent both ways: a topic whose LABEL already exists for the resolved owner is skipped
 *     (never re-created, never duplicated); a link whose (topic_id, group_id) pair already exists
 *     is skipped.
 *   - A room slug a topic wants that ISN'T seeded yet (community_groups has no row for that slug
 *     — the rooms seed hasn't run, or hasn't run in full) is named and skipped for that topic —
 *     never a crash, never a guessed/placeholder row. See planTopicLinks below (PURE, unit-tested
 *     directly — this is the one piece of logic that could silently misbehave).
 *   - Reads only otherwise. No spend, no fetch, no mint. $0.
 *
 * RUN (after loading env; coordinator applies — this lane does not run --apply):
 *   node scripts/seed/community-topics-seed.mjs            # dry-run preview
 *   node scripts/seed/community-topics-seed.mjs --apply    # write topics + links
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedInsert, readClient } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try {
  process.loadEnvFile(resolve(ROOT, ".env.local"));
} catch {
  // env may already be loaded by the caller; guardedInsert will throw if not.
}

export const APPLY = process.argv.includes("--apply");

// Keep in lockstep with ROOMS[].slug in scripts/seed-community-regional-rooms.mjs and
// CANONICAL room slugs in src/lib/community/rooms.ts.
export const CANONICAL_ROOM_SLUGS = Object.freeze([
  "room-global", "room-eu", "room-us", "room-uk", "room-apac", "room-latam", "room-meaf",
]);

// The 7-topic freight-sustainability taxonomy. `rooms` are canonical room SLUGS this subject's
// real-world geography concentrates in — grounded, not maximal (a topic mapped to all 7 rooms
// without a reason would be noise, not a taxonomy; only "Regional operating costs" earns all 7,
// because a comparative-cost topic is regional by definition).
export const TOPICS = Object.freeze([
  {
    label: "ETS & FuelEU Maritime",
    rooms: ["room-eu", "room-global"],
    rationale:
      "EU ETS maritime (phased in from 2024) and the FuelEU Maritime Regulation ((EU) 2023/1805) are " +
      "both EU instruments. Global because they bind any vessel calling an EU port on an otherwise " +
      "worldwide corridor, not just EU-flagged operators.",
  },
  {
    label: "SAF & CORSIA",
    rooms: ["room-global", "room-eu", "room-us"],
    rationale:
      "CORSIA is ICAO's global aviation offsetting scheme. ReFuelEU Aviation is the EU SAF blending " +
      "mandate. The US carries its own SAF blender's-credit incentives (IRA §40B/45Z).",
  },
  {
    label: "CBAM & customs carbon",
    rooms: ["room-eu", "room-global"],
    rationale:
      "CBAM is an EU border mechanism, but it reaches every non-EU exporter of covered goods through " +
      "customs declarations — Global for the counterparties on the other side of the border, not only " +
      "the EU importers.",
  },
  {
    label: "ESG disclosure (CSRD/ISSB)",
    rooms: ["room-eu", "room-global", "room-uk", "room-apac"],
    rationale:
      "CSRD is EU. ISSB (IFRS S1/S2) is the global baseline several jurisdictions endorse directly — " +
      "the UK (UK Sustainability Reporting Standards) and multiple APAC regulators (e.g. Japan, " +
      "Singapore, Australia, Hong Kong) among them.",
  },
  {
    label: "Fleet & fuels technology",
    rooms: ["room-global", "room-eu", "room-us", "room-apac", "room-latam", "room-meaf"],
    rationale:
      "Cross-regional by nature (EV/hydrogen/biofuel technology, fleet renewal), with real regional " +
      "anchors worth surfacing on their own: Brazil's biofuel program (LATAM) and Gulf green-hydrogen " +
      "projects (MEAF) are not EU/US/APAC stories. UK omitted deliberately — its fleet-tech policy runs " +
      "close enough to the EU track that ETS & FuelEU Maritime and ESG disclosure already carry it here.",
  },
  {
    label: "Fine art & live-events logistics",
    rooms: ["room-global", "room-eu", "room-uk", "room-us"],
    rationale:
      "A specialty-handling vertical concentrated around the major art-market and touring-events hubs " +
      "(Basel/Paris/Brussels, London, New York/Miami), plus the inherently cross-border movement of " +
      "touring exhibitions and productions.",
  },
  {
    label: "Regional operating costs",
    rooms: [...CANONICAL_ROOM_SLUGS],
    rationale: "A comparative operating-cost topic is regional by definition — it spans every room the platform covers.",
  },
]);

/**
 * PURE — no DB, no I/O. Given the taxonomy and a slug->group_id map of rooms that ACTUALLY EXIST
 * (community_groups rows already seeded), plans exactly which (topic, room) links this run would
 * create, and separately NAMES any room slug a topic wants that isn't seeded yet. Never guesses,
 * never silently drops a mapping. Unit-tested directly in community-topics-seed.test.mjs — the
 * one piece of this script's logic that could misbehave (over-link, under-link, swallow a missing
 * room) without ever touching a real client.
 */
export function planTopicLinks(topics, roomIdBySlug) {
  return topics.map((t) => {
    const resolved = [];
    const missing = [];
    for (const slug of t.rooms) {
      const id = roomIdBySlug.get(slug);
      if (id) resolved.push({ slug, group_id: id });
      else missing.push(slug);
    }
    return { label: t.label, resolved, missing };
  });
}

async function resolveOwner() {
  // Mirrors seed-community-regional-rooms.mjs's resolveOwner exactly (see the schema-reality
  // comment above for why topics need an owner at all despite being conceptually per-user).
  const admins = await readAll("profiles", "id, is_platform_admin", {
    match: (q) => q.eq("is_platform_admin", true),
  });
  if (admins && admins.length) return admins[0].id;
  const anyProfile = await readClient().from("profiles").select("id").limit(1);
  if (anyProfile.data && anyProfile.data.length) return anyProfile.data[0].id;
  throw new Error("seed: no profiles found to own the topics. Onboard a user first.");
}

async function main() {
  console.log(`\ncommunity-topics-seed — ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const rooms = await readAll("community_groups", "id, slug");
  const roomIdBySlug = new Map((rooms || []).map((r) => [r.slug, r.id]));
  const missingRoomsOverall = CANONICAL_ROOM_SLUGS.filter((s) => !roomIdBySlug.has(s));
  if (missingRoomsOverall.length) {
    console.log(
      `NOTE: ${missingRoomsOverall.length}/7 canonical rooms not seeded yet ` +
      `(${missingRoomsOverall.join(", ")}) — run scripts/seed-community-regional-rooms.mjs --execute ` +
      `first for full coverage. Continuing with whatever already exists.\n`
    );
  }

  const ownerId = await resolveOwner();
  console.log(`owner_user_id (platform admin): ${ownerId}\n`);

  const existingTopics = await readAll("community_topics", "id, owner_user_id, label", {
    match: (q) => q.eq("owner_user_id", ownerId),
  });
  const topicIdByLabel = new Map((existingTopics || []).map((t) => [t.label, t.id]));

  const cite = {
    skill: "caros-ledge-platform-intent",
    reason: "S2 — seed the freight-sustainability topic taxonomy (7 topics) linked to the 7 canonical rooms",
  };

  const plan = planTopicLinks(TOPICS, roomIdBySlug);

  let topicsCreated = 0;
  let linksCreated = 0;

  for (const t of plan) {
    let topicId = topicIdByLabel.get(t.label);
    if (topicId) {
      console.log(`skip topic  "${t.label}" — already exists for this owner (${topicId})`);
    } else if (!APPLY) {
      console.log(`would create topic  "${t.label}"`);
    } else {
      const res = await guardedInsert("community_topics", { owner_user_id: ownerId, label: t.label }, { cite });
      topicId = res.inserted.id;
      topicIdByLabel.set(t.label, topicId);
      topicsCreated += 1;
      console.log(`created topic  "${t.label}" -> ${topicId}  (snapshot ${res.snapshot})`);
    }

    if (t.missing.length) {
      console.log(`  note: room(s) not yet seeded, skipped: ${t.missing.join(", ")}`);
    }

    // Existing links for this topic — only meaningful once the topic actually has an id (a
    // dry-run against a not-yet-created topic has nothing to read, and nothing to skip).
    const existingLinks = topicId
      ? await readAll("community_topic_groups", "topic_id, group_id", {
          match: (q) => q.eq("topic_id", topicId),
          orderBy: "group_id", // community_topic_groups has NO `id` column (composite PK only)
        })
      : [];
    const linkedGroupIds = new Set((existingLinks || []).map((l) => l.group_id));

    for (const link of t.resolved) {
      if (linkedGroupIds.has(link.group_id)) {
        console.log(`  skip link   ${t.label} -> ${link.slug} — already linked`);
        continue;
      }
      if (!APPLY || !topicId) {
        console.log(`  would link  ${t.label} -> ${link.slug}`);
        continue;
      }
      await guardedInsert(
        "community_topic_groups",
        { topic_id: topicId, group_id: link.group_id },
        { cite, select: "topic_id, group_id" }
      );
      linksCreated += 1;
      console.log(`  linked      ${t.label} -> ${link.slug}`);
    }
  }

  console.log(
    `\n${APPLY ? `done — ${topicsCreated} topic(s) created, ${linksCreated} link(s) created` : "dry-run complete — pass --apply to write"}\n`
  );
}

// Guarded entrypoint: main() runs ONLY when this file is executed directly (the CLI use case),
// never on import — community-topics-seed.test.mjs imports TOPICS/CANONICAL_ROOM_SLUGS/
// planTopicLinks with zero DB side effects.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
