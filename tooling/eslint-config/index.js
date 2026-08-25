import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * Rules that encode the two hard promises this repository makes about its
 * TypeScript: no `any` ever reaches production code, and nobody silences the
 * compiler. They are errors, not warnings -- CI fails on them.
 */
export const strictTypeSafety = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/ban-ts-comment': [
    'error',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true,
      'ts-nocheck': true,
      'ts-check': false,
      minimumDescriptionLength: 10,
    },
  ],
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  // Conflicts with `noPropertyAccessFromIndexSignature`, which the tsconfig
  // turns on: TypeScript demands brackets for index signatures, this rule
  // demands a dot. The compiler wins.
  '@typescript-eslint/dot-notation': 'off',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/return-await': ['error', 'always'],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-console': ['error', { allow: ['warn', 'error'] }],
}

/**
 * Determinism, scoped to the packages. Reading the wall clock at the edge of an
 * adapter is correct behaviour; doing it inside a use case is not, which is why
 * the domain has a Clock port in the first place.
 */
export const determinism = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "MemberExpression[object.name='Math'][property.name='random']",
      message: 'Non-determinism must come from an injected port, not Math.random().',
    },
    {
      selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
      message: 'Read the current time from the injected Clock port, not Date.now().',
    },
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Read the current time from the injected Clock port, not new Date().',
    },
  ],
}

/**
 * The dependency graph is part of the architecture, so it is linted like the
 * rest of it. `packages/domain` must stay free of infrastructure, and the
 * agent must reach the ERP only through MCP -- never through the database.
 */
export const architectureBoundaries = [
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'drizzle-orm',
                'drizzle-orm/*',
                'pg',
                'postgres',
                'next',
                'next/*',
                'react',
                '@ledgerhand/db',
                '@ledgerhand/db/*',
                '@anthropic-ai/*',
                '@modelcontextprotocol/*',
                'node:fs',
                'node:fs/*',
                'node:net',
                'node:http',
                'node:https',
              ],
              message:
                'packages/domain is infrastructure-free by design: no database, no framework, no I/O. Express the need as a port instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/agent/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@ledgerhand/db', '@ledgerhand/db/*', 'drizzle-orm', 'drizzle-orm/*', 'pg'],
              message:
                'The agent never holds database credentials. It reaches the ERP exclusively through the MCP server.',
            },
          ],
        },
      ],
    },
  },
]

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/drizzle/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Type-aware linting. Each package's `tsconfig.json` covers its source
        // AND its tests; `tsconfig.build.json` is the narrower one that emits.
        // The root-level config files belong to no package, so they are linted
        // against the default project instead.
        projectService: {
          allowDefaultProject: ['*.js', 'tooling/*/*.js'],
        },
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: strictTypeSafety,
  },
  {
    files: ['packages/**/*.ts'],
    rules: determinism,
  },
  ...architectureBoundaries,
  {
    // React components: the hooks rules catch a class of bug no type system
    // can, and a stale closure in a form that writes to the ledger is not a
    // cosmetic problem.
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Server Components legitimately return promises.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Configuration written in JavaScript is not part of the typed program;
    // running type-aware rules over it only produces noise about the shape of
    // ESLint's own plugin objects.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    // Tests may reach for shortcuts that production code may not.
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts', '**/fixtures/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.config.ts', '**/*.config.js', '**/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
)
