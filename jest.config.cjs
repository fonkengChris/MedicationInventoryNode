module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  moduleFileExtensions: ["js", "json"],
  collectCoverageFrom: ["<rootDir>/{routes,services,models}/**/*.js"],
  coveragePathIgnorePatterns: ["/node_modules/", "/tests/"],
  testMatch: ["**/?(*.)+(spec|test).js"],
};

