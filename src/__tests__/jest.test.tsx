import { act, render, renderHook, screen } from '@testing-library/react-native';
import * as mock from '../jest';

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

it('loads no Reanimated, Worklets or Gesture Handler', () => {
  expect(mockLoaded).toEqual([]);
});

describe('ListScrubber', () => {
  const props = { scrollY: {} as never, listRef: {} as never, accessibilityLabel: 'Scroll position' };

  it("is the screen-reader control, valued with the first section's label", async () => {
    await render(<ListScrubber {...props} contentHeight={1000} viewportHeight={100} sections={sections} />);
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    expect(el.props['aria-valuetext']).toBe('A');
    expect(el.props.testID).toBe('list-scrubber-a11y');
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
    await render(<PinnedSectionHeader scrollY={{} as never} sections={sections} height={32} />);
    expect(screen.getByTestId('list-scrubber-pinned-header')).toBeTruthy();
    expect(screen.getByTestId('list-scrubber-pinned-header-label')).toHaveTextContent('A');
  });

  it('CurrentSectionLabel is empty without sections; the push style is empty', async () => {
    await render(<CurrentSectionLabel scrollY={{} as never} sections={[]} />);
    expect(screen.getByTestId('list-scrubber-section-label')).toHaveTextContent('');
    expect(usePinnedSectionHeaderStyle({} as never, [], 32)).toEqual({});
  });
});

describe('useListScrubber', () => {
  it("records the list's size and scroll, then calls the list's own handlers", async () => {
    const own = { onScroll: jest.fn(), onLayout: jest.fn(), onContentSizeChange: jest.fn() };
    const { result } = await renderHook(() => useListScrubber(own));
    const { listProps, scrollY, contentHeight, viewportHeight } = result.current;
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
    expect(plain.headerProps.sections).toEqual([]);
    const { result, rerender } = await renderHook(() => useListScrubber({ sections }));
    const first = result.current;
    expect(first.scrubberProps.sections).toBe(sections);
    expect(first.headerProps).toEqual({ scrollY: first.scrollY, sections });
    await rerender({});
    expect(result.current.listProps).toBe(first.listProps);
    expect(result.current.scrubberProps).toBe(first.scrubberProps);
    expect(result.current.scrollToSection).toBe(first.scrollToSection);
  });

  it('shared values take a value or an updater, and expose `value`', async () => {
    const { scrollY } = (await renderHook(() => useListScrubber())).result.current;
    scrollY.set((y) => y + 10);
    scrollY.value = scrollY.value * 2;
    expect(scrollY.get()).toBe(20);
  });
});

// Typechecked: every export has the real one's type
export const typed: typeof import('../index') = mock;

it('exports everything the real package does', () => {
  // Last: loading the real package loads Reanimated
  expect(Object.keys(mock).sort()).toEqual(Object.keys(jest.requireActual('../index')).sort());
});
