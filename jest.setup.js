require('react-native-gesture-handler/jestSetup');
// Worklets' own mock (0.7+). Older Worklets have none, and their JS implementation runs as it is under Jest.
let hasWorkletsMock = true;
try {
  require.resolve('react-native-worklets/src/mock');
} catch {
  hasWorkletsMock = false;
}
if (hasWorkletsMock) jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
