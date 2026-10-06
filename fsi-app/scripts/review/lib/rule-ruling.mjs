// rule-ruling.mjs - builds a queue's ruling from its own deterministic recommend rule, with no human in
// the path (lane G6-GATES, 2026-10-05; operator ruling: nothing in the data machine waits on a ruling
// file). Pure, no DB. The shape it returns is exactly the ruling file shape ruling.mjs validates and
// apply-core.mjs applies, so the rule path and a committed ruling file (the lane-verdict path) share one
// apply mechanism and one validator.
//
// A group whose recommended decision is in the queue's vocabulary is decided by that rule. A group the
// rule cannot decide ("uncertain", or a value outside the vocabulary) is RESIDUE: it is given the
// queue's declared residue decision (a no-mutation decision, "skip" or "link") and a reason naming who
// owns it next, and it is counted. Residue never blocks and never writes a guess.

/**
 * @param {{
 *   module: {QUEUE_ID:string, ALLOWED_DECISIONS:string[], ruleRationale?:(group:object, decision:string)=>string},
 *   groups: Array<{key:string, count:number, row_ids:string[], recommended_decision:string, [k:string]:any}>,
 *   generatedAt: string,
 *   residue: {decision:string, reason:string|((group:object)=>string)},
 * }} args
 * @returns {{ruling:object, tally:{decisions:Record<string,{groups:number,rows:number}>, residue:Record<string,{groups:number,rows:number}>}}}
 */
export function buildRuleRuling({ module: m, groups, generatedAt, residue }) {
  const decisions = {};
  const residueCounts = {};
  const bump = (bucket, key, rows) => {
    bucket[key] ??= { groups: 0, rows: 0 };
    bucket[key].groups += 1;
    bucket[key].rows += rows;
  };

  const ruled = groups.map((g) => {
    const rec = g.recommended_decision;
    const decidable = m.ALLOWED_DECISIONS.includes(rec) && rec !== "skip";
    const decision = decidable ? rec : residue.decision;
    bump(decisions, decision, g.count);
    if (!decidable) {
      const reason = typeof residue.reason === "function" ? residue.reason(g) : residue.reason;
      bump(residueCounts, reason, g.count);
      return { ...g, decision, rationale: `rule residue (${reason}): recommended "${rec}" is not a rule decision` };
    }
    return { ...g, decision, rationale: m.ruleRationale ? m.ruleRationale(g, decision) : `rule: ${m.QUEUE_ID} recommend function decided "${decision}"` };
  });

  return {
    ruling: { queue: m.QUEUE_ID, generated_at: generatedAt, groups: ruled },
    tally: { decisions, residue: residueCounts },
  };
}
