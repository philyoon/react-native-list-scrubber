module.exports = {
  preset: '@react-native/jest-preset',
  // Reanimated 4 / Worklets: use their JS implementations instead of native code (official testing guide).
  resolver: 'react-native-worklets/jest/resolver',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: ['node_modules/(?!(@?react-native[^/]*|@react-native/[^/]+)/)'],
};
