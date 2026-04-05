/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  mutate: [
    'src/services/**/*.ts',
    '!src/services/interfaces/**/*.ts',
  ],
  testRunner: 'jest',
  jest: {
    configFile: 'jest.config.js',
  },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  timeoutMS: 60000,
  concurrency: 2,
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
};
