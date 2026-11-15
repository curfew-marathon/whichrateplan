import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'local-fixtures/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts'], languageOptions: { globals: globals.browser } },
  { files: ['tests/**/*.ts', 'scripts/**/*.ts', 'eslint.config.js'], languageOptions: { globals: globals.node } },
);
