export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/../backend/tests/P5', '<rootDir>/src'],
  testMatch: ['**/*.test.jsx', '**/*.test.js'],
  moduleFileExtensions: ['js', 'jsx', 'json'],
  watchman: false,
  haste: {
    forceNodeFilesystemAPI: true,
    enableSymlinks: true,
  },
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', { configFile: './babel.config.cjs' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(socket\\.io-client|engine\\.io-client|socket\\.io-parser|lucide-react)/)',
  ],
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
    '^.*/viteEnv\\.js$': '<rootDir>/__mocks__/viteEnv.js',
  },
  modulePaths: ['<rootDir>/node_modules'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup-afterenv.js'],
  resolver: '<rootDir>/jest-resolver.cjs',
};
