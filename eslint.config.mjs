import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['lib/', 'coverage/', 'example/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  {
    rules: {
      // Scrollable components and animated refs are typed loosely on purpose
      '@typescript-eslint/no-explicit-any': 'off',
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
