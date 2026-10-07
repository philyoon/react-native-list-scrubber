import { colors, setup } from './support';
import { act, render } from '@testing-library/react-native';
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

describe('unmemoized sections', () => {
  const make = () => [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
  ];
  const header = (sections: { offset: number; label: string }[]) => (
    <PinnedSectionHeader scrollY={{ get: () => 0 } as never} sections={sections} height={36} />
  );
  const unmemoized = (call: unknown[]) => String(call[0]).includes('Wrap it in useMemo');

  it('warn once when a new array has the same contents, however many components see it', async () => {
    const view = await render(header(make()));
    await view.rerender(header(make()));
    await view.rerender(header(make()));
    expect(warn.mock.calls.filter(unmemoized)).toHaveLength(1);
  });

  it('stay quiet for a single identical rebuild (e.g. a refetch with the same data)', async () => {
    const view = await render(header(make()));
    await view.rerender(header(make()));
    await view.rerender(header([...make(), { offset: 900, label: 'Z' }]));
    expect(warn.mock.calls.filter(unmemoized)).toHaveLength(0);
  });

  it('stay quiet for a memoized array, or new contents', async () => {
    const sections = make();
    const view = await render(header(sections));
    await view.rerender(header(sections));
    await view.rerender(header([...make(), { offset: 900, label: 'Z' }]));
    expect(warn.mock.calls.filter(unmemoized)).toHaveLength(0);
  });

  it('stay quiet in production builds', async () => {
    const dev = __DEV__;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    try {
      const view = await render(header(make()));
      await view.rerender(header(make()));
      await view.rerender(header(make()));
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
    const attach = () => ((list.listRef as unknown as { current: object | null }).current = {});
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
