// @ts-check
// jest.config.js 2.0.1

// This Jest configuration is designed for a TypeScript project using ESM modules with ts-jest.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDefaultEsmPreset } from 'ts-jest';

// Locate @matterbridge/jest-utils. With a flat npm install it is hoisted to the project's
// node_modules; with an npm-linked matterbridge dev clone (local dev:link and CI) it only
// exists inside the clone's own node_modules. Using the copy next to matterbridge keeps a
// single @matter module tree, which the e2e tests rely on.
const configDirname = path.dirname(fileURLToPath(import.meta.url));
const jestUtilsCandidates = [
  path.join(configDirname, 'node_modules', '@matterbridge', 'jest-utils', 'dist'),
  path.join(configDirname, 'node_modules', 'matterbridge', 'node_modules', '@matterbridge', 'jest-utils', 'dist'),
];
const jestUtilsDir = jestUtilsCandidates.find((candidate) => existsSync(candidate)) ?? jestUtilsCandidates[0];

// Create an ESM configuration to process TypeScript files (.ts/.mts/.tsx/.mtsx).
/** @typedef {{ tsconfig: string }} TsJestEsmPresetOptions */

/** @type {TsJestEsmPresetOptions} */
const tsJestEsmPresetOptions = {
  tsconfig: './tsconfig.jest.json',
};

/** @type {import('ts-jest').DefaultEsmPreset} */
const presetConfig = createDefaultEsmPreset(tsJestEsmPresetOptions);

/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
  ...presetConfig,
  testEnvironment: 'node', // Use Node.js environment for testing
  cacheDirectory: '<rootDir>/.cache/jest',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Handle ESM imports by removing the .js extension
    '^@matterbridge/jest-utils$': path.join(jestUtilsDir, 'export.js'),
    '^@matterbridge/jest-utils/matter$': path.join(jestUtilsDir, 'matter.js'),
  },
  testPathIgnorePatterns: ['/.cache/', '/dist/', '/build/', '/node_modules/', '/scripts/', '/vitest/', '/apps/', '/src/mock/', '/vendor/', '/temp/'],
  coveragePathIgnorePatterns: ['/.cache/', '/dist/', '/build/', '/node_modules/', '/scripts/', '/vitest/', '/apps/', '/src/mock/', '/vendor/', '/temp/'],
  maxWorkers: '100%', // Use all available CPU cores for running tests
};

export default jestConfig;
