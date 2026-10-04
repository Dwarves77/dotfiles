# 2026-10-04 GATES-2: exporter takes an output path

- Lane: gates2-exporter-out. Write set: `fsi-app/scripts/verify/export-loop-fired-evidence.mjs` and its test.
- Added `--out <path>` to the loop firing evidence exporter. With `--write` it writes to that path (resolved against the cwd) through the existing `outFile` dependency, no second writer. `--out` without `--write`, or without a value, is refused with exit 1 and a message.
- Tests (red then green): `--out` honoured, `--out` without `--write` refused, `--out` without a value refused.
- Read and reused: the exporter and its test in full, `scripts/lib/is-main.mjs`, `scripts/lib/db.mjs` (`readAll`), `scripts/lib/env-file.mjs`.
- Exit-127 crash on Windows after a successful dry run (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, libuv `async.c`): the script ended with an explicit `process.exit(code)` in the `runCli().then`, straight after the Supabase client's async read. Changed to `process.exitCode = code` so the process ends naturally. Cause is [HYPOTHESIS] (standard cause, established by reading the ending, not by a reproduction); whether the crash is gone is verified by re-running the dry run with credentials after merge.
- UX compliance: not applicable, no .tsx or .css touched.
