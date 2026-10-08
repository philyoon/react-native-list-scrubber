import { mockReactions, mockScrollTo, mockTimings } from './support';
import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { LIST_SCRUBBER_DEFAULTS, ListScrubber, useListScrubber } from '../index';

describe('useListScrubber', () => {
  it('measures the list from its layout and content size', async () => {
    const { result } = await renderHook(() => useListScrubber());
    await act(() => {
      result.current.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
      result.current.listProps.onContentSizeChange(390, 12000);
    });
    expect(result.current.scrubberProps.viewportHeight.get()).toBe(600);
    expect(result.current.scrubberProps.contentHeight.get()).toBe(12000);
    expect(result.current.scrubberProps).toMatchObject({
      viewportHeight: result.current.scrubberProps.viewportHeight,
      contentHeight: result.current.scrubberProps.contentHeight,
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
    (result.current.listProps.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y: 321 } });
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
    (result.current.listProps.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y: 5 } });
  });
  expect(onLayout).toHaveBeenCalledWith(layout);
  expect(onContentSizeChange).toHaveBeenCalledWith(390, 12000);
  expect(onScroll).toHaveBeenCalledWith({ contentOffset: { y: 5 } });
  expect(result.current.scrubberProps.viewportHeight.get()).toBe(600);
  expect(result.current.scrubberProps.contentHeight.get()).toBe(12000);
});

describe('useListScrubber({ sections })', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
  ] as const;

  it('hands the same sections to the scrubber and the pinned header', async () => {
    const { result } = await renderHook(() => useListScrubber({ sections }));
    expect(result.current.scrubberProps.sections).toBe(sections);
    expect(result.current.pinnedHeaderProps).toEqual({ scrollY: result.current.scrollY, sections });
  });

  it('without sections, scrubberProps has none', async () => {
    const { result } = await renderHook(() => useListScrubber());
    expect('sections' in result.current.scrubberProps).toBe(false);
    expect(result.current.pinnedHeaderProps.sections).toEqual([]);
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
        listRef={scrubber.listProps.ref}
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

describe('useListScrubber({ topBar })', () => {
  type Hook = { current: ReturnType<typeof useListScrubber> };
  async function withBar(height = 100, revealMs?: number) {
    const hook = await renderHook(() => useListScrubber({ topBar: { height, revealMs } }));
    const scroll = (y: number) =>
      (hook.result.current.listProps.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y } });
    /** What shows of the bar (a derived value: the mock computes it on render) */
    const visible = async () => {
      await hook.rerender({});
      return hook.result.current.topBar!.visibleHeight.get();
    };
    return { ...hook, scroll, visible };
  }
  /** The finger lifts from the thumb: the hook's reaction to isDragging */
  const lift = (result: Hook) =>
    act(() => {
      result.current.isDragging.set(false);
      const reaction = mockReactions.at(-1)!;
      reaction.react(reaction.prepare(), true);
    });

  it('slides away as the list scrolls down, comes back on a scroll up, and shows at the top', async () => {
    const { scroll, visible } = await withBar();
    expect(await visible()).toBe(100);
    scroll(60);
    expect(await visible()).toBe(40);
    scroll(300);
    expect(await visible()).toBe(0); // all hidden, however far down
    scroll(250);
    expect(await visible()).toBe(50); // back by as much as the list scrolled up
    scroll(260);
    expect(await visible()).toBe(40);
    scroll(30);
    expect(await visible()).toBe(100); // near the top: never over the space above the rows
    scroll(-20);
    expect(await visible()).toBe(100); // pull-to-refresh, iOS bounce
  });

  it('stays as it is during a drag, and after one that ends anywhere but the top', async () => {
    const { result, scroll, visible } = await withBar();
    scroll(300);
    result.current.isDragging.set(true);
    scroll(2000);
    scroll(700);
    expect(await visible()).toBe(0);
    const timings = mockTimings.length;
    await lift(result);
    expect(mockTimings).toHaveLength(timings); // at the end of the list it doesn't come back
    expect(await visible()).toBe(0);
    expect(mockScrollTo).not.toHaveBeenCalled(); // the list stays where the drag left it
    scroll(650); // a scroll up brings it back, as always
    expect(await visible()).toBe(50);
  });

  it('a drag that ends at the first row scrolls back to the top, and the bar slides in', async () => {
    const { result, scroll, visible } = await withBar();
    scroll(300); // hidden: the thumb's track starts at offset 100, the first row
    result.current.isDragging.set(true);
    scroll(100);
    mockScrollTo.mockClear();
    await lift(result);
    expect(mockScrollTo).toHaveBeenCalledWith(result.current.listProps.ref, 0, 0, true);
    expect(mockTimings.at(-1)).toMatchObject({ to: 0, duration: 250 }); // the mock's animation ends at once
    expect(await visible()).toBe(100);
    // While it slides in, the scroll back to the top doesn't move it; after, scrolls do again
    scroll(40);
    expect(await visible()).toBe(100);
    await act(async () => mockTimings.at(-1)!.done!());
    scroll(0);
    scroll(60);
    expect(await visible()).toBe(40);
  });

  it('show() slides it back in; shown, it stays', async () => {
    const { result, scroll, visible } = await withBar();
    scroll(300);
    const uiFrame = () => act(() => jest.advanceTimersByTime(20)); // show() runs on the UI thread
    result.current.topBar!.show();
    await uiFrame();
    expect(await visible()).toBe(100);
    const timings = mockTimings.length;
    result.current.topBar!.show();
    await uiFrame();
    expect(mockTimings).toHaveLength(timings);
  });

  it('slides back in over `revealMs`', async () => {
    expect(LIST_SCRUBBER_DEFAULTS.topBar.revealMs).toBe(250);
    const { result, scroll } = await withBar(100, 400);
    scroll(300);
    result.current.isDragging.set(true);
    scroll(100); // the top of the thumb's track
    await lift(result);
    expect(mockTimings.at(-1)).toMatchObject({ to: 0, duration: 400 });
    await act(async () => mockTimings.at(-1)!.done!());
    scroll(500);
    result.current.topBar!.show();
    await act(() => jest.advanceTimersByTime(20));
    expect(mockTimings.at(-1)).toMatchObject({ to: 0, duration: 400 });
  });

  it('the scrubber and the pinned header get it from the spreads', async () => {
    const { result, scroll, visible } = await withBar();
    scroll(60);
    expect(await visible()).toBe(40);
    const { topBar, scrubberProps, pinnedHeaderProps } = result.current;
    expect(scrubberProps.topBar).toBe(topBar);
    expect(pinnedHeaderProps.top).toBe(topBar!.visibleHeight);
    expect(pinnedHeaderProps.scrollY.get()).toBe(60 + 40); // the rows just below what shows of the bar
  });

  it('topBarProps put it over the top of the list, as tall as the bar; no focus handler off the web', async () => {
    const { result } = await withBar(120);
    expect(result.current.topBarProps.style[0]).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 120,
    });
    expect('onFocus' in result.current.topBarProps).toBe(false);
  });

  it('on the web, focus inside it brings it back (a page can’t tell a screen reader is on)', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      const { result, scroll, visible } = await withBar();
      scroll(300);
      expect(await visible()).toBe(0);
      expect(result.current.topBarProps.onFocus).toBe(result.current.topBar!.show);
      result.current.topBarProps.onFocus!();
      await act(() => jest.advanceTimersByTime(20));
      expect(await visible()).toBe(100);
    } finally {
      os.restore();
    }
  });

  describe('scrolling from code', () => {
    async function measured() {
      const bar = await withBar();
      await act(() => {
        bar.result.current.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
        bar.result.current.listProps.onContentSizeChange(390, 2000); // scrolls up to 1,400
      });
      return bar;
    }
    const uiFrame = () => act(() => jest.advanceTimersByTime(20));

    it('brings an offset to just below the bar, where it will be once it has followed the scroll', async () => {
      const { result, scroll } = await measured();
      expect(result.current.topBar!.isFixed.get()).toBe(false);
      // Down from the top: scrolling 500 hides the bar, so the offset lands at the very top
      result.current.scrollToOffset(500);
      await uiFrame();
      expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
      // Up from 800 with the bar hidden: scrolling up brings it back, so the offset lands 100 lower
      scroll(800);
      result.current.scrollToOffset(500);
      await uiFrame();
      expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 400, false);
      // Already just below the bar: stays
      scroll(400); // shown in full
      scroll(450); // half hidden: 500 is just below it
      result.current.scrollToOffset(500);
      await uiFrame();
      expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 450, false);
    });

    it('while the bar slides back in, it ends up in full whichever way the list goes', async () => {
      const { result, scroll } = await measured();
      scroll(800); // hidden
      result.current.isDragging.set(true);
      scroll(100); // dragged to the top: the bar slides back in when the finger lifts
      await lift(result as Hook);
      result.current.scrollToOffset(1000);
      await uiFrame();
      expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 900, false);
    });
  });

  it('without the option: no bar, and nothing reacts to the scroll or a drag for one', async () => {
    const { result } = await renderHook(() => useListScrubber());
    expect(result.current.topBar).toBeUndefined();
    expect('topBar' in result.current.scrubberProps).toBe(false);
    expect('top' in result.current.pinnedHeaderProps).toBe(false);
    expect(result.current.pinnedHeaderProps.scrollY).toBe(result.current.scrollY);
    const timings = mockTimings.length;
    await lift(result as Hook);
    expect(mockTimings).toHaveLength(timings);
  });
});

describe('useListScrubber({ topBar }) with a screen reader', () => {
  let changed: ((on: boolean) => void) | undefined;
  const remove = jest.fn();
  let enabled: jest.SpyInstance;
  beforeEach(() => {
    enabled = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    enabled.mockClear();
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_: string, handler: never) => {
      changed = handler;
      return { remove };
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  async function withBar() {
    const hook = await renderHook(() => useListScrubber({ topBar: { height: 100 } }));
    await act(async () => {}); // the screen reader's state arrives
    const scroll = (y: number) =>
      (hook.result.current.listProps.onScroll as unknown as (e: unknown) => void)({ contentOffset: { y } });
    const visible = async () => {
      await hook.rerender({});
      return hook.result.current.topBar!.visibleHeight.get();
    };
    return { ...hook, scroll, visible };
  }
  const uiFrame = () => act(() => jest.advanceTimersByTime(20));

  it('keeps the bar in place: hidden, its contents would be in the screen reader’s reach, off screen', async () => {
    enabled.mockResolvedValue(true);
    const { scroll, visible } = await withBar();
    await uiFrame();
    scroll(300);
    expect(await visible()).toBe(100);
  });

  it('turned on while the bar is hidden, brings it back; turned off, the bar slides again', async () => {
    const { scroll, visible } = await withBar();
    scroll(300);
    expect(await visible()).toBe(0);
    await act(async () => changed!(true));
    await uiFrame();
    expect(await visible()).toBe(100);
    await act(async () => mockTimings.at(-1)!.done!()); // slid back in
    scroll(600);
    expect(await visible()).toBe(100);
    await act(async () => changed!(false));
    scroll(900);
    expect(await visible()).toBe(0);
  });

  it('stops listening when unmounted, and ignores an answer that comes after', async () => {
    let answer!: (on: boolean) => void;
    enabled.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));
    const { unmount } = await renderHook(() => useListScrubber({ topBar: { height: 100 } }));
    await unmount();
    expect(remove).toHaveBeenCalled();
    await act(async () => answer(true)); // no update on an unmounted component
  });

  it('scrolling from code lands below the bar, which stays in place', async () => {
    enabled.mockResolvedValue(true);
    const { result } = await withBar();
    await uiFrame();
    expect(result.current.topBar!.isFixed.get()).toBe(true);
    await act(() => {
      result.current.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
      result.current.listProps.onContentSizeChange(390, 2000);
    });
    result.current.scrollToOffset(500);
    await uiFrame();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 400, false);
  });

  it("doesn't ask on the web, where a page can't tell", async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      await renderHook(() => useListScrubber({ topBar: { height: 100 } }));
      expect(enabled).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });

  it("doesn't ask without a bar", async () => {
    await renderHook(() => useListScrubber());
    expect(enabled).not.toHaveBeenCalled();
  });
});
