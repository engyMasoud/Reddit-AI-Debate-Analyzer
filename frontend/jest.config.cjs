module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/../backend/tests/P5'],
  testMatch: ['**/*.test.jsx'],
  moduleFileExtensions: ['js', 'jsx', 'json'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
  },
  modulePaths: ['<rootDir>/node_modules'],
};
