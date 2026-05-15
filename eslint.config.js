import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

const FORBIDDEN_MUI_COMPONENTS = [
  {
    name: '@mui/material',
    importNames: [
      'CircularProgress',
      'Snackbar',
      'Alert',
      'Fab',
      'Tabs',
      'Tab',
      'Tooltip',
      'Badge',
    ],
    message:
      'Forbidden by UX spec §11. Use Skeleton (loading), inline error Box (failures), Button in fixed footer (not Fab), inline label (not Tooltip), inline count (not Badge). No tab navigation in MVP. (BottomNavigation un-forbidden 2026-05-15 for the routine-week home redesign.)',
  },
  {
    name: '@mui/material/CircularProgress',
    message: 'Forbidden — use Skeleton instead (UX spec §11).',
  },
  {
    name: '@mui/material/Snackbar',
    message: 'Forbidden — use the inline three-part error contract instead (UX spec §11).',
  },
  {
    name: '@mui/material/Alert',
    message: 'Forbidden — use the inline three-part error contract instead (UX spec §11).',
  },
  {
    name: '@mui/material/Fab',
    message: 'Forbidden — primary actions live in fixed footer Buttons (UX spec §11, NFR14).',
  },
  {
    name: '@mui/material/Tabs',
    message: 'Forbidden — no tabbed navigation in MVP (UX spec §11).',
  },
  {
    name: '@mui/material/Tooltip',
    message: 'Forbidden — tooltip-on-touch is unreliable; use inline label (UX spec §11).',
  },
  {
    name: '@mui/material/Badge',
    message: 'Forbidden — use inline count or chip (UX spec §11).',
  },
];

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results', '.vite', 'eslint.config.js'],
  },
  // Plain JS recommendations — apply everywhere we lint.
  js.configs.recommended,
  // Type-aware TS rules — scoped to src + e2e (i.e. files included in a tsconfig).
  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}'],
  })),
  // Non-type-aware fallback for config files at the repo root. Use the TS
  // parser so `as const`, `import type`, etc. parse cleanly — but skip the
  // type-aware rule set since these files aren't in a tsconfig project.
  {
    files: [
      '*.{js,ts,cjs,mjs}',
      'vite.config.ts',
      'playwright.config.ts',
      'scripts/**/*.{js,mjs,ts}',
    ],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  // App source.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.worker },
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-restricted-imports': ['error', { paths: FORBIDDEN_MUI_COMPONENTS }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  // Playwright specs.
  {
    files: ['e2e/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  // Tests — relax a few rules.
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
