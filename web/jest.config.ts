// web/jest.config.ts
// Jest config for the Web project

import type { Config } from 'jest';

const config: Config = {
  displayName: 'web',
  preset: '../jest.preset.js', // adjust if your preset lives elsewhere
  testEnvironment: 'jsdom',

  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        // Move isolatedModules into tsconfig.spec.json to silence the deprecation warning
        // isolatedModules: true,
      },
    ],
  },

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],

  moduleNameMapper: {
    // Keep your existing mapping for @careeros/trpc to a file mock if you add one later
    '^@careeros/trpc$': '<rootDir>/test/trpc.mock.js',
    '^@careeros/trpc/.*$': '<rootDir>/test/trpc.mock.js',

    // Add Next-style alias for "@/..." imports into web/src
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Load jest-dom matchers so expect(...).toBeInTheDocument() works
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],

  coverageDirectory: '<rootDir>/coverage',
};

export default config;
