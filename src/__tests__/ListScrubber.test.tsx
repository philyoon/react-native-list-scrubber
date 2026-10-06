import {
  baseProps,
  drag,
  goIdle,
  mockReactions,
  mockScrollTo,
  reactions,
  sectionText,
  setup,
  sharedZero,
} from './support';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { I18nManager, StyleSheet, type ViewStyle } from 'react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { LIST_SCRUBBER_DEFAULTS, ListScrubber } from '../index';

it('dragging scrolls the list in proportion and asks for the label at that spot', async () => {
  // fireGestureHandler always ends the gesture, so the bubble is gone afterwards: check what was asked.
  const labelAt = jest.fn((offset: number) => `at ${Math.round(offset)}`);
  const onDragStart = jest.fn();
  await setup({ labelAt, onDragStart });
  await drag(26); // half of 52
  expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 450, false); // (1000 - 100) / 2
  await act(async () => {}); // the label is drawn on the JS thread
  expect(labelAt).toHaveBeenCalledWith(500, 450); // the position to describe (see labelPosition), the scroll offset
  expect(onDragStart).toHaveBeenCalledTimes(1);
  await drag(900); // past the end: clamps
  expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 900, false);
});

it('draws nothing when the list fits on screen', async () => {
  await setup({ contentHeight: 80 });
  expect(screen.queryByTestId('list-scrubber-thumb', { includeHiddenElements: true })).toBeNull();
});

it('takes size overrides and keeps the other defaults', async () => {
  await setup({ metrics: { thumbLength: 80 } });
  const thumb = screen.getByTestId('list-scrubber-thumb', { includeHiddenElements: true });
  expect(StyleSheet.flatten(thumb.props.style).height).toBe(80);
  const bar = thumb.children.at(-1) as unknown as { props: { style: ViewStyle } };
  expect(StyleSheet.flatten(bar.props.style)!.width).toBe(LIST_SCRUBBER_DEFAULTS.metrics.thumbWidth);
});

it('a longer thumb shortens the travel', async () => {
  await setup({ metrics: { thumbLength: 50 } }); // travel 50
  await drag(25);
  expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 450, false);
});

describe('sections', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
    { offset: 800, label: 'Zebra' },
  ];

  it('shows the section label on the UI thread and never asks labelAt', async () => {
    const labelAt = jest.fn(() => 'js');
    await setup({ sections, labelAt: labelAt as never }); // the types forbid both; check it at runtime too
    await drag(26);
    await act(async () => {});
    expect(labelAt).not.toHaveBeenCalled();
    expect(sectionText('list-scrubber-label').text).toBe('A');
  });

  it('draws one text field, whatever the number of sections, as wide as the widest label', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ offset: i * 10, label: `S${i % 150}` }));
    const view = await setup({ sections: many, contentHeight: 20000 });
    expect(screen.getAllByTestId('list-scrubber-label', { includeHiddenElements: true })).toHaveLength(1);
    // Every distinct label is laid out once, invisibly: the widest gives the bubble its width
    const copies = () => screen.queryAllByText(/^S\d+$/, { includeHiddenElements: true });
    expect(copies()).toHaveLength(0); // not while the list first renders: once the app is idle
    await goIdle();
    expect(copies()).toHaveLength(150);
    const sizer = copies()[0]!.parent!;
    expect(StyleSheet.flatten(sizer.props.style)).toMatchObject({ height: 0, alignSelf: 'flex-start' });
    await fireEvent(sizer, 'layout', { nativeEvent: { layout: { width: 41.2, height: 0 } } });
    // Measured: the copies are gone, and a spacer keeps the width (rounded up, so nothing is clipped)
    expect(copies()).toHaveLength(0);
    const label = sectionText('list-scrubber-label').field.parent!;
    expect(
      label.children.map((c) => typeof c !== 'string' && StyleSheet.flatten(c.props.style)),
    ).toContainEqual({ width: 42 });
    // Same labels in a new array: nothing to measure
    const props = { ...baseProps, contentHeight: 20000 };
    await view.rerender(<ListScrubber {...props} sections={many.slice(0, 200)} />);
    await goIdle();
    expect(copies()).toHaveLength(0);
    // Another page: only its new labels are laid out, and the width only grows
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        offset: 3000 + (from + i) * 10,
        label: `S${150 + from + i}`,
      }));
    const layout = (width: number) =>
      fireEvent(copies()[0]!.parent!, 'layout', { nativeEvent: { layout: { width, height: 0 } } });
    const spacer = () =>
      sectionText('list-scrubber-label')
        .field.parent!.children.map((c) => typeof c !== 'string' && StyleSheet.flatten(c.props.style))
        .find((st) => st && 'width' in st);
    const twoPages = [...many, ...page(0, 10)];
    await view.rerender(<ListScrubber {...props} sections={twoPages} />);
    await goIdle();
    expect(copies().map((c) => c.props.children)).toEqual(page(0, 10).map((p) => p.label));
    await layout(30); // narrower than before: the bubble keeps the widest
    expect(copies()).toHaveLength(0);
    expect(spacer()).toEqual({ width: 42 });
    await view.rerender(<ListScrubber {...props} sections={[...twoPages, ...page(10, 5)]} />);
    await goIdle();
    expect(copies()).toHaveLength(5);
    await layout(50);
    expect(spacer()).toEqual({ width: 50 });
    // A new text style: every label again
    await view.rerender(
      <ListScrubber
        {...props}
        sections={[...twoPages, ...page(10, 5)]}
        bubbleTextStyle={{ fontFamily: 'Serif' }}
      />,
    );
    await goIdle();
    expect(copies()).toHaveLength(165);
  });

  it('labels that change while being measured get a fresh view, which reports its layout again', async () => {
    const first = [{ offset: 0, label: 'A' }];
    const view = await setup({ sections: first });
    // The thumb shows: the labels are measured now, and go on being measured as they change
    await act(async () => reactions()[1].react(true, false));
    const sizer = screen.getByText('A', { includeHiddenElements: true }).parent!;
    const next = [...first, { offset: 500, label: 'B' }];
    await view.rerender(<ListScrubber {...baseProps} sections={next} />);
    // A view that stays mounted reports its layout only if its size changes: B could be as wide as A
    expect(screen.getByText('B', { includeHiddenElements: true }).parent).not.toBe(sizer);
  });

  it('measures with requestIdleCallback where there is one, and cancels it on unmount', async () => {
    const callbacks: (() => void)[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    g.requestIdleCallback = jest.fn((fn: () => void) => callbacks.push(fn));
    g.cancelIdleCallback = jest.fn();
    try {
      const view = await setup({ sections: [{ offset: 0, label: 'Jan' }] });
      expect(g.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
      await act(async () => callbacks[0]!());
      expect(screen.queryAllByText('Jan', { includeHiddenElements: true })).toHaveLength(1);
      await view.unmount();
      expect(g.cancelIdleCallback).toHaveBeenCalledWith(1);
    } finally {
      delete g.requestIdleCallback;
      delete g.cancelIdleCallback;
    }
  });

  it('measures the labels as soon as the thumb shows, if the app was never idle', async () => {
    await setup({ sections: [{ offset: 0, label: 'Jan' }] });
    const copies = () => screen.queryAllByText('Jan', { includeHiddenElements: true });
    expect(copies()).toHaveLength(0);
    // the thumb takes touches only once shown, so this is before any drag can start
    await act(async () => reactions()[1].react(true, false));
    expect(copies()).toHaveLength(1);
  });

  it('screen readers step section by section and hear the section label', async () => {
    await setup({ sections });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    expect(el.props['aria-valuetext']).toBe('A');
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
    expect(el.props['aria-valuetext']).toBe('M');
  });
});

describe('layout', () => {
  const style = (id: string) =>
    StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);

  it('places the thumb by scroll position', async () => {
    const scrollY = sharedZero();
    scrollY.set(450); // half of 900
    await setup({ scrollY });
    expect(style('list-scrubber-thumb').transform).toEqual([{ translateY: 26 }]); // half of 52
  });

  it('clamps the thumb when the list overscrolls', async () => {
    const scrollY = sharedZero();
    scrollY.set(-80);
    await setup({ scrollY });
    expect(style('list-scrubber-thumb').transform).toEqual([{ translateY: 0 }]);
    scrollY.set(5000);
    await setup({ scrollY });
    expect(
      screen.getAllByTestId('list-scrubber-thumb', { includeHiddenElements: true }).at(-1)!.props.style,
    ).toBeTruthy();
  });

  it('the screen-reader control covers the thumb strip, as wide as the touch area', async () => {
    await setup();
    const rail = screen.getByTestId('list-scrubber-a11y', { includeHiddenElements: true }).parent!;
    expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ right: 0, width: 44 });
    expect(style('list-scrubber-a11y')).toMatchObject({ position: 'absolute', top: 0, bottom: 0 });
  });

  it('keeps the section bubble inside the list at the top', async () => {
    await setup({ sections: [{ offset: 0, label: 'A' }] });
    // at rest the thumb is at the top: the 64pt bubble is pushed down by (64 − 48) / 2
    let bubble = sectionText('list-scrubber-label').field.parent!;
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
  const label = () => sectionText('list-scrubber-label');

  it('shows the section under the finger, sized by its length', async () => {
    // The mock draws animated props only on render, so re-render the label to read the UI-thread state
    // after a drag. It's memoized, so it needs new props: a new text style (by value) does it.
    const view = await setup({ sections });
    let renders = 0;
    const again = () =>
      view.rerender(
        <ListScrubber {...baseProps} sections={sections} bubbleTextStyle={{ letterSpacing: ++renders }} />,
      );
    expect(label()).toMatchObject({ text: 'A', style: { fontSize: 24 } });
    await drag(26); // offset 450, probe 500 → "M"
    await again();
    expect(label()).toMatchObject({ text: 'M', style: { fontSize: 24 } });
    await drag(900); // the end → the last section, though it is shorter than a screen
    await again();
    expect(label()).toMatchObject({ text: 'Zebra', style: { fontSize: 16 } });
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
          .getByTestId('list-scrubber-thumb', { includeHiddenElements: true })
          .children.at(-1) as unknown as {
          props: { style: ViewStyle };
        }
      ).props.style,
    );

  it('the thumb follows the finger, thickens and takes the active colour', async () => {
    await setup();
    await hold(26);
    expect(style('list-scrubber-thumb').transform).toEqual([{ translateY: 26 }]);
    expect(bar()).toMatchObject({ width: 8, backgroundColor: 'red' });
    await release();
    expect(bar()).toMatchObject({ width: 6, backgroundColor: 'gray' });
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

  it('while JS is busy, labelAt gets the first and the newest drag frame, not every frame', async () => {
    const labelAt = jest.fn((_position: number, offset: number) => `at ${Math.round(offset)}`);
    await setup({ labelAt });
    const dragCalls = () => labelAt.mock.calls.filter(([, offset]) => offset > 0);
    // Ten frames before JS gets to run: one synchronous block, so no microtask (JS call) runs in between
    await act(async () => {
      pan().onBegin({});
      for (let y = 1; y <= 10; y++) pan().onUpdate({ translationY: y * 5 });
    });
    expect(dragCalls()).toHaveLength(1); // the first frame; the rest wait for its acknowledgement
    await act(() => jest.advanceTimersByTime(20)); // the UI thread hears back and sends the newest
    expect(dragCalls()).toHaveLength(2);
    const newest = dragCalls().at(-1)![1];
    expect(newest).toBeCloseTo((50 / 52) * 900); // translation 50 of 52 → offset of 900
    expect(screen.getByText(`at ${Math.round(newest)}`, { includeHiddenElements: true })).toBeTruthy();
    await act(() => jest.advanceTimersByTime(20)); // nothing newer: the handshake stands down
    expect(dragCalls()).toHaveLength(2);
  });

  it('picks the font size by label length', async () => {
    await setup({ labelAt: (o) => (o < 300 ? 'A' : 'March 2026') });
    await hold(5);
    expect(
      StyleSheet.flatten(screen.getByText('A', { includeHiddenElements: true }).props.style).fontSize,
    ).toBe(24);
    await act(async () => pan().onUpdate({ translationY: 40 }));
    // The first label is still being acknowledged: the newest offset follows once the UI thread hears back
    await act(() => jest.advanceTimersByTime(20));
    expect(
      StyleSheet.flatten(screen.getByText('March 2026', { includeHiddenElements: true }).props.style)
        .fontSize,
    ).toBe(16);
  });

  it('caps bubble text at 1.5× the system text size, so it fits the bubble', async () => {
    await setup({ labelAt: () => 'Jan' });
    await hold(10);
    expect(screen.getByText('Jan', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(1.5);
  });

  it('sizes each section label by its own length', async () => {
    await setup({
      sections: [
        { offset: 0, label: 'A' },
        { offset: 500, label: 'Zebra' },
      ],
    });
    await goIdle();
    // the shown label (the first section at rest), and the invisible copies that size the bubble
    expect(sectionText('list-scrubber-label').style.fontSize).toBe(24);
    expect(sectionText('list-scrubber-label').field.props.maxFontSizeMultiplier).toBe(1.5);
    const sizer = (text: string) => screen.getByText(text, { includeHiddenElements: true });
    expect(StyleSheet.flatten(sizer('A').props.style).fontSize).toBe(24);
    expect(StyleSheet.flatten(sizer('Zebra').props.style).fontSize).toBe(16);
    expect(sizer('Zebra').props.maxFontSizeMultiplier).toBe(1.5);
  });

  it('a fontSize in bubbleTextStyle sizes every section label alike', async () => {
    await setup({
      sections: [
        { offset: 0, label: 'A' },
        { offset: 500, label: 'Zebra' },
      ],
      bubbleTextStyle: { fontSize: 18 },
    });
    await goIdle();
    expect(sectionText('list-scrubber-label').style.fontSize).toBe(18);
    expect(
      StyleSheet.flatten(screen.getByText('Zebra', { includeHiddenElements: true }).props.style).fontSize,
    ).toBe(18);
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
      let node = sectionText('list-scrubber-label').field.parent!;
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
      await hold(900); // thumb at the end of its 52pt travel
      // its bottom would overhang by 52 + 48 + 8 − 100 = 8: pushed up by that much
      expect(bubble().transform).toEqual([{ translateY: -8 }]);
    });

    it('is centred on the thumb in the middle', async () => {
      await setup({ sections });
      await hold(26);
      expect(bubble().transform).toEqual([{ translateY: 0 }]);
    });
  });
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

  it('side="left" mirrors the rail, thumb and bubble', async () => {
    await setup({ side: 'left', edgeOffset: 4, labelAt: () => 'Jan' });
    const rail = screen.getByTestId('list-scrubber-a11y', { includeHiddenElements: true }).parent!;
    expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ left: 4 });
    expect(StyleSheet.flatten(rail.props.style).right).toBeUndefined();
    expect(style('list-scrubber-thumb')).toMatchObject({ left: 0 });
    await act(async () => {
      pan().onBegin({});
      pan().onUpdate({ translationY: 10 });
    });
    let bubble = screen.getByText('Jan', { includeHiddenElements: true }).parent!;
    while (!StyleSheet.flatten(bubble.props.style)?.transform) bubble = bubble.parent!;
    expect(StyleSheet.flatten(bubble.props.style)).toMatchObject({ left: 44 + 40 });
  });

  it.each(['left', 'right'] as const)(
    'side="%s": the bubble is placed with left/right only, so RTL mirroring moves it with the thumb',
    async (side) => {
      await setup({ side, labelAt: () => 'Jan' });
      await act(async () => {
        pan().onBegin({});
        pan().onUpdate({ translationY: 10 });
      });
      let box = screen.getByText('Jan', { includeHiddenElements: true }).parent!;
      while (!StyleSheet.flatten(box.props.style)?.backgroundColor) box = box.parent!;
      // Flex alignment flips with the layout direction even where left/right don't (web), which once put
      // the bubble off-screen in RTL; so neither the bubble nor its anchor may use it
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({ position: 'absolute', [side]: 0 });
      expect(StyleSheet.flatten(box.parent!.props.style).alignItems).toBeUndefined();
    },
  );

  it('draws with default colours, overridable one by one', async () => {
    const thumbColor = () =>
      StyleSheet.flatten(
        (
          screen
            .getByTestId('list-scrubber-thumb', { includeHiddenElements: true })
            .children.at(-1) as unknown as {
            props: { style: ViewStyle };
          }
        ).props.style,
      )!.backgroundColor;
    const view = await setup({ colors: undefined });
    expect(thumbColor()).toBe(LIST_SCRUBBER_DEFAULTS.colors.thumb);
    await view.rerender(<ListScrubber {...baseProps} colors={{ thumb: 'pink' }} />);
    expect(thumbColor()).toBe('pink');
  });

  it('takes the heights as shared values and re-renders when they change', async () => {
    const contentHeight = sharedZero();
    const viewportHeight = sharedZero();
    contentHeight.set(80);
    viewportHeight.set(100);
    await setup({ contentHeight, viewportHeight });
    // Content shorter than the viewport: nothing to scrub
    expect(screen.queryByTestId('list-scrubber-a11y', { includeHiddenElements: true })).toBeNull();
    // Each render adds the two height mirrors, then the two fade reactions
    const contentMirror = mockReactions.at(-4)!;
    contentHeight.set(1000);
    expect(contentMirror.prepare()).toBe(1000);
    await act(async () => contentMirror.react(1000, 80));
    expect(screen.getByTestId('list-scrubber-a11y', { includeHiddenElements: true })).toBeTruthy();
    // An unchanged value schedules nothing
    await act(async () => contentMirror.react(1000, 1000));
    expect(screen.getByTestId('list-scrubber-a11y', { includeHiddenElements: true })).toBeTruthy();
  });

  it("defaults to 'right' in RTL layouts too: React Native mirrors it to the left edge", async () => {
    // On iOS and Android, React Native swaps left/right in RTL by default, so 'right' already lands on the
    // left edge; defaulting to 'left' in RTL would be mirrored back to the right
    const rtl = jest.replaceProperty(I18nManager, 'isRTL', true);
    try {
      await setup();
      const rail = screen.getByTestId('list-scrubber-a11y', { includeHiddenElements: true }).parent!;
      expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ right: 0 });
      expect(StyleSheet.flatten(rail.props.style).left).toBeUndefined();
    } finally {
      rtl.restore();
    }
  });

  it('insets shrink the rail and the thumb travel', async () => {
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
    for (const id of ['contacts-thumb', 'contacts-a11y', 'contacts-label']) {
      expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy();
    }
  });
});
