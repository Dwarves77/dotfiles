/**
 * Community Template 11 — canonical regional ROOM vocabulary + the
 * jurisdiction→room classifier.
 *
 * The mock's unit is a fixed regional room (7 rooms). We realize each as ONE
 * canonical public `community_groups` row keyed by a stable slug (seeded by
 * scripts/seed-community-regional-rooms.mjs — keep CANONICAL_ROOM_SLUGS in
 * lockstep with that script). Region-vocabulary reconciliation (schema HK/MEA
 * vs mock APAC/MEAF) lives HERE, at the presentation layer — no migration.
 *
 * The classifier reuses the Map surface's region vocabulary
 * (REGION_CHIP_TO_JURS in MapPageView) so the two surfaces agree on which
 * jurisdictions fall in which region.
 */

export type RoomKey = "GLOBAL" | "EU" | "US" | "UK" | "APAC" | "LATAM" | "MEAF";

export interface RoomDef {
  /** Presentation key (mock vocabulary — folds HK→APAC, labels MEA as MEAF). */
  key: RoomKey;
  /** Stable slug of the seeded canonical `community_groups` row. */
  slug: string;
  /** Schema `community_groups.region` code (CHECK: EU/UK/US/LATAM/APAC/HK/MEA/GLOBAL). */
  regionCode: string;
  /** Full room name for the header. */
  name: string;
  /** Short label for chips/eyebrows. */
  short: string;
  /**
   * Lowercase jurisdiction tokens that count as "in" this room. Matches
   * Resource.jurisdiction slugs, ISO-2 codes, and jurisdiction_overrides
   * entries (all compared lowercased; ISO subdivisions like "us-ca" match on
   * their prefix). GLOBAL is the fallback for supranational/unmatched.
   */
  jurisdictions: readonly string[];
}

export const ROOMS: readonly RoomDef[] = [
  {
    key: "GLOBAL", slug: "room-global", regionCode: "GLOBAL", name: "Global room", short: "Global",
    jurisdictions: ["global", "international", "imo", "icao", "wto", "un", "worldwide"],
  },
  {
    key: "EU", slug: "room-eu", regionCode: "EU", name: "EU room", short: "EU",
    jurisdictions: [
      "eu", "europe", "european-union",
      "germany", "de", "france", "fr", "netherlands", "nl", "belgium", "be",
      "italy", "it", "spain", "es", "poland", "pl", "ireland", "ie", "greece", "gr",
      "portugal", "pt", "romania", "ro", "sweden", "se", "denmark", "dk", "finland", "fi",
      "austria", "at", "nordic",
    ],
  },
  {
    key: "US", slug: "room-us", regionCode: "US", name: "United States room", short: "US",
    jurisdictions: ["us", "usa", "united-states"],
  },
  {
    key: "UK", slug: "room-uk", regionCode: "UK", name: "United Kingdom room", short: "UK",
    jurisdictions: ["uk", "gb", "united-kingdom", "britain", "england"],
  },
  {
    key: "APAC", slug: "room-apac", regionCode: "APAC", name: "Asia–Pacific room", short: "APAC",
    jurisdictions: [
      "apac", "asia", "asia-pacific", "asean",
      "china", "cn", "japan", "jp", "korea", "kr", "india", "in", "hk", "hong-kong",
      "singapore", "sg", "australia", "au", "pacific", "taiwan", "tw",
      "bangladesh", "bd", "pakistan", "pk", "sri-lanka", "indonesia", "id",
      "vietnam", "vn", "thailand", "th", "malaysia", "my", "philippines", "ph",
      "new-zealand", "nz",
    ],
  },
  {
    key: "LATAM", slug: "room-latam", regionCode: "LATAM", name: "Latin America room", short: "LATAM",
    jurisdictions: [
      "latam", "latin-america", "brazil", "br", "caribbean", "mexico", "mx",
      "argentina", "ar", "chile", "cl", "colombia", "co", "peru", "pe", "central-america",
    ],
  },
  {
    key: "MEAF", slug: "room-meaf", regionCode: "MEA", name: "Middle East & Africa room", short: "MEAF",
    jurisdictions: [
      "meaf", "mea", "gcc", "uae", "ae", "saudi", "saudi-arabia", "sa",
      "qatar", "qa", "kuwait", "kw", "israel", "il", "turkey", "tr", "egypt", "eg",
      "safrica", "south-africa", "za", "wafrica", "eafrica", "nafrica", "africa",
    ],
  },
];

export const CANONICAL_ROOM_SLUGS: readonly string[] = ROOMS.map((r) => r.slug);

export const ROOM_ORDER: readonly RoomKey[] = ROOMS.map((r) => r.key);

const ROOM_BY_KEY: Record<RoomKey, RoomDef> = ROOMS.reduce(
  (acc, r) => ({ ...acc, [r.key]: r }),
  {} as Record<RoomKey, RoomDef>
);

export function roomByKey(key: RoomKey): RoomDef {
  return ROOM_BY_KEY[key];
}

/** Normalize a raw jurisdiction token: lowercase, trim, drop ISO subdivision. */
function normJur(raw: string): string {
  const lower = (raw || "").toLowerCase().trim();
  const dash = lower.indexOf("-");
  // "us-ca" -> "us" but keep multi-word slugs like "sri-lanka"/"united-states".
  if (dash > 0 && dash <= 2) return lower.slice(0, dash);
  return lower;
}

/**
 * Classify a single jurisdiction token to a room. Returns null when it matches
 * no region (caller decides whether to fold into GLOBAL). Checks the exact
 * lowercased token first, then the ISO-subdivision prefix.
 */
export function roomForJurisdiction(jur: string | null | undefined): RoomKey | null {
  if (!jur) return null;
  const lower = (jur || "").toLowerCase().trim();
  const norm = normJur(jur);
  for (const room of ROOMS) {
    if (room.jurisdictions.includes(lower) || room.jurisdictions.includes(norm)) {
      return room.key;
    }
  }
  return null;
}

/** True when any of the user's home jurisdictions falls in the room. */
export function homeJurisdictionsInRoom(
  overrides: readonly string[] | null | undefined,
  key: RoomKey
): boolean {
  if (!overrides || overrides.length === 0) return false;
  return overrides.some((j) => roomForJurisdiction(j) === key);
}
