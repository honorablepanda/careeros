// web/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  displayName: 'web',
  preset: '../jest.preset.js', // adjust if your preset is elsewhere
  testEnvironment: 'jsdom',

  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        // keep isolatedModules in tsconfig.spec.json (not here) to avoid deprecation warning
      },
    ],
  },

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],

  moduleNameMapper: {
    '^(?:\\.\\./)+trpc$': '<rootDir>/specs/__mocks__/trpc.ts',
    '^src/trpc$': '<rootDir>/specs/__mocks__/trpc.ts',
    '@careeros/trpc': '<rootDir>/specs/__mocks__/trpc.ts',
    '^@/trpc$': '<rootDir>/specs/__mocks__/trpc.ts',
    // Point ALL @careeros/trpc imports (and subpaths) to the shared TS mock
    '^@careeros/trpc(?:/.*)?$': '<rootDir>/test/trpc.mock.ts',
    // Next-style alias for "@/..."
    '^@/(.*)$': '<rootDir>/src/$1',
  
  },

  // Loads @testing-library/jest-dom matchers, etc.
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],

  coverageDirectory: '<rootDir>/coverage',
};

export default config;
