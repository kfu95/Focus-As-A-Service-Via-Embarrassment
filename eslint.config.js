import globals from 'globals';

export default [
  {
    files: ['**/*.js'],
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['native/messages.js'],
    languageOptions: {
      globals: { ObjC: 'readonly', $: 'readonly', Application: 'readonly' },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^run$' }] },
  },
];
