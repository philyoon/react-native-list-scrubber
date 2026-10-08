import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['lib/', 'coverage/', 'example/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  {
    plugins: { '@stylistic': stylistic },
    rules: {
      // Scrollable components and animated refs are typed loosely on purpose
      '@typescript-eslint/no-explicit-any': 'off',
      // Prettier wraps code at printWidth but leaves comments alone; strings can't be wrapped
      '@stylistic/max-len': [
        'error',
        {
          code: 110,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreUrls: true,
          ignoreRegExpLiterals: true,
        },
      ],
    },
  },
  {
    // Node scripts
    files: ['scripts/**'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    // Config files and jest.mock factories use CommonJS
    files: ['*.js', 'src/__tests__/**'],
    languageOptions: { globals: { module: 'writable', require: 'readonly', jest: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
