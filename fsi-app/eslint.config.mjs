import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Lane R7-LINT-CI, 2026-10-01, operator-approved narrow exception (ESLint wired into CI for the
  // first time; the full-tree lint cleanup that followed found this codebase already has a wide,
  // pre-existing convention of prefixing a deliberately-unused parameter or destructured binding with
  // a leading underscore (e.g. src/lib/email/send-invitation-email.ts's `_params`, src/lib/llm/spend-
  // client.ts's `_itemId`/`_status`/`_sourceUrl`, src/lib/intake/apply-staged-update.ts's `_kd`/`_sn`/
  // `_al`). @typescript-eslint/no-unused-vars ships with no ignore pattern by default, so every one of
  // those sites still warned despite the naming already signaling intent. This is the rule being
  // objectively wrong for this repo's convention, not a loosening of what counts as unused: a binding
  // not prefixed with `_` is still flagged exactly as before.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
