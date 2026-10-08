import { mockScrollTo } from './support';
import { act, renderHook } from '@testing-library/react-native';
import { ListScrubber, useListScrubber } from '../index';

describe('useListScrubber', () => {
  it('measures the list from its layout and content size', async () => {
    const { result } = await renderHook(() => useListScrubber());
    await act(() => {
      result.current.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
      result.current.listProps.onContentSizeChange(390, 12000);
    });
    expect(result.current.viewportHeight.get()).toBe(600);
    expect(result.current.contentHeight.get()).toBe(12000);
    expect(result.current.scrubberProps).toMatchObject({
      viewportHeight: result.current.viewportHeight,
      contentHeight: result.current.contentHeight,
      isDragging: result.current.isDragging, // the scrubber sets it; worklets can read it
    });
    expect(result.current.isDragging.get()).toBe(false);
    expect(result.current.listProps.scrollEventThrottle).toBe(16);
  });

  it("doesn't re-render the component calling it when the list is measured", async () => {
    let renders = 0;
    const { result } = await renderHook(() => {
      renders++;
      return useListScrubber();
    });
    const before = renders;
    const scrubberProps = result.current.scrubberProps;
    await act(() => {
      result.current.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
      result.current.listProps.onContentSizeChange(390, 12000);
    });
    expect(renders).toBe(before);
    expect(result.current.scrubberProps).toBe(scrubberProps);
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
  expect(result.current.viewportHeight.get()).toBe(600);
  expect(result.current.contentHeight.get()).toBe(12000);
});

describe('useListScrubber({ sections })', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
  ] as const;

  it('hands the same sections to the scrubber and the pinned header', async () => {
    const { result } = await renderHook(() => useListScrubber({ sections }));
    expect(result.current.scrubberProps.sections).toBe(sections);
    expect(result.current.headerProps).toEqual({ scrollY: result.current.scrollY, sections });
  });

  it('without sections, scrubberProps has none', async () => {
    const { result } = await renderHook(() => useListScrubber());
    expect('sections' in result.current.scrubberProps).toBe(false);
    expect(result.current.headerProps.sections).toEqual([]);
  });

  it('types: labelAt still fits without hook sections, and is refused with them', async () => {
    const plain = (await renderHook(() => useListScrubber())).result.current;
    const withSections = (await renderHook(() => useListScrubber({ sections }))).result.current;
    const colors = { thumb: 'gray', thumbActive: 'red', bubble: 'black', bubbleText: 'white' };
    const ok = (
      <ListScrubber {...plain.scrubberProps} labelAt={() => 'x'} colors={colors} accessibilityLabel="s" />
    );
    const refused = (
      // @ts-expect-error sections (from the hook) and labelAt are mutually exclusive
      <ListScrubber
        {...withSections.scrubberProps}
        labelAt={() => 'x'}
        colors={colors}
        accessibilityLabel="s"
      />
    );
    expect([ok, refused]).toHaveLength(2);
  });

  it("types: onSectionChange's section keeps the sections' own type, extra fields included", async () => {
    const people = [
      { offset: 0, label: 'A', id: 'a1' },
      { offset: 500, label: 'B', id: 'b1' },
    ];
    const scrubber = (await renderHook(() => useListScrubber({ sections: people }))).result.current;
    const props = { ...scrubber.scrubberProps, accessibilityLabel: 's' };
    const viaHook = <ListScrubber {...props} onSectionChange={(_, section) => section.id.toUpperCase()} />;
    const byHand = (
      <ListScrubber
        scrollY={scrubber.scrollY}
        listRef={scrubber.listRef}
        contentHeight={1000}
        viewportHeight={100}
        sections={people}
        accessibilityLabel="s"
        onSectionChange={(_, section) => section.id.toUpperCase()}
      />
    );
    const unknownField = (
      // @ts-expect-error the sections have no `title`
      <ListScrubber {...props} onSectionChange={(_, section) => section.title} />
    );
    expect([viaHook, byHand, unknownField]).toHaveLength(3);
  });

  it("types: onSectionChange's parameters are inferred when sections arrive in the spread", async () => {
    const scrubber = (await renderHook(() => useListScrubber({ sections }))).result.current;
    const colors = { thumb: 'gray', thumbActive: 'red', bubble: 'black', bubbleText: 'white' };
    // Under `strict` this fails to compile ("implicitly has an 'any' type") if the parameters aren't inferred
    const el = (
      <ListScrubber
        {...scrubber.scrubberProps}
        colors={colors}
        accessibilityLabel="s"
        onSectionChange={(index, section) => [index.toFixed(), section.label.toUpperCase()]}
      />
    );
    expect(el).toBeTruthy();
  });
});

describe('scrolling from code', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
  ];
  async function measured(options = {}) {
    const hook = await renderHook(() => useListScrubber(options));
    await act(() => {
      hook.result.current.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
      hook.result.current.listProps.onContentSizeChange(390, 2000); // scrolls up to 1,400
    });
    return hook.result;
  }
  const uiFrame = () => act(() => jest.advanceTimersByTime(20)); // the scroll runs on the UI thread

  it('scrollToSection goes to the start of a section, without animating by default', async () => {
    const result = await measured({ sections });
    result.current.scrollToSection(1);
    await uiFrame();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
  });

  it('scrollToOffset clamps to the list and can animate', async () => {
    const result = await measured();
    result.current.scrollToOffset(5000, { animated: true });
    await uiFrame();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 1400, true);
    result.current.scrollToOffset(-10);
    await uiFrame();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 0, false);
  });

  it('scrollToSection warns, and stays put, for a section that does not exist', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      (await measured({ sections })).current.scrollToSection(5);
      (await measured()).current.scrollToSection(0);
      await uiFrame();
      expect(mockScrollTo).not.toHaveBeenCalled();
      expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
        expect.stringContaining('scrollToSection(5) has no section to go to: there are 2'),
        expect.stringContaining('scrollToSection(0) has no section to go to: there are 0'),
      ]);
      const dev = __DEV__;
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
      try {
        (await measured()).current.scrollToSection(0);
        expect(warn).toHaveBeenCalledTimes(2);
      } finally {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
      }
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps the same functions between renders', async () => {
    const { result, rerender } = await renderHook(() => useListScrubber({ sections }));
    const { scrollToSection, scrollToOffset } = result.current;
    await rerender({});
    expect(result.current.scrollToSection).toBe(scrollToSection);
    expect(result.current.scrollToOffset).toBe(scrollToOffset);
  });
});
