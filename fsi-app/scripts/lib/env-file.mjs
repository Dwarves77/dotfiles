import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** The one variable that switches the env-file load off. */
export const NO_ENV_FILE_VAR = "FSI_NO_ENV_FILE";

/** fsi-app's root, derived from this module's own location, never from the caller's cwd. */
export const FSI_APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The file every script loads: fsi-app/.env.local (gitignored). */
export const DEFAULT_ENV_FILE = resolve(FSI_APP_ROOT, ".env.local");

/** The variables that make a script able to reach the database. Mirrors the two Supabase names every
 *  `--apply` gate checks and the three pg-conn.mjs connection candidates. Kept in ONE place so a
 *  credential-absent test cannot strip a stale subset. */
export const CREDENTIAL_VARS = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "SUPABASE_DB_PASSWORD",
]);

/** True when the env-file load is switched off for this environment. PURE. */
export function envFileLoadSwitchedOff(env = process.env) {
  const v = env[NO_ENV_FILE_VAR];
  return v !== undefined && v !== "" && v !== "0";
}

/**
 * Load the local env file into `env`, guarded. Never throws.
 * @param {{ path?: string, env?: Record<string, string|undefined>, load?: (path: string) => void }} [opts]
 *   `load` is injectable for tests; the default is Node's own `process.loadEnvFile`.
 * @returns {{ loaded: boolean, reason: "loaded"|"switched-off"|"absent"|"error", path: string, error?: unknown }}
 */
export function loadLocalEnvFile({ path = DEFAULT_ENV_FILE, env = process.env, load = (p) => process.loadEnvFile(p) } = {}) {
  if (envFileLoadSwitchedOff(env)) return { loaded: false, reason: "switched-off", path };
  try {
    load(path);
    return { loaded: true, reason: "loaded", path };
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    return { loaded: false, reason: code === "ENOENT" ? "absent" : "error", path, error };
  }
}

/**
 * A child environment with NO database credentials and the env-file load switched off. The ONE way a test
 * asserts credential-absent behaviour: stripping alone is not enough in a checkout that has an env file.
 * PURE (copies `base`; never mutates it).
 * @param {Record<string, string|undefined>} [base]
 */
export function withoutCredentials(base = process.env) {
  const env = { ...base };
  for (const name of CREDENTIAL_VARS) delete env[name];
  env[NO_ENV_FILE_VAR] = "1";
  return env;
}
