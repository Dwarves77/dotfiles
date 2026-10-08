// coverage-state.mjs: the copy and decisions behind the ONE coverage-state renderer (lane COV-1, 2026-10-08).
//
// Spec 00 section 4: six states of absence, six treatments, never one grey dash. The six codes live in
// src/lib/contracts/vocabularies.mjs (COVERAGE_STATE); the renderer is src/components/ui/CoverageState.tsx.
// This module is the pure middle: given a state and what the call site knows, it decides the words and the
// action. It is plain ESM with relative imports only, so `node --test` proves every treatment without a
// bundler, and so the component holds no copy of its own (a second wording of a state is a second state).
//
// HONESTY RULES, carried from the specs:
//   - a state the call site cannot name returns null from `describeCoverageState`, and the caller keeps its
//     existing render (fallback preserved where the state is unknown);
//   - nothing is guessed: no hidden count is stated unless the caller passes one, no last value or as-of
//     date unless the caller has it, no roadmap position unless one is recorded;
//   - the text uses no dash glyphs (discipline rule 022).

import { COVERAGE_STATE, SUPPRESSION_REASON } from "../contracts/vocabularies.mjs";

/** The kinds of action a treatment can carry. The component maps each to one control. */
export const COVERAGE_ACTION = Object.freeze({
  request: "request",
  widen: "widen",
  retry: "retry",
  status: "status",
});

/** True when `value` is one of the six state codes. */
export function isCoverageState(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(COVERAGE_STATE, value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function plural(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Describe one coverage state.
 *
 * @param {{
 *   state: string,
 *   subject: string,
 *   reason?: string | null,
 *   reasonClass?: string | null,
 *   roadmap?: string | null,
 *   requestRef?: string | null,
 *   lastValue?: string | null,
 *   asOf?: string | null,
 *   expectedRefresh?: string | null,
 *   hiddenCount?: number | null,
 *   noun?: string | null,
 *   canWiden?: boolean,
 *   canRetry?: boolean,
 *   statusHref?: string | null,
 * }} input
 * @returns {null | {
 *   code: string, label: string, treatment: string, role: "status" | "alert",
 *   suppress: boolean, headline: string, lines: string[],
 *   actions: Array<{ kind: string, label: string }>,
 * }}
 */
export function describeCoverageState(input) {
  if (!input || !isCoverageState(input.state)) return null;
  const subject = nonEmpty(input.subject) ?? "This value";
  const entry = COVERAGE_STATE[input.state];
  const base = { code: entry.code, label: entry.label, treatment: entry.treatment, role: "status", suppress: false };

  switch (input.state) {
    case "not_applicable":
      // Suppress the field, explain on hover. No actions: there is nothing to request or retry.
      return {
        ...base,
        suppress: true,
        headline: nonEmpty(input.reason) ?? `${subject} does not apply here.`,
        lines: [],
        actions: [],
      };

    case "not_covered": {
      const lines = [];
      const reason = nonEmpty(input.reason);
      if (reason) lines.push(reason);
      const roadmap = nonEmpty(input.roadmap);
      lines.push(roadmap ? `Roadmap position: ${roadmap}.` : "No roadmap position is recorded for this yet.");
      const actions = [];
      if (nonEmpty(input.requestRef)) actions.push({ kind: COVERAGE_ACTION.request, label: "Request coverage" });
      return { ...base, headline: `${subject} is not covered yet.`, lines, actions };
    }

    case "no_data_yet": {
      const lines = [];
      // What the call site already knows about WHY nothing has arrived (for example how the register fills in)
      // leads, before the two facts the treatment requires.
      if (nonEmpty(input.reason)) lines.push(nonEmpty(input.reason));
      const refresh = nonEmpty(input.expectedRefresh);
      lines.push(refresh ? `Expected refresh: ${refresh}.` : "No refresh date is recorded for this source.");
      const last = nonEmpty(input.lastValue);
      const asOf = nonEmpty(input.asOf);
      if (last && asOf) lines.push(`Last known value: ${last} (as of ${asOf}).`);
      else if (last) lines.push(`Last known value: ${last} (as-of date not recorded).`);
      else lines.push("No earlier value is on file.");
      return { ...base, headline: `${subject}: the source has not published yet.`, lines, actions: [] };
    }

    case "suppressed": {
      const cls = SUPPRESSION_REASON[input.reasonClass ?? ""];
      const lines = [cls ? `Reason: ${cls.label}.` : "Reason class not recorded."];
      const reason = nonEmpty(input.reason);
      if (reason) lines.push(reason);
      // Never worded as absence: the value exists and is withheld.
      return { ...base, headline: `${subject} exists and is withheld.`, lines, actions: [] };
    }

    case "not_filtered_in": {
      const noun = nonEmpty(input.noun) ?? "item";
      const known = Number.isFinite(input.hiddenCount) && input.hiddenCount >= 0;
      const headline = known
        ? `${plural(input.hiddenCount, noun)} hidden by your scope.`
        : `${subject} exists outside your current scope.`;
      const actions = input.canWiden ? [{ kind: COVERAGE_ACTION.widen, label: "Widen scope" }] : [];
      return { ...base, headline, lines: nonEmpty(input.reason) ? [nonEmpty(input.reason)] : [], actions };
    }

    case "error": {
      const actions = [];
      if (input.canRetry) actions.push({ kind: COVERAGE_ACTION.retry, label: "Retry" });
      if (nonEmpty(input.statusHref)) actions.push({ kind: COVERAGE_ACTION.status, label: "See status" });
      return {
        ...base,
        role: "alert",
        headline: `${subject} could not be loaded.`,
        lines: [nonEmpty(input.reason) ?? "This is a system fault, not an absence of data."],
        actions,
      };
    }

    default:
      return null;
  }
}
