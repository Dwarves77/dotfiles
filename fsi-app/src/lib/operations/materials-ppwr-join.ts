/**
 * materials-ppwr-join.ts, spec 04 S6 #9: the materials supply <-> PPWR compliance join. Lane L14,
 * 2026-10-03. PURE and read-only: no DB, no network, no LLM. It takes the `materials_sourcing` rows
 * `fetchOperationsCoverage` (supabase-server.ts) ALREADY selects from `regional_data_facts` (same
 * camelCase shape the region grid carries), so there is no second query to drift from the first.
 *
 * WHAT IT JOINS. Recyclate availability by material by region (a materials_sourcing fact) is placed
 * directly against the PPWR minimum recycled-content percentage for that material class and year,
 * one joined read per region + material, never two unrelated lists (spec 04 S10 gap row).
 *
 * THE NUMBERS. Read directly from the text of Regulation (EU) 2025/40 via EUR-Lex
 * (CELEX:32025R0040) on 2026-10-03, Article 7:
 *   Art. 7(1), by 1 January 2030 or 3 years after the Art. 7(8) implementing act, whichever is later:
 *     (a) 30 % contact-sensitive packaging, PET as major component, except single-use beverage bottles
 *     (b) 10 % contact-sensitive packaging, plastics other than PET, except single-use beverage bottles
 *     (c) 30 % single-use plastic beverage bottles
 *     (d) 35 % plastic packaging other than (a), (b), (c)
 *   Art. 7(2), by 1 January 2040: (a) 50 %, (b) 25 %, (c) 65 %, (d) 65 % (same lettering).
 *   Art. 7 applies to PLASTIC packaging only; Art. 7(15) only requires a Commission review by
 *   12 February 2032 of recycled-content targets for other materials. So a non-plastic material gets an
 *   explicit "no PPWR recycled-content threshold" state, never an invented number.
 *   Art. 7(4), 7(5): exemptions. Art. 7(12), 7(13): the Commission may derogate or adjust the
 *   percentages by delegated act. Both ride on every threshold read as a caveat.
 *
 * NO LABEL PARSING (coordinator ruling 8, 2026-10-03). `regional_data_facts` has no structured material
 * field and no materials_sourcing producer exists (git grep, 2026-10-03), so this module never reads
 * a material out of a fact label. The CALLER supplies `materialKey` from the closed union below, and
 * a fact without one is ignored. Until a producer and a structured material key exist, every row the
 * mounted panel shows is a threshold-only gap row, which is the honest state.
 *
 * Not a score: nothing here produces a number that is added to anything. Availability is the fact's
 * own words (or its own value + unit), carried verbatim.
 */

export type PpwrPackagingType =
  | "contact_sensitive_pet"
  | "contact_sensitive_non_pet"
  | "single_use_beverage_bottle"
  | "other_plastic";

export interface PpwrRecycledContentThreshold {
  packagingType: PpwrPackagingType;
  packagingLabel: string;
  /** Percent, Art. 7(1), from 1 Jan 2030 (or 3 years after the Art. 7(8) implementing act). */
  pct2030: number;
  /** Percent, Art. 7(2), from 1 Jan 2040. */
  pct2040: number;
  citation2030: string;
  citation2040: string;
}

export const PPWR_REGULATION = "Regulation (EU) 2025/40";

export const PPWR_RECYCLED_CONTENT: Readonly<Record<PpwrPackagingType, PpwrRecycledContentThreshold>> = {
  contact_sensitive_pet: {
    packagingType: "contact_sensitive_pet",
    packagingLabel: "contact-sensitive PET packaging (not single-use beverage bottles)",
    pct2030: 30,
    pct2040: 50,
    citation2030: "Art. 7(1)(a)",
    citation2040: "Art. 7(2)(a)",
  },
  contact_sensitive_non_pet: {
    packagingType: "contact_sensitive_non_pet",
    packagingLabel: "contact-sensitive non-PET plastic packaging (not single-use beverage bottles)",
    pct2030: 10,
    pct2040: 25,
    citation2030: "Art. 7(1)(b)",
    citation2040: "Art. 7(2)(b)",
  },
  single_use_beverage_bottle: {
    packagingType: "single_use_beverage_bottle",
    packagingLabel: "single-use plastic beverage bottles",
    pct2030: 30,
    pct2040: 65,
    citation2030: "Art. 7(1)(c)",
    citation2040: "Art. 7(2)(c)",
  },
  other_plastic: {
    packagingType: "other_plastic",
    packagingLabel: "other plastic packaging",
    pct2030: 35,
    pct2040: 65,
    citation2030: "Art. 7(1)(d)",
    citation2040: "Art. 7(2)(d)",
  },
};

export const PPWR_CAVEAT =
  "Exemptions apply (Art. 7(4), 7(5)) and the Commission may derogate or adjust the percentages (Art. 7(12), 7(13)).";

export type MaterialKey = PpwrPackagingType | "non_plastic";

/** Every plastic category Art. 7 sets a percentage for, in the Regulation's own order (a) to (d). */
export const PPWR_PLASTIC_MATERIAL_KEYS: readonly PpwrPackagingType[] = [
  "contact_sensitive_pet",
  "contact_sensitive_non_pet",
  "single_use_beverage_bottle",
  "other_plastic",
];

/** The slice of an OperationsFact (region-grid camelCase) this join reads, plus the caller-supplied
 *  `materialKey`. A fact with no materialKey cannot be joined and is ignored. */
export interface MaterialsFactLike {
  regionKey: string;
  dimension: string;
  materialKey?: MaterialKey | null;
  factLabel?: string | null;
  value?: string | null;
  valueNumeric?: number | null;
  unit?: string | null;
  referencePeriod?: string | null;
  sourceKey?: string | null;
}

/** joined: fact and threshold both present. threshold_only: no availability fact (explicit gap).
 *  no_ppwr_threshold: a non-plastic material, which Art. 7 sets no recycled-content percentage for. */
export type JoinStatus = "joined" | "threshold_only" | "no_ppwr_threshold";

export interface MaterialsPpwrJoinRow {
  regionKey: string;
  materialKey: MaterialKey;
  status: JoinStatus;
  /** The availability fact's own words, verbatim; null when no materials fact exists for this cell. */
  availability: { text: string; factLabel: string; sourceKey: string | null; referencePeriod: string | null } | null;
  /** Null when the material has no PPWR recycled-content threshold (non-plastic). */
  threshold: PpwrRecycledContentThreshold | null;
  /** Caveat naming its articles, carried on every row that has a threshold. */
  caveat: string | null;
  /** One sentence carrying both sides, or the named gap. */
  sentence: string;
}

const NON_PLASTIC_LABEL = "recycled non-plastic material";

function materialLabel(k: MaterialKey): string {
  return k === "non_plastic" ? NON_PLASTIC_LABEL : `recycled ${PPWR_RECYCLED_CONTENT[k].packagingLabel}`;
}

function availabilityText(f: MaterialsFactLike): string | null {
  const v = (f.value ?? "").trim();
  if (v) return v;
  if (typeof f.valueNumeric === "number" && Number.isFinite(f.valueNumeric) && f.unit) {
    return `${f.valueNumeric} ${f.unit}`;
  }
  return null;
}

function thresholdClause(t: PpwrRecycledContentThreshold): string {
  return (
    `PPWR 2030 threshold: ${t.pct2030}% (${PPWR_REGULATION} ${t.citation2030}); ` +
    `2040: ${t.pct2040}% (${PPWR_REGULATION} ${t.citation2040}).`
  );
}

/**
 * Join materials availability facts against PPWR thresholds, one row per region + material.
 * `regionKeys` / `materials` name the cells to report, so a cell with no fact is an explicit gap rather
 * than silently missing; both default to what the facts name. Facts outside materials_sourcing, or with
 * no caller-supplied materialKey, or with no availability text, are ignored. A non-plastic cell with no
 * fact produces no row (no threshold and no fact: nothing to say).
 */
export function joinMaterialsToPpwr(
  facts: readonly MaterialsFactLike[],
  opts: { regionKeys?: readonly string[]; materials?: readonly MaterialKey[] } = {}
): MaterialsPpwrJoinRow[] {
  const byCell = new Map<string, MaterialsFactLike>();
  const regions = new Set<string>(opts.regionKeys ?? []);
  const materials = new Set<MaterialKey>(opts.materials ?? []);
  for (const f of facts) {
    if (f.dimension !== "materials_sourcing" || !f.materialKey || availabilityText(f) === null) continue;
    const key = `${f.regionKey}|${f.materialKey}`;
    if (!byCell.has(key)) byCell.set(key, f); // first fact wins; facts arrive newest-first
    regions.add(f.regionKey);
    materials.add(f.materialKey);
  }

  const order = (k: MaterialKey) => (k === "non_plastic" ? PPWR_PLASTIC_MATERIAL_KEYS.length : PPWR_PLASTIC_MATERIAL_KEYS.indexOf(k));
  const rows: MaterialsPpwrJoinRow[] = [];
  for (const regionKey of [...regions].sort()) {
    for (const materialKey of [...materials].sort((a, b) => order(a) - order(b))) {
      const f = byCell.get(`${regionKey}|${materialKey}`) ?? null;
      const threshold = materialKey === "non_plastic" ? null : PPWR_RECYCLED_CONTENT[materialKey];
      if (threshold === null && f === null) continue;
      const label = materialLabel(materialKey);
      const availability = f
        ? {
            text: availabilityText(f) as string,
            factLabel: f.factLabel ?? "",
            sourceKey: f.sourceKey ?? null,
            referencePeriod: f.referencePeriod ?? null,
          }
        : null;
      let status: JoinStatus;
      let sentence: string;
      if (threshold === null) {
        status = "no_ppwr_threshold";
        sentence =
          `${label} available: ${availability?.text}; no PPWR recycled-content threshold exists for ` +
          `non-plastic packaging (${PPWR_REGULATION} Art. 7 covers plastic only; Art. 7(15) review pending).`;
      } else if (availability) {
        status = "joined";
        sentence = `${label} available: ${availability.text}; ${thresholdClause(threshold)}`;
      } else {
        status = "threshold_only";
        sentence = `${label} available: no availability fact for this region (gap); ${thresholdClause(threshold)}`;
      }
      rows.push({ regionKey, materialKey, status, availability, threshold, caveat: threshold ? PPWR_CAVEAT : null, sentence });
    }
  }
  return rows;
}
