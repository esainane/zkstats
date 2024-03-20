
module.exports = {
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  testMatch: ['**/test/**/*.test.js'],
  // exclude anything in node_modules
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    "\\.jsx?$": "babel-jest",
    '\\.ts$': 'ts-jest',
    // tsx needs special handling to translate JSX fragments to inferno calls
    '\\.tsx$': ['ts-jest', { astTransformers: { after: ['test/transform-inferno.js'] }}],
  },
  // Should be able to import relative to src/
  moduleDirectories: ['node_modules', 'src'],
	testEnvironment: "jsdom"
};
console.log('Jest configuration loaded:', module.exports);
