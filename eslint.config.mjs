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
    // CLI scripts — not production code; tolerate `any` and require() imports
    "scripts/**",
  ]),
  {
    rules: {
      // D3's typings are awkward to use strictly; allow `any` as a warning
      // so it shows up in review but doesn't fail CI.
      "@typescript-eslint/no-explicit-any": "warn",
      // Admin dashboard triggers this; tolerable in a private page.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
