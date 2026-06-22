const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const boundaries = require('eslint-plugin-boundaries');
const prettierConfig = require('eslint-config-prettier');

/**
 * ESLint flat config.
 *
 * The `boundaries/*` rules ENFORCE the architecture described in
 * docs/architecture/module-boundaries.md. If a rule blocks you, the fix is
 * almost always to move code, not to disable the rule. Changing these rules
 * requires an ADR (docs/architecture/decisions/).
 */
module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'reports/**',
      'packs/**', // feature-pack library: parked, opt-in code — not linted until installed
      'supabase/functions/**', // Deno edge functions (jsr:/npm: specifiers) — checked by `deno lint`, not the RN ESLint resolver
      'expo-env.d.ts',
      '**/._*', // macOS AppleDouble files on exFAT/network volumes
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
        {
          type: 'feature',
          mode: 'folder',
          pattern: 'src/features/*',
          capture: ['featureName'],
        },
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'global-css', mode: 'file', pattern: 'src/global.css' },
      ],
    },
    rules: {
      // Layering: app → features → shared. Never the other way around.
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message:
            '${file.type} code must not import from ${dependency.type}. See docs/architecture/module-boundaries.md',
          rules: [
            { from: 'app', allow: ['feature', 'shared', 'global-css'] },
            {
              from: 'feature',
              allow: ['shared', ['feature', { featureName: '${from.featureName}' }]],
            },
            { from: 'shared', allow: ['shared'] },
          ],
        },
      ],
      // Features are only consumable through their public API (index.ts).
      'boundaries/entry-point': [
        'error',
        {
          default: 'allow',
          message:
            'Import features through their public API (src/features/<name>/index.ts), not deep paths.',
          rules: [{ target: ['feature'], allow: ['index.ts', 'index.tsx'] }],
        },
      ],
      // Storage libraries may only be touched through the sanctioned wrapper
      // (src/shared/lib/storage). This is a SECURITY boundary: it forces every
      // "is this safe to persist?" decision through one place and keeps secrets
      // out of plaintext AsyncStorage. See docs/research/01-mobile-security.md §1.
      // (@react-navigation is also banned: SDK 56 expo-router no longer uses it.)
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@react-native-async-storage/async-storage',
              message:
                'Do not import AsyncStorage directly (plaintext on disk). Use @/shared/lib/storage — appStorage / asyncStorageBackend for non-sensitive data, secureStorage / LargeSecureStore for secrets.',
            },
            {
              name: 'expo-secure-store',
              message:
                'Do not import expo-secure-store directly. Use @/shared/lib/storage (secureStorage / LargeSecureStore).',
            },
            {
              name: 'react-native-mmkv',
              message: 'Do not import react-native-mmkv directly. Use @/shared/lib/storage.',
            },
          ],
          patterns: [
            {
              group: ['@react-navigation/*'],
              message:
                'SDK 56: expo-router no longer sits on react-navigation. Import navigation APIs from expo-router.',
            },
          ],
        },
      ],
    },
  },
  {
    // The storage wrapper itself is the one place allowed to touch the libs.
    files: ['src/shared/lib/storage/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  prettierConfig,
]);
