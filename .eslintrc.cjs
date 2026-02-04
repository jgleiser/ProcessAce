/** @type {import('eslint').Linter.Config} */
module.exports = {
    root: true,
    env: {
        node: true,
        es2021: true,
        browser: true,
    },
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    extends: [
        'eslint:recommended',
        // Uncomment when you add TypeScript
        // 'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
    ],
    plugins: [
        // '@typescript-eslint',
    ],
    ignorePatterns: [
        'dist/',
        'build/',
        'node_modules/',
    ],
    rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-console': 'off',
    },
};
