import preset from '../../../eslint.preset.mjs';

export default [
  ...preset,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@a2ui/catalog-basic', '@a2ui/catalog-basic/*'],
              message:
                'Use relative imports within @a2ui/catalog-basic instead of self-importing the package.',
            },
          ],
        },
      ],
    },
  },
];
