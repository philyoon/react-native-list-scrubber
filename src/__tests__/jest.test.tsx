import { act, render, renderHook, screen } from '@testing-library/react-native';
import * as mock from '../jest';
import { Platform } from 'react-native';

// The mock must work without these: record any load of them
const mockLoaded: string[] = [];
jest.mock('react-native-reanimated', () => {
  mockLoaded.push('react-native-reanimated');
  return require('react-native-reanimated/mock');
});
jest.mock('react-native-worklets', () => {
  mockLoaded.push('react-native-worklets');
  // Worklets' own mock where it has one (0.7+); older Worklets run as they are under Jest
  try {
    return require('react-native-worklets/src/mock');
  } catch {
    return jest.requireActual('react-native-worklets');
  }
});
jest.mock('react-native-gesture-handler', () => {
  mockLoaded.push('react-native-gesture-handler');
  return jest.requireActual('react-native-gesture-handler');
});

const {
  ListScrubber,
  PinnedSectionHeader,
  CurrentSectionLabel,
  usePinnedSectionHeaderStyle,
  useListScrubber,
} = mock;
const sections = [
  { offset: 0, label: 'A' },
  { offset: 500, label: 'M' },
];
const layout = (height: number) => ({ nativeEvent: { layout: { height } } }) as never;
const layoutEvent = layout;
/** A scroll position the components only read */
const at = (y: number) => ({ get: () => y }) as never;
/** A screen with the hook, its scrubber and a pinned header, measured: 1000 tall in a 100 tall window */
const mountScreen = async (
  options: Parameters<typeof useListScrubber>[0] = {},
  labelAt?: (p: number) => string,
) => {
  let list!: ReturnType<typeof useListScrubber>;
  function Screen() {
    list = useListScrubber(options);
    return (
      <>
        <PinnedSectionHeader {...list.pinnedHeaderProps} height={32} />
        <ListScrubber {...list.scrubberProps} labelAt={labelAt} accessibilityLabel="Scroll position" />
      </>
    );
  }
  await render(<Screen />);
  expect(screen.queryByRole('adjustable')).toBeNull(); // nothing to scrub until the list reports its size
  await act(() => {
    list.listProps.onLayout(layout(100));
    list.listProps.onContentSizeChange(390, 1000);
  });
  const scroll = (y: number) =>
    act(() => (list.listProps.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y } }));
  const value = () => screen.getByRole('adjustable').props['aria-valuetext'];
  return { list: () => list, scroll, value };
};

it('loads no Reanimated, Worklets or Gesture Handler', () => {
  expect(mockLoaded).toEqual([]);
});

describe('ListScrubber', () => {
  const props = { scrollY: at(0), listRef: {} as never, accessibilityLabel: 'Scroll position' };

  it("is the screen-reader control, valued with the first section's label", async () => {
    await render(<ListScrubber {...props} contentHeight={1000} viewportHeight={100} sections={sections} />);
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    expect(el.props['aria-valuetext']).toBe('A');
    expect(el.props.testID).toBe('list-scrubber-a11y');
  });

  it("takes the real one's other props, e.g. maxFontSizeMultiplier", async () => {
    await render(
      <ListScrubber {...props} contentHeight={1000} viewportHeight={100} maxFontSizeMultiplier={1.2} />,
    );
    expect(screen.getByRole('adjustable')).toBeTruthy();
  });

  it('without sections, values a percentage; testID prefixes its test ID', async () => {
    await render(
      <ListScrubber
        {...props}
        contentHeight={1000}
        viewportHeight={100}
        formatAccessibilityPercent={(p) => `${p} percent`}
        testID="contacts"
      />,
    );
    expect(screen.getByTestId('contacts-a11y').props['aria-valuetext']).toBe('0 percent');
  });

  it('defaults to "0%" and reads shared-value heights', async () => {
    const { result } = await renderHook(() => useListScrubber());
    await act(() => {
      result.current.listProps.onLayout(layout(100));
      result.current.listProps.onContentSizeChange(390, 1000);
    });
    await render(<ListScrubber {...result.current.scrubberProps} accessibilityLabel="Scroll position" />);
    expect(screen.getByRole('adjustable').props['aria-valuetext']).toBe('0%');
  });

  it('draws nothing when disabled or with nothing to scrub', async () => {
    const view = await render(
      <ListScrubber {...props} contentHeight={1000} viewportHeight={100} enabled={false} />,
    );
    expect(screen.toJSON()).toBeNull();
    await view.rerender(<ListScrubber {...props} contentHeight={80} viewportHeight={100} />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe('pinned header', () => {
  it("PinnedSectionHeader shows the first section's label under its test IDs", async () => {
    await render(<PinnedSectionHeader scrollY={at(0)} sections={sections} height={32} />);
    expect(screen.getByTestId('list-scrubber-pinned-header')).toBeTruthy();
    expect(screen.getByTestId('list-scrubber-pinned-header-label')).toHaveTextContent('A');
  });

  it('CurrentSectionLabel is empty without sections; the push style is empty', async () => {
    await render(<CurrentSectionLabel scrollY={at(0)} sections={[]} />);
    expect(screen.getByTestId('list-scrubber-section-label')).toHaveTextContent('');
    expect(usePinnedSectionHeaderStyle({} as never, [], 32)).toEqual({});
  });
});

describe('following the scroll position', () => {
  it('the scrubber, its value and the pinned header follow the list', async () => {
    const { list, scroll, value } = await mountScreen({ sections });
    expect(value()).toBe('A');
    await scroll(300);
    expect(value()).toBe('A');
    await scroll(500);
    expect(value()).toBe('M');
    expect(screen.getByTestId('list-scrubber-pinned-header-label')).toHaveTextContent('M');
    await act(() => list().scrollToSection(0));
    expect(value()).toBe('A');
    expect(screen.getByTestId('list-scrubber-pinned-header-label')).toHaveTextContent('A');
  });

  it("without sections, the value is labelAt's label, or a percentage", async () => {
    const percent = await mountScreen();
    await percent.scroll(450);
    expect(percent.value()).toBe('50%');
    await percent.scroll(900);
    expect(percent.value()).toBe('100%');
    const labelled = await mountScreen({}, (position) => `at ${position}`);
    await labelled.scroll(900);
    expect(labelled.value()).toBe('at 999'); // the content offset the label describes: the end;
  });

  it('CurrentSectionLabel picks the section at a position it is given', async () => {
    await render(<CurrentSectionLabel scrollY={at(700)} sections={sections} />);
    expect(screen.getByTestId('list-scrubber-section-label')).toHaveTextContent('M');
  });
});

describe('useListScrubber', () => {
  it("records the list's size and scroll, then calls the list's own handlers", async () => {
    const own = { onScroll: jest.fn(), onLayout: jest.fn(), onContentSizeChange: jest.fn() };
    const { result } = await renderHook(() => useListScrubber(own));
    const { listProps, scrollY, scrubberProps } = result.current;
    const { contentHeight, viewportHeight } = scrubberProps;
    await act(() => {
      listProps.onLayout(layout(600));
      listProps.onContentSizeChange(390, 2000);
      (listProps.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y: 42 } });
    });
    expect([viewportHeight.get(), contentHeight.get(), scrollY.get()]).toEqual([600, 2000, 42]);
    expect(own.onLayout).toHaveBeenCalledWith(layout(600));
    expect(own.onContentSizeChange).toHaveBeenCalledWith(390, 2000);
    expect(own.onScroll).toHaveBeenCalledWith({ contentOffset: { y: 42 } });
    expect(listProps).toMatchObject({ scrollEventThrottle: 16, showsVerticalScrollIndicator: false });
  });

  it('scrollToSection and scrollToOffset set scrollY where the real hook scrolls', async () => {
    const { result } = await renderHook(() => useListScrubber({ sections }));
    await act(() => {
      result.current.listProps.onLayout(layout(600));
      result.current.listProps.onContentSizeChange(390, 2000);
    });
    result.current.scrollToSection(1);
    expect(result.current.scrollY.get()).toBe(500);
    result.current.scrollToSection(9); // no such section: stays put
    expect(result.current.scrollY.get()).toBe(500);
    result.current.scrollToOffset(5000);
    expect(result.current.scrollY.value).toBe(1400);
    result.current.scrollToOffset(-5);
    expect(result.current.scrollY.get()).toBe(0);
  });

  it('carries sections like the real hook, with stable props', async () => {
    const plain = (await renderHook(() => useListScrubber())).result.current;
    expect('sections' in plain.scrubberProps).toBe(false);
    expect(plain.pinnedHeaderProps.sections).toEqual([]);
    const { result, rerender } = await renderHook(() => useListScrubber({ sections }));
    const first = result.current;
    expect(first.scrubberProps.sections).toBe(sections);
    expect(first.pinnedHeaderProps).toEqual({ scrollY: first.scrollY, sections });
    expect(first.scrubberProps.isDragging).toBe(first.isDragging);
    expect(first.isDragging.get()).toBe(false);
    await rerender({});
    expect(result.current.listProps).toBe(first.listProps);
    expect(result.current.scrubberProps).toBe(first.scrubberProps);
    expect(result.current.scrollToSection).toBe(first.scrollToSection);
    expect('getItemLayout' in first.listProps).toBe(false);
  });

  it('takes a layout and places it like the real hook', async () => {
    const layout = mock.listLayout(['Ada', 'Ben'], { sectionLabel: (n) => n[0]!, itemHeight: 64 });
    const { result } = await renderHook(() =>
      useListScrubber({
        layout,
        topBar: { height: 100 },
        pinnedHeader: { height: 32 },
        ListHeaderComponent: <mock.CurrentSectionLabel scrollY={at(600)} sections={sections} />,
      }),
    );
    const r = result.current;
    expect(r.spacerHeight).toBe(132);
    expect(r.scrubberProps.sections).toEqual([
      { offset: 0, label: 'A' },
      { offset: 196, label: 'B' },
    ]);
    expect(r.scrubberProps.insets).toEqual({ top: 32 });
    expect(r.pinnedHeaderProps).toMatchObject({ height: 32, push: false });
    expect(r.flatListProps.getItemLayout!(null, 1)).toEqual({ length: 64, offset: 196, index: 1 });
    expect(r.flashListProps.ListHeaderComponent).toBe(r.ListHeader);
    expect(r.scrollViewProps).toBe(r.listProps);
    const { ListHeader } = r;
    await render(<ListHeader />);
    expect(screen.getByTestId('list-scrubber-spacer')).toHaveStyle({ height: 132 });
    expect(screen.getByTestId('list-scrubber-section-label')).toHaveTextContent('M');
    // Scrolling from code lands below the bar and the pinned header, which always show in full here
    await act(() => {
      r.listProps.onLayout(layoutEvent(600));
      r.listProps.onContentSizeChange(390, 2000);
    });
    r.scrollToSection(1);
    expect(r.scrollY.get()).toBe(64);
  });

  it('draws your own list header, without a spacer when nothing is over the list', async () => {
    const { result } = await renderHook(() =>
      useListScrubber({
        ListHeaderComponent: () => <mock.CurrentSectionLabel scrollY={at(0)} sections={sections} />,
      }),
    );
    const { ListHeader, flatListProps, sectionListProps, legendListProps } = result.current;
    expect([flatListProps, sectionListProps, legendListProps].map((p) => p.ListHeaderComponent)).toEqual([
      ListHeader,
      ListHeader,
      ListHeader,
    ]);
    await render(<ListHeader />);
    expect(screen.queryByTestId('list-scrubber-spacer')).toBeNull();
    expect(screen.getByTestId('list-scrubber-section-label')).toHaveTextContent('A');
  });

  it('shared values take a value or an updater, and expose `value`', async () => {
    const { scrollY } = (await renderHook(() => useListScrubber())).result.current;
    scrollY.set((y) => y + 10);
    scrollY.value = scrollY.value * 2;
    expect(scrollY.get()).toBe(20);
  });
});

describe('useListScrubber({ topBar })', () => {
  it('always shows the bar in full; the pinned header sits below it and names the rows there', async () => {
    let list!: ReturnType<typeof useListScrubber>;
    function Screen() {
      list = useListScrubber({ sections, topBar: { height: 100, revealMs: 400 } });
      return <PinnedSectionHeader {...list.pinnedHeaderProps} height={32} />;
    }
    await render(<Screen />);
    expect(list.topBar!.visibleHeight.get()).toBe(100);
    expect(list.scrubberProps.topBar).toBe(list.topBar);
    expect(list.pinnedHeaderProps.top).toBe(list.topBar!.visibleHeight);
    expect(list.topBarProps.style[0]).toMatchObject({ position: 'absolute', height: 100 });
    expect(list.topBar!.isFixed.get()).toBe(true);
    // 450 + 100: the rows just below the bar are in M (from 500)
    await act(() =>
      (list.listProps.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y: 450 } }),
    );
    expect(screen.getByTestId('list-scrubber-pinned-header-label')).toHaveTextContent('M');
    list.topBar!.visibleHeight.set(0);
    list.topBar!.show();
    expect(list.topBar!.visibleHeight.get()).toBe(100);
    list.topBar!.hide(); // it stays in place, as it's fixed
    expect(list.topBar!.visibleHeight.get()).toBe(100);
    list.pinnedHeaderProps.scrollY.set(0); // read-only, like a derived value
    expect(list.pinnedHeaderProps.scrollY.get()).toBe(550);
  });

  it('scrolls a section to just below the bar; on the web, focus inside it brings it back', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      const { result } = await renderHook(() => useListScrubber({ sections, topBar: { height: 100 } }));
      const list = result.current;
      await act(() => {
        list.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
        list.listProps.onContentSizeChange(390, 2000);
      });
      list.scrollToSection(1);
      expect(list.scrollY.get()).toBe(400);
      expect(list.topBarProps.onFocus).toBe(list.topBar!.show);
    } finally {
      os.restore();
    }
  });
});

// Typechecked: every export has the real one's type
export const typed: typeof import('../index') = mock;

it('exports everything the real package does', () => {
  // Last: loading the real package loads Reanimated
  expect(Object.keys(mock).sort()).toEqual(Object.keys(jest.requireActual('../index')).sort());
});
