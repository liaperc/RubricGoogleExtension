module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  testTimeout: 30000,
  verbose: true,
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
};