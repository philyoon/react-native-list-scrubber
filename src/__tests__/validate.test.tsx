import { colors, setup } from './support';
import { render } from '@testing-library/react-native';
import { PinnedSectionHeader } from '../index';
import { warnIfUnsorted } from '../validate';

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('warnIfUnsorted', () => {
  it('warns when values go down, naming where', () => {
    const values = [0, 500, 300];
    warnIfUnsorted(values, values, 'sections');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain(
      'sections must be in ascending order, but at index 2 300 comes after 500',
    );
  });

  it('accepts ascending values, ties included', () => {
    const values = [0, 300, 300, 900];
    warnIfUnsorted(values, values, 'sections');
    expect(warn).not.toHaveBeenCalled();
  });

  it('checks each array once', () => {
    const values = [5, 1];
    warnIfUnsorted(values, values, 'sections');
    warnIfUnsorted(values, values, 'sections');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does nothing in production builds', () => {
    const dev = __DEV__;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    try {
      const values = [5, 1];
      warnIfUnsorted(values, values, 'sections');
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
