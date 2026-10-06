import { baseProps, drag, mockScrollTo, setup, sharedZero } from './support';
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
    const fontSize = (text: string) =>
      StyleSheet.flatten(screen.getByText(text, { includeHiddenElements: true }).props.style).fontSize;
    expect(fontSize('A')).toBe(24);
    expect(fontSize('Zebra')).toBe(16);
    expect(screen.getByText('Zebra', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(1.5);
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

  it('defaults to the left edge in RTL layouts', async () => {
    const rtl = jest.replaceProperty(I18nManager, 'isRTL', true);
    try {
      await setup();
      const rail = screen.getByTestId('list-scrubber-a11y', { includeHiddenElements: true }).parent!;
      expect(StyleSheet.flatten(rail.props.style)).toMatchObject({ left: 0 });
      expect(StyleSheet.flatten(rail.props.style).right).toBeUndefined();
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
    for (const id of ['contacts-thumb', 'contacts-a11y', 'contacts-label-strip']) {
      expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy();
    }
  });
});
