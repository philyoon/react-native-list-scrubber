// The same config runs against the newest versions and, in CI's min-versions job, the oldest the peer ranges
// allow (scripts/install-min-peers.mjs), so it picks what the installed versions provide.
const has = (id) => {
  try {
    require.resolve(id);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  // React Native ships its Jest preset as @react-native/jest-preset since 0.85, inside react-native before
  preset: has('react-native/jest-preset') ? 'react-native' : '@react-native/jest-preset',
  // Reanimated 4 / Worklets: use their JS implementations instead of native code (official testing guide).
  // Reanimated's resolver (4.7+) wraps Worklets' and also picks its own non-native initializers: since
  // Reanimated 4.6 the native ones call setCSSEventHandler, which throws under Jest. Older versions run with
  // Worklets' resolver (0.8+) or, before that, Jest's own.
  resolver: ['react-native-reanimated/jest/resolver', 'react-native-worklets/jest/resolver'].find(has),
  roots: ['<rootDir>/src'],
  // support.tsx in __tests__ holds shared mocks and helpers, not tests
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
  // CI runs with --coverage; fail if any metric drops below 100%.
  coverageThreshold: { global: { statements: 100, branches: 100, functions: 100, lines: 100 } },
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: ['node_modules/(?!(@?react-native[^/]*|@react-native/[^/]+)/)'],
};
