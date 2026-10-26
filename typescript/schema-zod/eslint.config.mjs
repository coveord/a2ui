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
              group: ['@a2ui/schema-zod', '@a2ui/schema-zod/*'],
              message:
                'Use relative imports within @a2ui/schema-zod instead of self-importing the package.',
            },
          ],
        },
      ],
    },
  },
];
