import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Flat ESLint config for the TanStack Start app-builder template. */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vercel/**",
      ".nitro/**",
      "node_modules/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // The simulation engine is pure and deterministic (docs/decisions 0002,
  // 0003): no clock, no randomness, no I/O, no imports from the app, and
  // only exactly-rounded arithmetic. Tests and the CLI are exempt.
  {
    files: ["src/sim/**/*.ts"],
    ignores: ["src/sim/**/*.test.ts", "src/sim/cli.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["Date", "fetch", "process", "setTimeout", "setInterval", "performance", "crypto", "window", "document", "localStorage", "Intl"].map(
          (name) => ({ name, message: "The simulation engine must be pure and deterministic (ADR 0002)." }),
        ),
      ],
      "no-restricted-properties": [
        "error",
        ...["random", "pow", "exp", "expm1", "log", "log1p", "log2", "log10", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "cbrt", "hypot"].map(
          (property) => ({
            object: "Math",
            property,
            message: "Only exactly-rounded arithmetic is allowed in the engine (ADR 0003).",
          }),
        ),
        { property: "toLocaleString", message: "Locale formatting is not deterministic (ADR 0003)." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator='**']",
          message: "Use multiplication; ** is not guaranteed exactly rounded (ADR 0003).",
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: "Use multiplication; ** is not guaranteed exactly rounded (ADR 0003).",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.)",
              message: "The engine may only import its own modules (ADR 0002).",
            },
          ],
        },
      ],
    },
  },
  // Disable rules that conflict with Prettier formatting.
  prettier,
);
