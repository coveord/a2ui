import preset from '../../eslint.preset.mjs';

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
              group: ['@a2ui/schema-zod-v4', '@a2ui/schema-zod-v4/*'],
              message:
                'Use relative imports within @a2ui/schema-zod-v4 instead of self-importing the package.',
            },
          ],
        },
      ],
    },
  },
];
