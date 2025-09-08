const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('../tsconfig.base.json');

/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  preset: 'ts-jest',
  transformIgnorePatterns: ['node_modules/(?!(?:@trpc|tslib)/)'],
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  moduleNameMapper: Object.assign(
    {},
    pathsToModuleNameMapper(compilerOptions.paths || {}, { prefix: '<rootDir>/../' }),
    { '^@prisma/client$': '<rootDir>/test/prisma.mock.ts' }
  ),
  roots: ['<rootDir>/src', '<rootDir>/test'],
};
