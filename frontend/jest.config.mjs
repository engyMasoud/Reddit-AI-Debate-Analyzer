export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/../backend/tests/P5'],
  testMatch: ['**/*.test.jsx'],
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
  },
  modulePaths: ['<rootDir>/node_modules'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  resolver: '<rootDir>/jest-resolver.cjs',
};
