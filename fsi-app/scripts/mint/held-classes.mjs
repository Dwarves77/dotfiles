#!/usr/bin/env node
// held-classes.mjs — the per-held-class dossier builder (Lane HELD, docs/plans/wave2-lanes-2026-09-02.md).
//
// WHY: every population run holds ~16-20% of its slice in the same three classes
// (`identity_unmapped_source`, `canonical_key_unresolved`, `item_type_unmapped` —
// scripts/_snapshots/population-{33659080799,33666187388,33678399902}/census-rows.held.json). Reading a
// held-rows array once and asking "why" required a human to eyeball a flat JSON array of ~50-1300 rows
// and mentally re-group it. This module IS that regrouping: `reason` (the mint export's own hold class)
// then, within each reason, the CONCRETE missing thing that caused it (a host, an FR type, a CELEX
// sector/letter, a key-derivation shape) — counts, capped examples, and, for a group this lane's own
// root-cause pass could not close, a plain-language ruling recommendation. This lane's OWN fix (see
// export-census-rows.mjs's 2026-09-02 UPDATE block) closes most of what this dossier would have shown
// against mint-run-012..014's held files; this module stays as the standing tool a future run's held file
// gets read through, so the next drift gets the same "root cause before change" treatment, not another
// flat-array eyeball pass.
//
// Pure — no I/O in the grouping/classification functions; only `main()` (the CLI) touches the filesystem,
// via plain `readFileSync`, no DB, no network, $0.

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

// ── classification (pure) ───────────────────────────────────────────────────────────────────────────

/** The "concrete missing thing" for a canonical_key_unresolved row: what about its identifier/URL kept
 *  deriveKey() (scripts/lib/canonical-key.mjs) from resolving a key at all. Pure. Every branch here is a
 *  SHAPE deriveKey's own regex does not recognize — never a guess at what the key WOULD be. */
export function keyShapeOf(row) {
  const id = String(row?.instrument_identifier ?? "");
  const url = String(row?.document_url ?? "");
  if (/^E\d{4}[A-Z]\d{4}/i.test(id)) return "efta_e_prefixed";
  if (/uri=OJ:/i.test(url)) return "oj_citation";
  if (id) return "identifier_present_no_celex_or_eli_shape";
  return "no_identifier_on_row";
}

/** The "concrete missing thing" that caused ONE held row's `reason`, as a single `"<kind>:<value>"`
 *  string — the dossier's grouping key within a reason bucket. Pure; never invents a value not already
 *  on the row (a row missing the field the reason implies groups under an explicit `(unknown)`/`(none)`
 *  sentinel, never silently dropped from the count). */
export function classifyMissing(row) {
  const reason = row?.reason ?? null;
  if (reason === "identity_unmapped_source") {
    return `host:${row?.host ?? "(unknown)"}`;
  }
  if (reason === "institution_category_unmapped") {
    return `category:${row?.category ?? "(none)"}`;
  }
  if (reason === "item_type_unmapped") {
    if (row?.fr_type) return `fr_type:${row.fr_type}`;
    if (row?.scheme === "celex" && typeof row?.canonical_instrument_key === "string" && row.canonical_instrument_key.length >= 6) {
      const sector = row.canonical_instrument_key.charAt(0);
      const letter = row.canonical_instrument_key.charAt(5);
      return `celex_sector_letter:${sector}${letter}`;
    }
    return `scheme:${row?.scheme ?? row?.host ?? "(unknown)"}`;
  }
  if (reason === "canonical_key_unresolved") {
    return `key_shape:${keyShapeOf(row)}`;
  }
  return `reason:${reason ?? "(no reason on row)"}`;
}

/** Plain-language ruling recommendation for one (reason, missingKey) group. Pure — a lookup/format
 *  function, never a live judgment call; every branch names WHY a ruling is needed and what the ruling
 *  would decide, per this lane's "for anything that cannot be mapped without a ruling, the dossier says
 *  so" charter. A group this text does not specifically name still gets the generic fallback — never
 *  silently un-recommended. */
export function recommendationFor(reason, missingKey) {
  const [kind, ...rest] = String(missingKey ?? "").split(":");
  const value = rest.join(":");

  if (reason === "identity_unmapped_source") {
    return (
      `Host "${value}" does not institution-match its own row's registered source (scripts/lib/` +
      `institution-key.mjs's sameInstitution) — either the census row's source_id is mis-joined, the ` +
      `document is off-institution (a redirect, a third-party mirror), or the source genuinely is not yet ` +
      `registered under this host. Needs an operator ruling: register the source (or fix the join), or ` +
      `confirm this row should stay held.`
    );
  }
  if (reason === "institution_category_unmapped") {
    if (value === "(none)") {
      return (
        `The registry already has this institution (institutionKey matched its own row's source), but ` +
        `sources.category is unset. Needs an operator ruling: assign a category (regulatory / research / ` +
        `market_news / operational_data — migration 084's taxonomy) at the registry level.`
      );
    }
    return (
      `The registry already has this institution, but its category ("${value}") is not "regulatory", so ` +
      `this lane's item_type default (regulation) does not apply. Needs an operator ruling: does this ` +
      `institution's document stream belong on the platform at all, and if so, which item_type family — ` +
      `a category-to-item_type default this lane's write set is not scoped to invent.`
    );
  }
  if (reason === "canonical_key_unresolved") {
    if (kind === "key_shape" && value === "efta_e_prefixed") {
      return (
        `EFTA/EEA "E"-prefixed CELEX numbers (e.g. E2012C0522) are a real, different numbering scheme ` +
        `scripts/lib/canonical-key.mjs's deriveKey() does not parse (it is out of this lane's write set — ` +
        `named here for the record). Needs an operator ruling: extend deriveKey for the E-prefix shape, or ` +
        `accept these rows stay held until it is.`
      );
    }
    if (kind === "key_shape" && value === "oj_citation") {
      return (
        `An "OJ:L_YYYYNNNNN" Official Journal citation (an issue/page number) does not encode the act's ` +
        `CELEX sector letter the way a CELEX id does — there is no URL-only derivation, only a capture-time ` +
        `lookup (Cellar/EUR-Lex metadata) or an OJ->CELEX resolver service. Needs an operator ruling: add a ` +
        `capture-time resolution step for this shape, or accept these rows stay held.`
      );
    }
    return (
      `No CELEX or ELI pattern was found in the instrument_identifier or document_url at all (shape: ` +
      `"${value}"). Needs an operator ruling on this source's citation shape before a key can be derived.`
    );
  }
  if (reason === "item_type_unmapped") {
    if (kind === "fr_type") {
      return (
        `federalregister.gov document type "${value}" has NO evidence in this repo's held-row history ` +
        `(scripts/_snapshots/population-*/census-rows.held.json) as of this dossier — this lane maps only ` +
        `evidenced FR types (see item-type-required-slots.json's _federal_register_type_map). Needs an ` +
        `operator ruling once evidence exists: is it legitimately in vertical, and if so which item_type.`
      );
    }
    if (kind === "celex_sector_letter") {
      return (
        `CELEX sector/letter "${value}" resolved a real key but has no item_type home in export-census-` +
        `rows.mjs's CELEX_SECTOR_LETTER_MAP. Needs an operator ruling on the semantic item_type for this ` +
        `sector/letter combination — this lane mapped only the four sector-2/4 keys it had live evidence ` +
        `for (22004A0806(01), 21998A0912(01), 22023D2729, 42012D0708).`
      );
    }
    return `Needs an operator ruling on the item_type for scheme/host "${value}".`;
  }
  return `Needs an operator ruling (unrecognized hold reason "${reason}").`;
}

// ── grouping (pure) ─────────────────────────────────────────────────────────────────────────────────

/** Merge held-rows arrays from multiple runs (oldest first) into one array, deduped by row_id (falling
 *  back to document_url when a row carries no id), each entry carrying `seen_in_runs`: every runId this
 *  row was still held in, in order. A row held across every run in the input is the strongest signal this
 *  dossier can show that a class is systemic, not a one-off — `seen_in_runs.length` surfaces that directly
 *  instead of the reader having to diff files by hand. Pure. Later runs' field values win on conflict
 *  (the most recent read of the row is the most accurate one). */
export function mergeHeldRows(runs) {
  const byKey = new Map();
  for (const { runId, rows } of runs ?? []) {
    for (const row of rows ?? []) {
      const key = row?.row_id ?? row?.document_url ?? JSON.stringify(row);
      const prior = byKey.get(key);
      if (!prior) {
        byKey.set(key, { ...row, seen_in_runs: [runId] });
      } else {
        byKey.set(key, { ...prior, ...row, seen_in_runs: [...prior.seen_in_runs, runId] });
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Group a (already deduped, or raw — the caller decides) held-rows array by `reason`, then by
 * `classifyMissing`'s bucket key. Pure.
 * @param {object[]} rows
 * @param {{exampleLimit?: number}} [opts]
 * @returns {{total: number, byReason: Object<string, {count:number, groups: Object<string, {count:number,
 *   recommendation: string, examples: object[]}>}>}}
 */
export function buildDossier(rows, { exampleLimit = 3 } = {}) {
  const byReason = {};
  for (const row of rows ?? []) {
    const reason = row?.reason ?? "(no reason)";
    const missingKey = classifyMissing(row);
    byReason[reason] ??= { count: 0, groups: {} };
    byReason[reason].count += 1;
    const bucket = (byReason[reason].groups[missingKey] ??= {
      count: 0,
      recommendation: recommendationFor(reason, missingKey),
      examples: [],
    });
    bucket.count += 1;
    if (bucket.examples.length < exampleLimit) {
      bucket.examples.push({
        row_id: row?.row_id ?? null,
        document_url: row?.document_url ?? null,
        host: row?.host ?? null,
        ...(row?.seen_in_runs ? { seen_in_runs: row.seen_in_runs } : {}),
      });
    }
  }
  return { total: (rows ?? []).length, byReason };
}

/** Every group across the whole dossier whose reason/missingKey this lane could NOT close automatically —
 *  i.e. every group `buildDossier` produced, since a group that closes shows up as a DIFFERENT reason (or
 *  disappears) on the NEXT run's held file, not in this one. Flattened, sorted by count descending, so
 *  the highest-volume open question reads first — the shape a reader actually wants from "for anything
 *  that cannot be mapped without a ruling, the dossier says so." Pure. */
export function flattenRecommendations(dossier) {
  const out = [];
  for (const [reason, { groups }] of Object.entries(dossier?.byReason ?? {})) {
    for (const [missingKey, group] of Object.entries(groups)) {
      out.push({ reason, missing: missingKey, count: group.count, recommendation: group.recommendation });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

// ── formatting (pure) ───────────────────────────────────────────────────────────────────────────────

/** Render a dossier as plain text for a terminal/report — one block per reason, one line per group,
 *  counts first (a reader scans for volume before detail), examples indented under each group. Pure. */
export function formatDossier(dossier) {
  const lines = [`held-classes dossier: ${dossier.total} held row(s) across ${Object.keys(dossier.byReason).length} reason(s)`];
  const reasons = Object.entries(dossier.byReason).sort((a, b) => b[1].count - a[1].count);
  for (const [reason, { count, groups }] of reasons) {
    lines.push("", `## ${reason} (${count})`);
    const sortedGroups = Object.entries(groups).sort((a, b) => b[1].count - a[1].count);
    for (const [missingKey, group] of sortedGroups) {
      lines.push(`  - ${missingKey}: ${group.count}`);
      lines.push(`      recommendation: ${group.recommendation}`);
      for (const ex of group.examples) {
        lines.push(`      e.g. ${ex.row_id ?? "(no id)"} — ${ex.document_url ?? "(no url)"}`);
      }
    }
  }
  return lines.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────

function usage() {
  return [
    "Usage: node scripts/mint/held-classes.mjs --file path/to/census-rows.held.json [--file ...]",
    "         [--out path/to/dossier.json]",
    "Reads one or more census-rows.held.json files (each --file may repeat), merges them (deduped by",
    "row_id, tracking which run(s) each row was still held in), and prints the grouped dossier. --out",
    "additionally writes the full grouped JSON to that path.",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      file: { type: "string", multiple: true, default: [] },
      out: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help || values.file.length === 0) {
    console.log(usage());
    if (values.file.length === 0) process.exitCode = values.help ? 0 : 1;
    return;
  }

  const runs = values.file.map((path) => ({
    runId: path,
    rows: JSON.parse(readFileSync(path, "utf8")),
  }));
  const merged = mergeHeldRows(runs);
  const dossier = buildDossier(merged);

  console.log(formatDossier(dossier));

  if (values.out) {
    writeFileSync(values.out, JSON.stringify({ ...dossier, recommendations: flattenRecommendations(dossier) }, null, 2) + "\n", "utf8");
    console.log(`\nWrote ${values.out}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("held-classes: fatal:", e);
    process.exit(1);
  });
}
