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
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return { ...mock, scrollTo: (...args: unknown[]) => mockScrollTo(...args) };
});

/** A shared value stand-in with get/set */
function sharedZero() {
  let v = 0;
  return { value: 0, get: () => v, set: (n: number) => (v = n) } as unknown as SharedValue<number>;
}

const colors = { thumb: 'gray', thumbActive: 'red', bubble: 'black', bubbleText: 'white' };

// List 1,000 tall in a 100 viewport: the 48 handle travels 100 - 48 = 52.
function setup(props: Partial<ListScrubberProps> = {}) {
  return render(
    <ListScrubber
      scrollY={sharedZero()}
      listRef={(() => null) as never}
      contentHeight={1000}
      viewportHeight={100}
      colors={colors}
      accessibilityLabel="Scroll position"
      {...props}
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

beforeEach(() => mockScrollTo.mockClear());

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
    await setup({ sections, labelAt });
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
