const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["dist", "node_modules", "**/dist/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["apps/**/*.ts", "libs/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  }
);
