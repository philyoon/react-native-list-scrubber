module.exports = {
  preset: '@react-native/jest-preset',
  // Reanimated 4 / Worklets: use their JS implementations instead of native code (official testing guide).
  // Reanimated's resolver wraps Worklets' and also picks its own non-native initializers: since Reanimated 4.6
  // the native ones call setCSSEventHandler, which throws under Jest.
  resolver: 'react-native-reanimated/jest/resolver',
  roots: ['<rootDir>/src'],
  // support.tsx in __tests__ holds shared mocks and helpers, not tests
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
  // CI runs with --coverage; fail if any metric drops below 100%.
  coverageThreshold: { global: { statements: 100, branches: 100, functions: 100, lines: 100 } },
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: ['node_modules/(?!(@?react-native[^/]*|@react-native/[^/]+)/)'],
};
