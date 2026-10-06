import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { SharedValue } from 'react-native-reanimated';
import {
  LIST_SCRUBBER_DEFAULTS,
  ListScrubber,
  type ListScrubberProps,
  SectionLabel,
  usePinnedHeaderStyle,
  labelProbe,
  sectionIndexAt,
  useListScrubber,
} from '../index';

// Worklets' mock hops to JS with queueMicrotask; keep it real so scheduleOnRN still runs.
jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

const mockScrollTo = jest.fn();
type Reaction = { prepare: () => unknown; react: (cur: unknown, prev: unknown) => void };
const mockReactions: Reaction[] = [];
const mockTimings: { to: number; duration: number; done?: () => void }[] = [];
const mockDelays: number[] = [];
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
    withSequence: () => 1, // the handle ends up fully faded in
  };
});

/** A shared value stand-in with get/set */
function sharedZero() {
  let v = 0;
  return { value: 0, get: () => v, set: (n: number) => (v = n) } as unknown as SharedValue<number>;
}

const colors = { thumb: 'gray', thumbActive: 'red', bubble: 'black', bubbleText: 'white' };

// List 1,000 tall in a 100 viewport: the 48 handle travels 100 - 48 = 52.
const baseProps = {
  scrollY: sharedZero(),
  listRef: (() => null) as never,
  contentHeight: 1000,
  viewportHeight: 100,
  colors,
  accessibilityLabel: 'Scroll position',
};

function setup(props: Partial<ListScrubberProps> = {}) {
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

function drag(translationY: number) {
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
const reactions = () => mockReactions.slice(-2) as [Reaction, Reaction];

it('dragging scrolls the list in proportion and asks for the label at that spot', async () => {
  // fireGestureHandler always ends the gesture, so the bubble is gone afterwards: check what was asked.
  const labelAt = jest.fn((offset: number) => `at ${Math.round(offset)}`);
  const onDragStart = jest.fn();
  await setup({ labelAt, onDragStart });
  await drag(26); // half of 52
  expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 450, false); // (1000 - 100) / 2
  await act(async () => {}); // the label is drawn on the JS thread
  expect(labelAt).toHaveBeenCalledWith(450);
  expect(onDragStart).toHaveBeenCalledTimes(1);
  await drag(900); // past the end: clamps
  expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 900, false);
});

it('draws nothing when the list fits on screen', async () => {
  await setup({ contentHeight: 80 });
  expect(screen.queryByTestId('list-scrubber-handle', { includeHiddenElements: true })).toBeNull();
});

it('takes size overrides and keeps the other defaults', async () => {
  await setup({ metrics: { thumbLength: 80 } });
  const handle = screen.getByTestId('list-scrubber-handle', { includeHiddenElements: true });
  expect(StyleSheet.flatten(handle.props.style).height).toBe(80);
  const bar = handle.children.at(-1) as unknown as { props: { style: ViewStyle } };
  expect(StyleSheet.flatten(bar.props.style)!.width).toBe(LIST_SCRUBBER_DEFAULTS.metrics.thumbWidth);
});

it('a longer handle shortens the travel', async () => {
  await setup({ metrics: { thumbLength: 50 } }); // travel 50
  await drag(25);
  expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 450, false);
});

describe('screen readers', () => {
  it('is an adjustable "Scroll position" control even while the handle is hidden', async () => {
    await setup();
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    expect(el.props.accessibilityValue).toEqual({ text: '0%' });
  });

  it('steps one screen at a time and announces the percentage', async () => {
    await setup({ formatPercent: (p) => `${p} percent` });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20)); // the scroll runs on the UI thread (next frame)
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 90, false);
    expect(el.props.accessibilityValue).toEqual({ text: '10 percent' });
  });

  it('with steps (e.g. section headers) jumps to the next one and announces its label', async () => {
    await setup({ steps: [0, 500, 800], labelAt: (offset) => (offset >= 500 ? 'M' : 'A') });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20)); // the scroll runs on the UI thread (next frame)
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
    expect(el.props.accessibilityValue).toEqual({ text: 'M' });
  });
});

describe('sections', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
    { offset: 800, label: 'Zebra' },
  ];

  it('draws every section label once in a strip and never asks labelAt', async () => {
    const labelAt = jest.fn(() => 'js');
    await setup({ sections, labelAt: labelAt as never }); // the types forbid both; check it at runtime too
    await drag(26);
    await act(async () => {});
    expect(labelAt).not.toHaveBeenCalled();
    for (const s of sections) {
      expect(screen.getByText(s.label, { includeHiddenElements: true })).toBeTruthy();
    }
  });

  it('screen readers step section by section and hear the section label', async () => {
    await setup({ sections });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    expect(el.props.accessibilityValue).toEqual({ text: 'A' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
    expect(el.props.accessibilityValue).toEqual({ text: 'M' });
  });
});

describe('useListScrubber', () => {
  it('measures the list from its layout and content size', async () => {
    const { result } = await renderHook(() => useListScrubber());
    await act(() => {
      result.current.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
      result.current.listProps.onContentSizeChange(390, 12000);
    });
    expect(result.current.scrubberProps).toMatchObject({ viewportHeight: 600, contentHeight: 12000 });
    expect(result.current.listProps.scrollEventThrottle).toBe(16);
  });
});

describe('label helpers', () => {
  it('labelProbe reads the top at the start and the last pixel at the end', () => {
    expect(labelProbe(0, 1000, 100)).toBe(0);
    expect(labelProbe(450, 1000, 100)).toBe(500);
    expect(labelProbe(900, 1000, 100)).toBe(999);
  });

  it('sectionIndexAt finds the section containing an offset', () => {
    const starts = [0, 100, 250, 900];
    expect(sectionIndexAt(starts, 0)).toBe(0);
    expect(sectionIndexAt(starts, 99)).toBe(0);
    expect(sectionIndexAt(starts, 100)).toBe(1);
    expect(sectionIndexAt(starts, 899.6)).toBe(3); // half-pixel rounding
    expect(sectionIndexAt(starts, 5000)).toBe(3);
    expect(sectionIndexAt([], 10)).toBe(0);
  });
});

it('SectionLabel slides its label strip to the section at the top of the list', async () => {
  const scrollY = sharedZero();
  scrollY.set(620);
  await render(
    <SectionLabel
      scrollY={scrollY}
      height={20}
      sections={[
        { offset: 0, label: 'A' },
        { offset: 500, label: 'M' },
      ]}
    />,
  );
  // the Reanimated mock computes animated styles once, from the current values: 'M' is the second line
  const strip = screen.getByTestId('list-scrubber-label-strip', { includeHiddenElements: true });
  expect(StyleSheet.flatten(strip.props.style)).toMatchObject({ transform: [{ translateY: -20 }] });
});

describe('usePinnedHeaderStyle', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'B' },
  ];
  const push = async (y: number) => {
    const scrollY = sharedZero();
    scrollY.set(y);
    const { result } = await renderHook(() => usePinnedHeaderStyle(scrollY, sections, 36));
    return (result.current as unknown as { transform: { translateY: number }[] }).transform[0]!.translateY;
  };

  it('stays put until the next header reaches it', async () => {
    expect(await push(0)).toBe(0);
    expect(await push(464)).toBe(0); // B's header top is exactly one header below
  });

  it('is pushed up by the next header, then the next section takes over', async () => {
    expect(await push(480)).toBe(-16);
    expect(await push(499)).toBe(-35);
    expect(await push(500)).toBe(0); // now pinned B, nothing after it
  });
});

describe('appearing and hiding', () => {
  const handle = () => screen.getByTestId('list-scrubber-handle', { includeHiddenElements: true });

  it('fades in on the first scroll frame, then hides after hideAfterMs', async () => {
    const scrollY = sharedZero();
    await setup({ scrollY });
    const [fade] = reactions();
    scrollY.set(10);
    expect(fade.prepare()).toBe(10); // it watches the scroll offset
    fade.react(10, 0);
    expect(mockTimings.map((t) => [t.to, t.duration])).toEqual([
      [1, 150], // fade in: fadeMs × (1 − 0)
      [0, 150], // then fade out
    ]);
    expect(mockDelays).toEqual([1500]);
  });

  it('starts the fade-in once: more scroll frames while it runs do not restart it', async () => {
    await setup();
    const [fade] = reactions();
    fade.react(10, 0);
    fade.react(20, 10);
    fade.react(30, 20);
    expect(mockTimings.filter((t) => t.to === 1)).toHaveLength(1);
    mockTimings[0]!.done!(); // fade-in finished
    fade.react(40, 30); // already fully visible: only re-arm the hide timer
    expect(mockTimings.filter((t) => t.to === 1)).toHaveLength(1);
    expect(mockDelays).toEqual([1500, 1500]);
  });

  it('ignores the first value, unchanged values and scrolling caused by a drag', async () => {
    await setup();
    const [fade] = reactions();
    fade.react(0, null);
    fade.react(5, 5);
    expect(mockTimings).toHaveLength(0);
  });

  it('honours custom timing', async () => {
    await setup({ timing: { fadeMs: 400, hideAfterMs: 3000 } });
    reactions()[0].react(10, 0);
    expect(mockTimings[0]).toMatchObject({ to: 1, duration: 400 });
    expect(mockDelays).toEqual([3000]);
  });

  it('lets touches through while hidden and catches them while visible', async () => {
    await setup();
    expect(handle().props.pointerEvents).toBe('none');
    const [fade, visible] = reactions();
    fade.react(10, 0); // opacity becomes 1
    expect(visible.prepare()).toBe(true);
    await act(async () => visible.react(true, false));
    expect(handle().props.pointerEvents).toBe('auto');
    await act(async () => visible.react(false, true));
    expect(handle().props.pointerEvents).toBe('none');
  });

  it('screen-reader value follows manual scrolling once the handle hides', async () => {
    const scrollY = sharedZero();
    await setup({
      scrollY,
      sections: [
        { offset: 0, label: 'A' },
        { offset: 500, label: 'M' },
      ],
    });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    expect(el.props.accessibilityValue).toEqual({ text: 'A' });
    scrollY.set(600); // the user scrolled by hand
    await act(async () => reactions()[1].react(false, true));
    expect(screen.getByRole('adjustable', { name: 'Scroll position' }).props.accessibilityValue).toEqual({
      text: 'M',
    });
  });
});

describe('layout', () => {
  const style = (id: string) =>
    StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);

  it('places the handle by scroll position', async () => {
    const scrollY = sharedZero();
    scrollY.set(450); // half of 900
    await setup({ scrollY });
    expect(style('list-scrubber-handle').transform).toEqual([{ translateY: 26 }]); // half of 52
  });

  it('clamps the handle when the list overscrolls', async () => {
    const scrollY = sharedZero();
    scrollY.set(-80);
    await setup({ scrollY });
    expect(style('list-scrubber-handle').transform).toEqual([{ translateY: 0 }]);
    scrollY.set(5000);
    await setup({ scrollY });
    expect(
      screen.getAllByTestId('list-scrubber-handle', { includeHiddenElements: true }).at(-1)!.props.style,
    ).toBeTruthy();
  });

  it('railWidth sets the strip width', async () => {
    await setup({ railWidth: 30 });
    expect(style('list-scrubber-a11y')).toMatchObject({ width: 30, right: 0 });
  });

  it('keeps the section bubble inside the list at the top', async () => {
    await setup({ sections: [{ offset: 0, label: 'A' }] });
    // at rest the handle is at the top: the 64pt bubble is pushed down by (64 − 48) / 2
    const strip = screen.getByTestId('list-scrubber-label-strip', { includeHiddenElements: true });
    let bubble = strip.parent!;
    while (!StyleSheet.flatten(bubble.props.style)?.transform) bubble = bubble.parent!;
    expect(StyleSheet.flatten(bubble.props.style).transform).toEqual([{ translateY: 8 }]);
  });
});

describe('dragging with sections', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
    { offset: 800, label: 'Zebra' },
  ];
  const strip = () =>
    StyleSheet.flatten(
      screen.getByTestId('list-scrubber-label-strip', { includeHiddenElements: true }).props.style,
    );

  it('moves the label strip to the section under the finger', async () => {
    // The mock draws styles only on render, so re-render to read the UI-thread state after a drag.
    const view = await setup({ sections });
    const again = () => view.rerender(<ListScrubber {...baseProps} sections={sections} />);
    await drag(26); // offset 450, probe 500 → "M"
    await again();
    expect(strip().transform).toEqual([{ translateY: -64 }]);
    await drag(900); // the end → the last section, though it is shorter than a screen
    await again();
    expect(strip().transform).toEqual([{ translateY: -128 }]);
  });
});

describe('screen reader edges', () => {
  it('decrement goes back to the previous step and stops at the start', async () => {
    const scrollY = sharedZero();
    scrollY.set(600);
    await setup({ scrollY, steps: [0, 500, 800] });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    const act1 = async () => {
      await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
      await act(() => jest.advanceTimersByTime(20));
    };
    await act1();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
    scrollY.set(500);
    await act1();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 0, false);
    scrollY.set(0);
    await act1();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 0, false);
  });

  it('increment past the last step lands on the end of the list', async () => {
    const scrollY = sharedZero();
    scrollY.set(800);
    await setup({ scrollY, steps: [0, 500, 800] });
    await fireEvent(screen.getByRole('adjustable', { name: 'Scroll position' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 900, false);
  });

  it('without steps, paging never goes past either end', async () => {
    const scrollY = sharedZero();
    scrollY.set(880);
    await setup({ scrollY });
    await fireEvent(screen.getByRole('adjustable', { name: 'Scroll position' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 900, false);
  });
});

describe('useListScrubber details', () => {
  it('the scroll handler records the vertical offset', async () => {
    const { result } = await renderHook(() => useListScrubber());
    (result.current.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y: 321 } });
    expect(result.current.scrollY.get()).toBe(321);
  });

  it('keeps the same list props between renders', async () => {
    const { result, rerender } = await renderHook(() => useListScrubber());
    const first = result.current.listProps;
    await rerender({});
    expect(result.current.listProps).toBe(first);
  });
});

it('is disabled (no drag) when the list fits on screen', async () => {
  await setup({ contentHeight: 100 });
  expect(mockScrollTo).not.toHaveBeenCalled();
});

describe('while the finger is down', () => {
  // fireGestureHandler always ends the gesture; call the pan callbacks directly to stay mid-drag.
  type Handlers = Record<'onBegin' | 'onUpdate' | 'onFinalize', (e: object) => void>;
  const pan = () => (getByGestureTestId('list-scrubber') as unknown as { handlers: Handlers }).handlers;
  const hold = async (translationY: number) => {
    await act(async () => {
      pan().onBegin({});
      pan().onUpdate({ translationY });
    });
  };
  const release = () => act(async () => pan().onFinalize({}));
  const style = (id: string) =>
    StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);
  const bar = () =>
    StyleSheet.flatten(
      (
        screen
          .getByTestId('list-scrubber-handle', { includeHiddenElements: true })
          .children.at(-1) as unknown as {
          props: { style: ViewStyle };
        }
      ).props.style,
    );

  it('the handle follows the finger, thickens and takes the active colour', async () => {
    await setup();
    await hold(26);
    expect(style('list-scrubber-handle').transform).toEqual([{ translateY: 26 }]);
    expect(bar()).toMatchObject({ width: 8, marginRight: 6, backgroundColor: 'red' }); // (20 − 8) / 2
    await release();
    expect(bar()).toMatchObject({ width: 6, marginRight: 7, backgroundColor: 'gray' });
  });

  it('shows the labelAt bubble, keeps the last label on null, and clears it on release', async () => {
    let next: string | null = 'Jan';
    await setup({ labelAt: () => next });
    await hold(10);
    expect(screen.getByText('Jan', { includeHiddenElements: true })).toBeTruthy();
    next = null;
    await act(async () => pan().onUpdate({ translationY: 20 }));
    expect(screen.getByText('Jan', { includeHiddenElements: true })).toBeTruthy();
    await release();
    expect(screen.queryByText('Jan', { includeHiddenElements: true })).toBeNull();
  });

  it('picks the font size by label length', async () => {
    await setup({ labelAt: (o) => (o < 300 ? 'A' : 'March 2026') });
    await hold(5);
    expect(
      StyleSheet.flatten(screen.getByText('A', { includeHiddenElements: true }).props.style).fontSize,
    ).toBe(24);
    await act(async () => pan().onUpdate({ translationY: 40 }));
    expect(
      StyleSheet.flatten(screen.getByText('March 2026', { includeHiddenElements: true }).props.style)
        .fontSize,
    ).toBe(16);
  });

  it('onSectionChange fires once per section crossed, not for the starting one', async () => {
    const onSectionChange = jest.fn();
    const sections = [
      { offset: 0, label: 'A' },
      { offset: 500, label: 'M' },
      { offset: 800, label: 'Zebra' },
    ];
    await setup({ sections, onSectionChange });
    await hold(5); // still "A"
    expect(onSectionChange).not.toHaveBeenCalled();
    await act(async () => pan().onUpdate({ translationY: 26 })); // "M"
    await act(async () => pan().onUpdate({ translationY: 27 })); // still "M"
    await act(async () => pan().onUpdate({ translationY: 52 })); // "Zebra"
    expect(onSectionChange.mock.calls).toEqual([
      [1, sections[1]],
      [2, sections[2]],
    ]);
  });

  it('onSectionChange is skipped if the section is gone by the time JS runs it', async () => {
    const onSectionChange = jest.fn();
    const sections = [
      { offset: 0, label: 'A' },
      { offset: 500, label: 'M' },
      { offset: 800, label: 'Zebra' },
    ];
    const view = await setup({ sections, onSectionChange });
    await hold(5);
    const uiThread = pan(); // still running with the old offsets
    await view.rerender(
      <ListScrubber {...baseProps} sections={sections.slice(0, 1)} onSectionChange={onSectionChange} />,
    );
    await act(async () => uiThread.onUpdate({ translationY: 52 })); // picks "Zebra", gone on the JS side
    expect(onSectionChange).not.toHaveBeenCalled();
  });

  describe('section bubble', () => {
    const sections = [
      { offset: 0, label: 'A' },
      { offset: 500, label: 'M' },
    ];
    const bubble = () => {
      let node = screen.getByTestId('list-scrubber-label-strip', { includeHiddenElements: true }).parent!;
      while (!StyleSheet.flatten(node.props.style)?.transform) node = node.parent!;
      return StyleSheet.flatten(node.props.style);
    };

    it('is shown only while dragging', async () => {
      await setup({ sections });
      expect(bubble().opacity).toBe(0);
      await hold(10);
      expect(bubble().opacity).toBe(1);
      await release();
      expect(bubble().opacity).toBe(0);
    });

    it('stays inside the list at the bottom', async () => {
      await setup({ sections });
      await hold(900); // handle at the end of its 52pt travel
      // its bottom would overhang by 52 + 48 + 8 − 100 = 8: pushed up by that much
      expect(bubble().transform).toEqual([{ translateY: -8 }]);
    });

    it('is centred on the handle in the middle', async () => {
      await setup({ sections });
      await hold(26);
      expect(bubble().transform).toEqual([{ translateY: 0 }]);
    });
  });
});

describe('SectionLabel line height', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
  ];
  const shiftWith = async (style?: object) => {
    const scrollY = sharedZero();
    scrollY.set(600); // second section: the strip moves up one line
    await render(<SectionLabel scrollY={scrollY} sections={sections} style={style} />);
    const strip = screen.getByTestId('list-scrubber-label-strip', { includeHiddenElements: true });
    return (StyleSheet.flatten(strip.props.style).transform as { translateY: number }[])[0]!.translateY;
  };

  it('uses the style lineHeight', async () => expect(await shiftWith({ lineHeight: 30 })).toBe(-30));
  it('else 1.3 × fontSize, rounded up', async () => expect(await shiftWith({ fontSize: 20 })).toBe(-26));
  it('else 1.3 × 14', async () => expect(await shiftWith()).toBe(-19));
});

it('the visibility reaction ignores repeats', async () => {
  await setup();
  const handle = screen.getByTestId('list-scrubber-handle', { includeHiddenElements: true });
  await act(async () => reactions()[1].react(false, false));
  expect(handle.props.pointerEvents).toBe('none');
});

describe('render cost', () => {
  it('asks labelAt for the screen-reader value only when the position changes', async () => {
    const labelAt = jest.fn(() => 'A');
    const view = await setup({ labelAt });
    const calls = labelAt.mock.calls.length;
    await view.rerender(<ListScrubber {...baseProps} labelAt={labelAt} />);
    expect(labelAt).toHaveBeenCalledTimes(calls);
  });

  it('keeps the same gesture between renders', async () => {
    const view = await setup();
    const first = getByGestureTestId('list-scrubber');
    await view.rerender(<ListScrubber {...baseProps} metrics={{}} />);
    expect(getByGestureTestId('list-scrubber')).toBe(first);
  });

  it('freezes the defaults', () => {
    expect(Object.isFrozen(LIST_SCRUBBER_DEFAULTS.metrics)).toBe(true);
  });
});

describe('API options', () => {
  const style = (id: string) =>
    StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);
  type Handlers = Record<'onBegin' | 'onUpdate' | 'onFinalize', (e: object) => void>;
  const pan = (id = 'list-scrubber') =>
    (getByGestureTestId(id) as unknown as { handlers: Handlers }).handlers;

  it('onDragEnd fires when the finger lifts', async () => {
    const onDragEnd = jest.fn();
    await setup({ onDragEnd });
    await drag(10);
    await act(async () => {});
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it('side="left" mirrors the rail, handle, thumb and bubble', async () => {
    await setup({ side: 'left', edgeOffset: 4, labelAt: () => 'Jan' });
    const rail = screen.getByTestId('list-scrubber-a11y', { includeHiddenElements: true }).parent!;
    expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ left: 4 });
    expect(StyleSheet.flatten(rail.props.style).right).toBeUndefined();
    expect(style('list-scrubber-handle')).toMatchObject({ left: 0 });
    await act(async () => {
      pan().onBegin({});
      pan().onUpdate({ translationY: 10 });
    });
    const handle = screen.getByTestId('list-scrubber-handle', { includeHiddenElements: true });
    const bar = StyleSheet.flatten(
      (handle.children.at(-1) as unknown as { props: { style: ViewStyle } }).props.style,
    );
    expect(bar).toMatchObject({ marginLeft: 6 });
    let bubble = screen.getByText('Jan', { includeHiddenElements: true }).parent!;
    while (!StyleSheet.flatten(bubble.props.style)?.transform) bubble = bubble.parent!;
    expect(StyleSheet.flatten(bubble.props.style)).toMatchObject({ left: 44 + 40 });
  });

  it('insets shrink the rail and the handle travel', async () => {
    await setup({ insets: { top: 10, bottom: 2 } }); // rail 100 − 12 = 88, travel 88 − 48 = 40
    const rail = screen.getByTestId('list-scrubber-a11y', { includeHiddenElements: true }).parent!;
    expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ top: 10, bottom: 2 });
    await drag(20); // half the travel
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 450, false);
  });

  it('enabled={false} draws nothing', async () => {
    await setup({ enabled: false });
    expect(screen.queryByTestId('list-scrubber-a11y', { includeHiddenElements: true })).toBeNull();
  });

  it('testID prefixes every test ID', async () => {
    await setup({ testID: 'contacts', sections: [{ offset: 0, label: 'A' }] });
    expect(getByGestureTestId('contacts')).toBeTruthy();
    for (const id of ['contacts-handle', 'contacts-a11y', 'contacts-label-strip']) {
      expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy();
    }
  });

  it("useListScrubber calls the list's own handlers after its own", async () => {
    const onScroll = jest.fn();
    const onLayout = jest.fn();
    const onContentSizeChange = jest.fn();
    const { result } = await renderHook(() => useListScrubber({ onScroll, onLayout, onContentSizeChange }));
    const layout = { nativeEvent: { layout: { height: 600 } } } as never;
    await act(() => {
      result.current.listProps.onLayout(layout);
      result.current.listProps.onContentSizeChange(390, 12000);
      (result.current.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y: 5 } });
    });
    expect(onLayout).toHaveBeenCalledWith(layout);
    expect(onContentSizeChange).toHaveBeenCalledWith(390, 12000);
    expect(onScroll).toHaveBeenCalledWith({ contentOffset: { y: 5 } });
    expect(result.current.scrubberProps).toMatchObject({ viewportHeight: 600, contentHeight: 12000 });
  });
});
