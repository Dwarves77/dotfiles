// SHARED-WRITER: integrity_flags
// trigger-question-deps.mjs, lane L4-A (2026-10-05): the ONE builder of the dependency object that
// src/lib/learning/trigger-questions.mjs's mainForQuestions needs (readExistingOpen + insertMany), over
// scripts/lib/db.mjs. Extracted from run-population-flywheel.mjs's stepTriggerQuestions so the mint-time
// step and the change-time step in run-propagation-drain.mjs write through one function, never two copies.
// The write goes through db.guardedInsertMany (rule 015, cite required, snapshot of inserted ids).
import { QUESTION_NAMESPACE } from "../../src/lib/connections/flag-namespaces.mjs";
import { CITE as TRIGGER_QUESTIONS_CITE } from "../../src/lib/learning/trigger-questions.mjs";

/**
 * @param {{readAll: Function, guardedInsertMany: Function}} db the scripts/lib/db.mjs module (or a fake)
 * @param {{cite?: {skill:string, reason:string}}} [opts] `cite` is the audit reason recorded with the
 *   write; defaults to the mint-time cite
 */
export function buildTriggerQuestionsDeps(db, { cite = TRIGGER_QUESTIONS_CITE } = {}) {
  return {
    readExistingOpen: () =>
      db.readAll("integrity_flags", "id, subject_ref, created_by", {
        match: (q) => q.eq("status", "open").like("created_by", `${QUESTION_NAMESPACE}%`),
      }),
    insertMany: (rows) => db.guardedInsertMany("integrity_flags", rows, { cite, select: "id" }),
  };
}
