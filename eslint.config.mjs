import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const browserGlobals = {
  Blob: "readonly",
  File: "readonly",
  FileReader: "readonly",
  HTMLFormElement: "readonly",
  URL: "readonly",
  atob: "readonly",
  crypto: "readonly",
  document: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  Buffer: "readonly",
  Response: "readonly",
  URL: "readonly",
  __dirname: "readonly",
  console: "readonly",
  process: "readonly",
  require: "readonly",
  setTimeout: "readonly",
};

const denoGlobals = {
  Deno: "readonly",
  Request: "readonly",
  Response: "readonly",
  crypto: "readonly",
};

export default [
  {
    ignores: ["dist/**", "release/**", "node_modules/**", "coverage/**", "supabase/.temp/**", "supabase/.branches/**"],
  },
  {
    rules: {
      "no-control-regex": "off",
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-control-regex": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["electron/**/*.cjs", "scripts/**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-control-regex": "off",
    },
  },
  {
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: denoGlobals,
    },
    rules: {
      "no-control-regex": "off",
    },
  },
];
