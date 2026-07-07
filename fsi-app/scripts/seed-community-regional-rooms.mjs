/**
 * seed-community-regional-rooms.mjs
 *
 * Template 11 (Community) — seed the 7 canonical regional ROOMS as one public
 * community_groups row per region (community-schema-mapping.md §1/§3.5). The
 * mock's "room" is a fixed regional space; we realize it as a canonical public
 * community_groups row so the whole conversation layer (posts, members, join)
 * is reused verbatim — no parallel rooms/threads schema, no mig-007 table.
 *
 * STATUS: COMMITTED, NOT EXECUTED. The main session runs it. Until then the
 * rooms grid renders honest-empty (no canonical room groups exist yet).
 *
 * SAFETY:
 *   - DRY-RUN by default. Pass --execute to actually write.
 *   - Every write goes through the guarded db.mjs helpers (cite + snapshot +
 *     service-role). Idempotent: a room whose slug already exists is skipped.
 *   - Reads only otherwise. No spend, no fetch, no mint. Honors the scrape hold
 *     (this script does not scrape).
 *
 * RUN (main session, after loading env):
 *   node scripts/seed-community-regional-rooms.mjs            # dry-run preview
 *   node scripts/seed-community-regional-rooms.mjs --execute  # write 7 rooms
 *
 * Region-vocabulary note: the community_groups.region CHECK (migration 028) is
 * (EU, UK, US, LATAM, APAC, HK, MEA, GLOBAL). The mock's 7 rooms fold HK into
 * APAC and label MEA as "MEAF". That reconciliation is presentation-layer only
 * (see src/lib/community/rooms.ts); the seeded group.region uses the schema
 * codes below, and the canonical SLUG is what the app keys the room on.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedInsert, readClient } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(ROOT, ".env.local"));
} catch {
  // env may already be loaded by the caller; guardedInsert will throw if not.
}

const EXECUTE = process.argv.includes("--execute");

// The 7 canonical rooms. `slug` is the stable key the app queries on; keep it
// in lockstep with CANONICAL_ROOM_SLUGS in src/lib/community/rooms.ts.
const ROOMS = [
  { slug: "room-global", region: "GLOBAL", name: "Global room",
    description: "Cross-border corridors, reporting and emissions instruments (IMO, ICAO, WTO). Regional presence for members without a single home jurisdiction." },
  { slug: "room-eu", region: "EU", name: "EU room",
    description: "The deepest regulatory stack on the platform — emissions, reporting and digital." },
  { slug: "room-us", region: "US", name: "United States room",
    description: "Federal and state-level transport, emissions and reporting activity." },
  { slug: "room-uk", region: "UK", name: "United Kingdom room",
    description: "GB transport, reporting and fuels." },
  { slug: "room-apac", region: "APAC", name: "Asia–Pacific room",
    description: "Infrastructure, corridors and fuels across the Asia–Pacific jurisdictions (includes Hong Kong)." },
  { slug: "room-latam", region: "LATAM", name: "Latin America room",
    description: "Transport, fuels and infrastructure across Latin America." },
  { slug: "room-meaf", region: "MEA", name: "Middle East & Africa room",
    description: "Fuels and emissions across the Middle East and Africa." },
];

async function resolveOwner() {
  // Rooms are platform-owned canonical spaces. Owner = first platform admin.
  const admins = await readAll("profiles", "id, is_platform_admin", {
    match: (q) => q.eq("is_platform_admin", true),
  });
  if (admins && admins.length) return admins[0].id;
  // Fallback: any profile (the seed still needs a NOT NULL owner_user_id).
  const anyProfile = await readClient().from("profiles").select("id").limit(1);
  if (anyProfile.data && anyProfile.data.length) return anyProfile.data[0].id;
  throw new Error("seed: no profiles found to own the rooms. Onboard a user first.");
}

async function main() {
  console.log(`\nseed-community-regional-rooms — ${EXECUTE ? "EXECUTE" : "DRY-RUN"}\n`);

  const existing = await readAll("community_groups", "id, slug, region");
  const bySlug = new Map((existing || []).map((g) => [g.slug, g]));

  const ownerId = await resolveOwner();
  console.log(`owner_user_id (platform admin): ${ownerId}\n`);

  const cite = {
    skill: "caros-ledge-platform-intent",
    reason: "T11 Community — seed 7 canonical regional rooms (one public community_groups row per region)",
  };

  let created = 0;
  for (const room of ROOMS) {
    if (bySlug.has(room.slug)) {
      console.log(`skip  ${room.slug} — already exists (${bySlug.get(room.slug).id})`);
      continue;
    }
    const row = {
      name: room.name,
      slug: room.slug,
      region: room.region,
      privacy: "public",
      owner_user_id: ownerId,
      description: room.description,
    };
    if (!EXECUTE) {
      console.log(`would create  ${room.slug}  region=${room.region}  "${room.name}"`);
      continue;
    }
    const res = await guardedInsert("community_groups", row, { cite });
    console.log(`created  ${room.slug} -> ${res.inserted.id}  (snapshot ${res.snapshot})`);
    created += 1;
  }

  console.log(
    `\n${EXECUTE ? `done — ${created} room(s) created` : "dry-run complete — pass --execute to write"}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
