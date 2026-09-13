// Fixture for check-vocabulary-drift.test.mjs's negative control (D7 Fix round 3). Reproduces the
// PRE-fix defect shape ON PURPOSE: an unconditional top-level import of an npm package, before any
// credential check. Exists so the no-npm-resolve-hook test can prove it actually catches this class
// (crash, never a clean exit 2), not only that the current, already-fixed script happens to pass. Never
// imported by production code; referenced only by file path from the test.
import "pg";

console.log("unreachable if the resolver hook works");
process.exit(0);
