import { renderHook } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useScrubGesture } from '../useScrubGesture';

// Gesture Handler 3's hook API, which the tests' Gesture Handler 2 doesn't have: the scrubber uses it when
// it's there (#102)
const mockUsePanGesture = jest.fn<string, [object]>(() => 'v3 pan');
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  usePanGesture: (config: object) => mockUsePanGesture(config),
}));

it("uses Gesture Handler 3's usePanGesture when it's there", async () => {
  const { result } = await renderHook(() =>
    useScrubGesture({
      listRef: { current: null } as never,
      scrollY: useSharedValue(0),
      opacity: useSharedValue(0),
      dragging: useSharedValue(false),
      track: useSharedValue({ top: 0, travel: 500, start: 0, cover: 0 }),
      maxTravel: 500,
      maxScroll: 1000,
      contentHeight: 1500,
      viewportHeight: 500,
      offsets: [],
      fadeMs: 150,
      hideAfterMs: 1500,
      enabled: true,
      testID: 'thumb',
      onBegin: () => {},
      onEnd: () => {},
    }),
  );
  expect(result.current.pan).toBe('v3 pan');
  // The older API's onEnd is the hook API's onDeactivate; minDistance 0, as there
  expect(mockUsePanGesture).toHaveBeenLastCalledWith({
    testID: 'thumb',
    enabled: true,
    minDistance: 0,
    onBegin: expect.any(Function),
    onUpdate: expect.any(Function),
    onDeactivate: expect.any(Function),
    onFinalize: expect.any(Function),
  });
});
