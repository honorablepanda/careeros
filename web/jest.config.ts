const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transformIgnorePatterns: ['node_modules/(?!(?:@testing-library|@babel|nanoid)/)'],

  // Keep the suite exiting on Windows until we track the open handle
  forceExit: true,
  detectOpenHandles: false,
  reporters: ['default'],
};

module.exports = createJestConfig(config);
