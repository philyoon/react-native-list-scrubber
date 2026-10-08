import { mockScrollTo } from './support';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { listLayout, sectionListLayout, useListScrubber } from '../index';
import { resetWarnings } from '../validate';

// Rows 64 tall: A at 0 (two rows), B at 128
const names = ['Ada', 'Abby', 'Ben'];
const flat = (itemHeight = 64) => listLayout(names, { sectionLabel: (n) => n[0]!, itemHeight });
// A header 32 tall, then its rows: A at 0, B at 32 + 2 × 64 = 160
const grouped = () =>
  sectionListLayout(
    [
      { title: 'A', data: ['Ada', 'Abby'] },
      { title: 'B', data: ['Ben'] },
    ],
    { itemHeight: 64, sectionHeaderHeight: 32 },
  );
const uiFrame = () => act(() => jest.advanceTimersByTime(20)); // scrolls run on the UI thread

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  resetWarnings();
});
afterEach(() => warn.mockRestore());

describe('useListScrubber({ layout })', () => {
  it("carries the layout's sections, and its getItemLayout in the FlatList and SectionList spreads only", async () => {
    const layout = flat();
    const { result } = await renderHook(() => useListScrubber({ layout }));
    const r = result.current;
    expect(r.scrubberProps.sections).toBe(layout.sections);
    expect(r.pinnedHeaderProps.sections).toBe(layout.sections);
    expect(r.flatListProps.getItemLayout!(null, 2)).toEqual({ length: 64, offset: 128, index: 2 });
    expect(r.sectionListProps).toBe(r.flatListProps);
    for (const props of [r.listProps, r.flashListProps, r.legendListProps, r.scrollViewProps]) {
      expect('getItemLayout' in props).toBe(false);
    }
    // Nothing over the list: no spacer, no header
    expect(r.spacerHeight).toBe(0);
    expect('ListHeaderComponent' in r.flatListProps).toBe(false);
    expect('ListHeaderComponent' in r.flashListProps).toBe(false);
    expect(r.scrollViewProps).toBe(r.listProps);
  });

  it('keeps the spreads when the layout is rebuilt; getItemLayout reads the latest one', async () => {
    let layout = flat();
    const { result, rerender } = await renderHook(() => useListScrubber({ layout }));
    const { flatListProps, scrubberProps } = result.current;
    layout = flat(); // the same rows: the same sections
    await rerender({});
    expect(result.current.flatListProps).toBe(flatListProps);
    expect(result.current.scrubberProps.sections).toBe(scrubberProps.sections);
    layout = flat(80);
    await rerender({});
    expect(result.current.flatListProps).toBe(flatListProps); // the list isn't re-rendered for it
    expect(flatListProps.getItemLayout!(null, 2)).toEqual({ length: 80, offset: 160, index: 2 });
    expect(result.current.scrubberProps.sections).not.toBe(scrubberProps.sections);
  });

  it('warns once when the layout is rebuilt on every render', async () => {
    const { rerender } = await renderHook(() => useListScrubber({ layout: flat() }));
    await rerender({});
    await rerender({});
    await rerender({});
    const calls = warn.mock.calls.filter((c) => String(c[0]).includes('Wrap what builds them in useMemo'));
    expect(calls).toHaveLength(1);
  });
});

describe('a top bar over a layout', () => {
  it('places the layout below it: the first section stays at 0, the rest move down', async () => {
    const { result } = await renderHook(() => useListScrubber({ layout: flat(), topBar: { height: 100 } }));
    const r = result.current;
    expect(r.spacerHeight).toBe(100);
    expect(r.scrubberProps.sections).toEqual([
      { offset: 0, label: 'A' },
      { offset: 228, label: 'B' },
    ]);
    expect(r.flatListProps.getItemLayout!(null, 2)).toEqual({ length: 64, offset: 228, index: 2 });
  });

  it('gives FlatList, SectionList, FlashList and Legend List the list header; ScrollView and listProps none', async () => {
    const { result } = await renderHook(() => useListScrubber({ layout: flat(), topBar: { height: 100 } }));
    const r = result.current;
    for (const props of [r.flatListProps, r.sectionListProps, r.flashListProps, r.legendListProps]) {
      expect(props.ListHeaderComponent).toBe(r.ListHeader);
    }
    expect('ListHeaderComponent' in r.listProps).toBe(false);
    expect(r.scrollViewProps).toBe(r.listProps);
  });
});

describe('a pinned header', () => {
  it('over a flat list takes its own space: the spacer, the scrubber and scrolling allow for it', async () => {
    const { result, rerender } = await renderHook(() =>
      useListScrubber({ layout: flat(), pinnedHeader: { height: 32 } }),
    );
    const r = result.current;
    expect(r.spacerHeight).toBe(32);
    expect(r.pinnedHeaderProps).toMatchObject({ height: 32, push: false });
    expect(r.scrubberProps.insets).toEqual({ top: 32 });
    expect(r.scrubberProps.sections[1]).toEqual({ offset: 160, label: 'B' });
    // It names the rows just below it
    r.scrollY.set(100);
    await rerender({}); // a derived value: the mock computes it on render
    expect(result.current.pinnedHeaderProps.scrollY.get()).toBe(132);
    // A jump lands B's first row just below it
    await act(() => {
      r.listProps.onLayout({ nativeEvent: { layout: { height: 100 } } } as never);
      r.listProps.onContentSizeChange(390, 1000);
    });
    r.scrollToSection(1);
    await uiFrame();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 128, false);
  });

  it("over a SectionList sits on the list's own headers: no space, and the next one pushes it out", async () => {
    const { result } = await renderHook(() =>
      useListScrubber({ layout: grouped(), pinnedHeader: { height: 32 } }),
    );
    const r = result.current;
    expect(r.spacerHeight).toBe(0);
    expect(r.pinnedHeaderProps).toMatchObject({ height: 32, push: true });
    expect('insets' in r.scrubberProps).toBe(false);
    expect(r.scrubberProps.sections[1]).toEqual({ offset: 160, label: 'B' });
    expect(r.pinnedHeaderProps.scrollY).toBe(r.scrollY);
  });

  it('with a top bar over a SectionList: the space is the bar only', async () => {
    const { result } = await renderHook(() =>
      useListScrubber({
        layout: grouped(),
        topBar: { height: 100 },
        pinnedHeader: { height: 32 },
      }),
    );
    expect(result.current.spacerHeight).toBe(100);
    expect(result.current.scrubberProps.sections[1]).toEqual({ offset: 260, label: 'B' });
  });

  it("with hand-made sections: they're never moved; push says whether it takes space", async () => {
    const sections = [
      { offset: 0, label: 'A' },
      { offset: 500, label: 'M' },
    ];
    const over = (await renderHook(() => useListScrubber({ sections, pinnedHeader: { height: 32 } }))).result
      .current;
    expect(over.spacerHeight).toBe(0); // by default the list has headers of its own
    expect(over.pinnedHeaderProps.push).toBe(true);
    const own = (
      await renderHook(() => useListScrubber({ sections, pinnedHeader: { height: 32, push: false } }))
    ).result.current;
    expect(own.spacerHeight).toBe(32);
    expect(own.scrubberProps.sections).toBe(sections);
  });
});

describe('the list header', () => {
  it('draws the spacer, then your own header, and keeps its identity as they change', async () => {
    let topBar = { height: 100 };
    const { result, rerender } = await renderHook(() =>
      useListScrubber({
        layout: flat(),
        topBar,
        ListHeaderComponent: <Text>Profile</Text>,
      }),
    );
    const { ListHeader } = result.current;
    const view = await render(<ListHeader />);
    expect(view.getByTestId('list-scrubber-spacer')).toHaveStyle({ height: 100 });
    expect(view.getByText('Profile')).toBeTruthy();
    topBar = { height: 120 };
    await rerender({});
    expect(result.current.ListHeader).toBe(ListHeader);
    expect(view.getByTestId('list-scrubber-spacer')).toHaveStyle({ height: 120 });
  });

  it('takes your header as a component too, and gives it to the lists even with nothing over them', async () => {
    function Profile() {
      return <Text>Profile</Text>;
    }
    const { result } = await renderHook(() =>
      useListScrubber({ layout: flat(), ListHeaderComponent: Profile }),
    );
    expect(result.current.flatListProps.ListHeaderComponent).toBe(result.current.ListHeader);
    const { ListHeader } = result.current;
    await render(<ListHeader />);
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.queryByTestId('list-scrubber-spacer')).toBeNull();
  });

  it("warns when there's a spacer to draw but it never is", async () => {
    await renderHook(() => useListScrubber({ layout: flat(), topBar: { height: 100 } }));
    await act(() => jest.advanceTimersByTime(3000));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("spacer for its top bar or pinned header isn't drawn");
  });

  it('stays quiet once the spacer is drawn, without a spacer, and in production', async () => {
    const drawn = await renderHook(() => useListScrubber({ layout: flat(), topBar: { height: 100 } }));
    const { ListHeader } = drawn.result.current;
    await render(
      <View>
        <ListHeader />
      </View>,
    );
    await act(() => screen.getByTestId('list-scrubber-spacer').props.onLayout());
    await renderHook(() => useListScrubber({ layout: flat() }));
    const dev = __DEV__;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    try {
      await renderHook(() => useListScrubber({ layout: flat(), topBar: { height: 100 } }));
    } finally {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
    }
    await act(() => jest.advanceTimersByTime(3000));
    expect(warn).not.toHaveBeenCalled();
  });
});
