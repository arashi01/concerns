// @ts-check
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Base configs
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Global settings
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Source rules (ss12 mandatory + react-hooks)
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'eqeqeq': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowConciseArrowFunctionExpressionsStartingWithVoid: true,
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      // Branded type constructors legitimately use `as` casts (ss4 explicit allowance)
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-deprecated': 'error',
      // Forge resolver callbacks and React components infer return types adequately
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Allow void for fire-and-forget promises in React effects (standard pattern)
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // Allow unused vars prefixed with underscore (test fixtures)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },

  // Relaxed rules for test files
  {
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Ignores
  {
    ignores: ['node_modules/', 'static/', 'dist/', '.ext/', '*.config.*'],
  },
);
