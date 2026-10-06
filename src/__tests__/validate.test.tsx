import { colors, setup } from './support';
import { render } from '@testing-library/react-native';
import { PinnedSectionHeader } from '../index';
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
