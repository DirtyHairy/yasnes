export default {
    roots: ['<rootDir>/src'],
    moduleFileExtensions: ['ts', 'js'],
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    testMatch: ['**/*.spec.ts'],
    testEnvironment: 'node',
    clearMocks: true,
};
