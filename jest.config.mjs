export default {
    // Indicates the root directory containing the project's tests
    roots: ['<rootDir>/src'],

    // File extensions Jest will look for
    moduleFileExtensions: ['ts', 'js'],

    // Transform files with TypeScript
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },

    // The pattern for test files
    testMatch: ['**/*.spec.ts'],

    // Test environment
    testEnvironment: 'node',

    // Clear mocks between tests
    clearMocks: true,
};
