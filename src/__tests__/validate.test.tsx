import { colors, setup } from './support';
import { act, render, renderHook } from '@testing-library/react-native';
import { ListScrubber, PinnedSectionHeader, useListScrubber } from '../index';
import { resetWarnings, warnIfInvalid } from '../validate';

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  resetWarnings();
});
afterEach(() => warn.mockRestore());

describe('warnIfInvalid', () => {
  it('warns when values go down, naming where', () => {
    const values = [0, 500, 300];
    warnIfInvalid(values, values, 'sections');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain(
      'sections must be in ascending order, but at index 2 300 comes after 500',
    );
  });

  it('accepts ascending values, ties included', () => {
    const values = [0, 300, 300, 900];
    warnIfInvalid(values, values, 'sections');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns about offsets that are not finite numbers', () => {
    const values = [0, NaN, 900];
    warnIfInvalid(values, values, 'sections');
    expect(warn.mock.calls[0]![0]).toContain('sections must be finite numbers, but index 1 is NaN');
  });

  it('warns about an empty section label', () => {
    const sections = [
      { offset: 0, label: 'A' },
      { offset: 300, label: '' },
    ];
    warnIfInvalid(
      sections.map((s) => s.offset),
      sections,
      'sections',
      sections,
    );
    expect(warn.mock.calls[0]![0]).toContain('sections need labels, but the one at index 1 is empty');
  });

  it('checks each array once', () => {
    const values = [5, 1];
    warnIfInvalid(values, values, 'sections');
    warnIfInvalid(values, values, 'sections');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does nothing in production builds', () => {
    const dev = __DEV__;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    try {
      const values = [5, 1];
      warnIfInvalid(values, values, 'sections');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
    }
  });
});

describe('components', () => {
  const unsorted = [
    { offset: 0, label: 'A' },
    { offset: 800, label: 'Z' },
    { offset: 500, label: 'M' },
  ];

  it('warn once for unsorted sections shared by the scrubber and the pinned header', async () => {
    const sections = [...unsorted];
    await setup({ sections });
    await render(<PinnedSectionHeader scrollY={{ get: () => 0 } as never} sections={sections} height={36} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('sections must be in ascending order');
  });

  it('check accessibilitySteps too', async () => {
    await setup({ accessibilitySteps: [0, 800, 500] });
    expect(warn.mock.calls[0]![0]).toContain('accessibilitySteps must be in ascending order');
  });

  it('stay quiet for sorted sections', async () => {
    await setup({ sections: [...unsorted].sort((a, b) => a.offset - b.offset), colors });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('sections rebuilt on every render', () => {
  const make = (extra: object = {}) => [
    { offset: 0, label: 'A', ...extra },
    { offset: 500, label: 'M' },
  ];

  it('keep their identity while they are the same, without a warning', async () => {
    let sections = make();
    const { result, rerender } = await renderHook(() => useListScrubber({ sections }));
    const first = result.current.scrubberProps.sections;
    sections = make();
    await rerender({});
    expect(result.current.scrubberProps.sections).toBe(first);
    expect(result.current.pinnedHeaderProps.sections).toBe(first);
    expect(warn).not.toHaveBeenCalled();
  });

  it('change when a section does, an extra field of its own included', async () => {
    let sections = make();
    const { result, rerender } = await renderHook(() => useListScrubber({ sections }));
    const first = result.current.scrubberProps.sections;
    sections = make({ id: 7 });
    await rerender({});
    const second = result.current.scrubberProps.sections;
    expect(second).not.toBe(first);
    expect(second[0]).toEqual({ offset: 0, label: 'A', id: 7 });
    sections = [...make({ id: 7 }), { offset: 900, label: 'Z' }];
    await rerender({});
    expect(result.current.scrubberProps.sections).toHaveLength(3);
  });

  it('the components wired by hand keep their identity too', async () => {
    const header = (sections: { offset: number; label: string }[]) => (
      <PinnedSectionHeader scrollY={{ get: () => 0 } as never} sections={sections} height={36} />
    );
    const view = await render(header(make()));
    const text = () =>
      view.getByTestId('list-scrubber-pinned-header-label-text', { includeHiddenElements: true });
    const labels = text().props;
    await view.rerender(header(make()));
    expect(text().props).toBe(labels); // the label wasn't re-rendered with new labels
    await view.rerender(header([...make(), { offset: 900, label: 'Z' }]));
    expect(text().props).not.toBe(labels);
  });
});

describe("an onScroll that isn't stable", () => {
  const unstable = (call: unknown[]) => String(call[0]).includes('`onScroll` passed to useListScrubber');
  /** Renders the hook with a new `onScroll` from `next()` each time, `times` renders in all */
  const renderWith = async (next: () => (() => void) | undefined, times: number) => {
    const { rerender } = await renderHook(() => useListScrubber({ onScroll: next() }));
    for (let i = 1; i < times; i++) await rerender({});
  };

  it('warns once when it is a new function on every render', async () => {
    await renderWith(() => () => {}, 5);
    expect(warn.mock.calls.filter(unstable)).toHaveLength(1);
    expect(warn.mock.calls.find(unstable)![0]).toMatch(
      /^react-native-list-scrubber: .*Define the worklet outside the component, or wrap it in useCallback\.$/,
    );
  });

  it('stays quiet for a stable one, none, or a single change', async () => {
    const stable = () => {};
    await renderWith(() => stable, 3);
    await renderWith(() => undefined, 3);
    const handlers = [stable, () => {}, () => {}];
    let n = 0;
    // Changes once, stays, then changes once more: never twice in a row
    await renderWith(() => handlers[[0, 1, 1, 2][n++]!], 4);
    expect(warn.mock.calls.filter(unstable)).toHaveLength(0);
  });

  it('stays quiet in production builds', async () => {
    const dev = __DEV__;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    try {
      await renderWith(() => () => {}, 3);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
    }
  });
});

describe('a list that never reports its size', () => {
  type Sizes = { contentHeight?: number; viewportHeight?: number };
  // A screen with the hook and a scrubber; `own` sizes are passed to the scrubber as numbers instead
  const mount = async ({ scrubber = true, own = {} as Sizes } = {}) => {
    let list!: ReturnType<typeof useListScrubber>;
    function Screen() {
      list = useListScrubber();
      return scrubber ? (
        <ListScrubber {...list.scrubberProps} {...own} accessibilityLabel="Scroll position" />
      ) : null;
    }
    const view = await render(<Screen />);
    const attach = () => ((list.listProps.ref as unknown as { current: object | null }).current = {});
    const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
    return { ...view, list, attach, wait };
  };

  it('warns once the list has been mounted for a while without them, naming the handlers', async () => {
    const { list, attach, wait } = await mount();
    attach();
    await act(() => list.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never));
    await wait(2000);
    expect(warn).not.toHaveBeenCalled();
    await wait(1000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("the list's onContentSizeChange from `listProps` never ran");
    await wait(10000);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('waits for the list to mount: one rendered after its data loads is fine', async () => {
    const { list, attach, wait } = await mount();
    await wait(10000); // a spinner meanwhile: the list isn't mounted
    attach();
    await act(() => {
      list.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
      list.listProps.onContentSizeChange(390, 0); // an empty list still reports its size
    });
    await wait(10000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('names both when neither ran, and stops checking on unmount', async () => {
    const first = await mount();
    first.attach();
    await first.wait(3000);
    expect(warn.mock.calls[0]![0]).toContain('onLayout and onContentSizeChange');
    resetWarnings();
    const second = await mount();
    second.attach();
    await second.unmount();
    await second.wait(10000);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the scrubber is given its own sizes: the hook's handlers aren't needed", async () => {
    const { attach, wait } = await mount({ own: { contentHeight: 1000, viewportHeight: 100 } });
    attach();
    await wait(10000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('names only the handlers whose size the scrubber reads from the hook', async () => {
    const { attach, wait } = await mount({ own: { contentHeight: 1000 } });
    attach();
    await wait(3000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("the list's onLayout from `listProps` never ran");
  });

  it('stays quiet with no scrubber reading the sizes (e.g. only a pinned header)', async () => {
    const { attach, wait } = await mount({ scrubber: false });
    attach();
    await wait(10000);
    expect(warn).not.toHaveBeenCalled();
  });
});
