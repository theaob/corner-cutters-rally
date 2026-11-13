// Lint: the bug-catching rules only (typescript-eslint's recommended set, with the style-only ones left to tsc and
// review). `npm run lint`; CI runs it on every pull request.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-youtube/**', 'android/**', 'ios/**', 'node_modules/**', 'public/**', 'tools/**', 'site/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // unused names are tsc's job (noUnusedLocals); an underscore marks one left on purpose
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
);
