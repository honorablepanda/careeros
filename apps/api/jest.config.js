const { pathsToModuleNameMapper } = require('ts-jest');
const tsconfig = require('../../tsconfig.base.json');

module.exports = {
  displayName: 'api',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', {
      swcrc: false,
      sourceMaps: 'inline',
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', tsx: false, decorators: true },
        transform: { decoratorMetadata: true }
      },
      module: { type: 'commonjs' }
    }]
  },
  transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\](?!.*(superjson)[/\\\\])'],
  moduleNameMapper: (
    tsconfig.compilerOptions && tsconfig.compilerOptions.paths
      ? pathsToModuleNameMapper(tsconfig.compilerOptions.paths, { prefix: '<rootDir>/../../' })
      : {}
  ),
  setupFilesAfterEnv: [],
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/__tests__/**/*.spec.ts'
  ],
  coverageDirectory: '../../coverage/apps/api',
};
