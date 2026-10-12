module.exports = {
    testEnvironment: "jsdom",
    testMatch: ["**/__test__/**/*.test.ts"],
    transform: { "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }] },
};