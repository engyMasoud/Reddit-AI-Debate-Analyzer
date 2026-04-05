module.exports = {
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
    '^.+\\.jsx?$': ['babel-jest', { configFile: './babel.config.cjs' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(socket\\.io-client|engine\\.io-client|socket\\.io-parser|lucide-react)/)',
  ],
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
  },
  modulePaths: ['<rootDir>/node_modules'],
  // Force Jest to treat .js/.jsx as CJS despite "type": "module" in package.json
  resolver: '<rootDir>/jest-resolver.cjs',
};
