
// Jest config for web (clean slate)
module.exports = {
  displayName: 'web',
  testEnvironment: 'jsdom',

  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', {
      swcrc: false,
      sourceMaps: 'inline',
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', tsx: true, decorators: true },
        transform: { react: { runtime: 'automatic' }, decoratorMetadata: true }
      },
      module: { type: 'commonjs' }
    }]
  },

  // Map app aliases and mock TRPC client in tests
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^~/(.*)$': '<rootDir>/src/$1',

    // TRPC hook imports -> jest mock
    '^src/trpc$': '<rootDir>/specs/__mocks__/trpc.ts',
    '^(?:\\.{1,2}/)+trpc$': '<rootDir>/specs/__mocks__/trpc.ts',

    // Stable utils/api re-export -> jest mock
    '^src/utils/api$': '<rootDir>/specs/__mocks__/utils-api.ts',
    '^(?:\\.{1,2}/)+utils/api$': '<rootDir>/specs/__mocks__/utils-api.ts'
  },

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
  coverageDirectory: '<rootDir>/coverage',
};
