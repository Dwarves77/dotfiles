// regen-quarantined.mjs — MAINT dispatch step for scripts/regen-quarantined.mjs (lane ONESHOTS,
// 2026-09-06, F25 expiry-52 disposition). .discipline/governance/invariants.mjs names this file the
// live resolver an ENFORCED invariant ("Quarantine is an open investigation, never terminal") depends
// on — it had no dispatch root anywhere (hand-run only). This wrapper is that first runtime.
//
// UPSTREAM: ALL THE DECISION LOOP LIVES IN scripts/regen-quarantined.mjs's exported
// `runResolver({ apply, limit, only }, deps)`, called UNMODIFIED here — nothing reimplemented (deps
// wired from ../lib/db.mjs + the same verify-item/snapshot-store/freshness-probe/cheap-verify modules
// the CLI uses). This resolver moves $0 in both modes (cheap-verify + a $0 RPC under apply) — never a
// paid re-ground (that stays the separately-gated Phase-3 path; see the target script's own header).
//
// `arg`, if given, is passed through as `--only=<arg>` (a comma-separated legacy_id/id-prefix scope) —
// the same optional narrowing the CLI already exposes. Omit it to run the full eligible set.
//
// USAGE (by hand, needs DB creds):
//   node scripts/maintenance/regen-quarantined.mjs --mode dry
//   node scripts/maintenance/regen-quarantined.mjs --mode apply --arg it-042,it-043
// Normally dispatched via .github/workflows/maintenance.yml (step=regen-quarantined).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";
import { runResolver } from "../regen-quarantined.mjs";
import { getSnapshot } from "../../src/lib/sources/snapshot-store.mjs";
import { probeFreshness } from "../../src/lib/sources/freshness-probe.mjs";
import { cheapVerifyClaims } from "../../src/lib/sources/cheap-verify.mjs";
import { verifyItem } from "../../src/lib/sources/verify-item.mjs";

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{ sb: object, readAll: Function, verifyItem?: Function, getSnapshot?: Function,
 *   probeFreshness?: Function, cheapVerifyClaims?: Function }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const only = String(arg || "").trim() ? arg.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const summary = { step: "regen-quarantined", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const r = await runResolver({ apply, only }, {
    sb: deps.sb, readAll: deps.readAll,
    verifyItem: deps.verifyItem ?? verifyItem, getSnapshot: deps.getSnapshot ?? getSnapshot,
    probeFreshness: deps.probeFreshness ?? probeFreshness, cheapVerifyClaims: deps.cheapVerifyClaims ?? cheapVerifyClaims,
  });
  summary.counts = { quarantined: r.quarantined, held_q2_gate: r.held, eligible: r.eligible, decided: r.n,
    cheap_ok_still_quarantined: r.cheapStill, stale_snapshot: r.stale, needs_acquire_locked: r.needsAcq, errors: r.fail };
  summary.applied = r.flipped; // items actually flipped to verified this run
  summary.read_back = { flipped_to_verified: r.flipped };
  if (r.fail) summary.note = `${r.fail} item(s) errored during decide — see counts.errors and this run's log.`;
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "regen-quarantined",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readClient, readAll } = await import("../lib/db.mjs");
      return { sb: readClient(), readAll };
    },
  });
}
