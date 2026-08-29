/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist', 'node_modules', 'drizzle', 'storage'],
  rules: {
    // The codebase leans on `unknown`/`Record<string, unknown>` at API
    // boundaries (webhook payloads, JSON columns) and narrows explicitly —
    // that pattern is intentional, not an oversight worth flagging.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-empty': ['error', { allowEmptyCatch: true }],
    // The scheduler-sweep services paginate with a deliberate
    // `while (true) { ...; if (done) break; }` — checkLoops:false is the
    // standard way to allow that idiom without disabling the rule outright.
    'no-constant-condition': ['error', { checkLoops: false }],
    // A JSDoc example string uses a real ellipsis + zero-width space for
    // correct typography — comments aren't executable, so don't flag them.
    'no-irregular-whitespace': ['error', { skipComments: true }],
  },
};
