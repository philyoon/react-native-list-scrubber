import { act, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { SharedValue } from 'react-native-reanimated';
import { ListScrubber, type ListScrubberProps } from '../index';

// Shared by the test files: import it first, so its Reanimated mock is in place before the library loads.
// Worklets' mock hops to JS with queueMicrotask; keep it real so scheduleOnRN still runs.
jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

export const mockScrollTo = jest.fn();
export type Reaction = { prepare: () => unknown; react: (cur: unknown, prev: unknown) => void };
export const mockReactions: Reaction[] = [];
export const mockTimings: { to: number; duration: number; done?: () => void }[] = [];
export const mockDelays: number[] = [];
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const React = require('react');
  return {
    ...mock,
    scrollTo: (...args: unknown[]) => mockScrollTo(...args),
    // The stock mock ignores reactions and animations; record them so the fade logic can be driven by hand.
    useAnimatedReaction: (prepare: Reaction['prepare'], react: Reaction['react']) => {
      mockReactions.push({ prepare, react });
    },
    // The stock mock makes new shared values and refs on every render; the real ones persist.
    useSharedValue: (init: unknown) => {
      const ref = React.useRef(null);
      ref.current ??= mock.useSharedValue(init);
      return ref.current;
    },
    useAnimatedRef: () => React.useRef(null),
    // like the real one: the same function between renders
    useAnimatedScrollHandler: (handler: (e: unknown) => void) => {
      const latest = React.useRef(handler);
      latest.current = handler;
      return React.useCallback((e: unknown) => latest.current(e), []);
    },
    withTiming: (to: number, config: { duration: number }, done?: () => void) => {
      mockTimings.push({ to, duration: config.duration, done });
      return to; // a finished animation; `done` is called by the test
    },
    withDelay: (ms: number, next: unknown) => {
      mockDelays.push(ms);
      return next;
    },
    withSequence: () => 1, // the thumb ends up fully faded in
  };
});

/** A shared value stand-in with get/set */
export function sharedZero() {
  let v = 0;
  return { value: 0, get: () => v, set: (n: number) => (v = n) } as unknown as SharedValue<number>;
}

export const colors = { thumb: 'gray', thumbActive: 'red', bubble: 'black', bubbleText: 'white' };

// List 1,000 tall in a 100 viewport: the 48 thumb travels 100 - 48 = 52.
export const baseProps = {
  scrollY: sharedZero(),
  listRef: (() => null) as never,
  contentHeight: 1000,
  viewportHeight: 100,
  colors,
  accessibilityLabel: 'Scroll position',
};

export function setup(props: Partial<ListScrubberProps> = {}) {
  return render(
    <ListScrubber
      scrollY={sharedZero()}
      listRef={(() => null) as never}
      contentHeight={1000}
      viewportHeight={100}
      colors={colors}
      accessibilityLabel="Scroll position"
      {...(props as object)} // a Partial of the sections / labelAt union isn't spreadable as is
    />,
  );
}

export function drag(translationY: number) {
  return act(() =>
    fireGestureHandler(getByGestureTestId('list-scrubber'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { translationY },
    ]),
  );
}

beforeEach(() => {
  mockScrollTo.mockClear();
  mockReactions.length = 0;
  mockTimings.length = 0;
  mockDelays.length = 0;
});

/** The two reactions of the latest render: [scroll → fade, opacity → visible] */
export const reactions = () => mockReactions.slice(-2) as [Reaction, Reaction];
