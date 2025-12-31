import tsparser from "@typescript-eslint/parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    files: ["**/*.ts"],
    ignores: ["main.js", "*.config.mjs", "*.config.js", "node_modules/**"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "obsidianmd": obsidianmd
    },
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      
      // Obsidian plugin rules (basic checks that don't need type info)
      "obsidianmd/no-forbidden-elements": "error",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          enforceCamelCaseLower: true,
          ignoreWords: ["New", "Train", "Collection", "Collections", "Quick", "Start", "Not", "File", "All", "Folder1", "Folder2", "Subfolder", "Archive", "Templates", "Project", "Important", "Review", "Todo", "Draft", "Private", "Remove", "Blacklist", "Last"]
        }
      ],
      "obsidianmd/regex-lookbehind": "error"
    }
  }
];


