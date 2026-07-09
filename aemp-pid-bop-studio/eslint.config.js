// ============================================================================
//  ESLint flat config (F20).
//  react-hooks/rules-of-hooks + exhaustive-deps are the whole point of this
//  config: kept at ERROR so CI fails if an effect's dependency array regresses
//  (locks in the PR7 fixes). Everything else — the base recommended rule sets
//  (they'd otherwise report a wall of pre-existing "error"-severity findings
//  on this legacy codebase) plus jsx-a11y — is downgraded to WARN so `npm run
//  lint` still exits 0 on the current tree; CI only actually gates on hook bugs.
// ============================================================================
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/** Downgrade every "error"/2 severity in a rules object (or array of configs)
 *  to "warn"/1, leaving off/warn rules and rule options untouched. */
function warnify(config) {
  if (Array.isArray(config)) return config.map(warnify);
  if (!config.rules) return config;
  const rules = {};
  for (const [name, val] of Object.entries(config.rules)) {
    if (val === 'error' || val === 2) rules[name] = 'warn';
    else if (Array.isArray(val) && (val[0] === 'error' || val[0] === 2)) rules[name] = ['warn', ...val.slice(1)];
    else rules[name] = val;
  }
  return { ...config, rules };
}

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'scripts/**', 'prisma/**', 'supabase/**', 'coverage/**'] },
  warnify(js.configs.recommended),
  ...warnify(tseslint.configs.recommended),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...warnify(jsxA11y.configs.recommended).rules,
      // the whole point of this config — never downgrade or disable these:
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': 'warn',
    },
  },
);
