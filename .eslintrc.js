module.exports = {
  // Este repo vive como submódulo dentro do monorepo mensageria; sem `root` o eslint sobe
  // e carrega o .eslintrc.json da raiz, cujos plugins não existem aqui.
  root: true,
  extends: ['expo', 'prettier'],
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
  ],
};
