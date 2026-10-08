import { mockScrollTo, sharedFlag, sharedZero, setup } from './support';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

describe('screen readers', () => {
  it('is an adjustable "Scroll position" control even while the thumb is hidden', async () => {
    await setup();
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    expect(el.props['aria-valuetext']).toBe('0%');
  });

  it('steps one screen at a time and announces the percentage', async () => {
    await setup({ formatAccessibilityPercent: (p) => `${p} percent` });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20)); // the scroll runs on the UI thread (next frame)
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 90, false);
    expect(el.props['aria-valuetext']).toBe('10 percent');
  });

  it('with steps (e.g. section headers) jumps to the next one and announces its label', async () => {
    await setup({ accessibilitySteps: [0, 500, 800], labelAt: (offset) => (offset >= 500 ? 'M' : 'A') });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20)); // the scroll runs on the UI thread (next frame)
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
    expect(el.props['aria-valuetext']).toBe('M');
  });
});

describe('with a top bar', () => {
  const shared = (n: number) => {
    const v = sharedZero();
    v.set(n);
    return v;
  };
  afterEach(() => jest.restoreAllMocks());
  // With a screen reader on, the bar stays in place
  const fixed = sharedFlag(true);

  it('steps land below the bar, and the value names the rows there', async () => {
    // A 20pt bar fully shown: section M starts at 500, so its first row should be 20 below
    // the top of the list
    await setup({
      sections: [
        { offset: 0, label: 'A' },
        { offset: 500, label: 'M' },
      ],
      topBar: { height: 20, visibleHeight: shared(20), isFixed: fixed },
    });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 480, false);
    expect(el.props['aria-valuetext']).toBe('M');
  });

  it('where the bar slides (web keys), lands below where the bar will be: hidden going down, shown going up', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const scrollY = shared(0);
    const visibleHeight = shared(20);
    await setup({
      scrollY,
      sections: [
        { offset: 0, label: 'A' },
        { offset: 300, label: 'F' },
        { offset: 500, label: 'M' },
      ],
      topBar: { height: 20, visibleHeight, isFixed: sharedFlag(false) },
    });
    const el = () => screen.getByRole('adjustable', { name: 'Scroll position' });
    const press = async (key: string) => {
      await act(() => el().props.onKeyDown({ nativeEvent: { key }, preventDefault: () => {} }));
      await act(() => jest.advanceTimersByTime(20));
    };
    // Down to F: scrolling 300 hides the bar, so F's first row is at the very top
    await press('ArrowDown');
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 300, false);
    expect(el().props['aria-valuetext']).toBe('F');
    // From M with the bar hidden, back up to F: scrolling up brings the bar back, so F lands 20 lower
    scrollY.set(500);
    visibleHeight.set(0);
    await press('ArrowUp');
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 280, false);
    expect(el().props['aria-valuetext']).toBe('F');
  });

  it('paging moves by the uncovered part of the list', async () => {
    await setup({ topBar: { height: 20, visibleHeight: shared(20), isFixed: fixed } });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 72, false); // 0.9 × (100 − 20)
  });
});

describe('with a top inset (e.g. a pinned header taking its own space)', () => {
  it('steps land below it, and the value names the rows there', async () => {
    await setup({
      sections: [
        { offset: 0, label: 'A' },
        { offset: 500, label: 'M' },
      ],
      insets: { top: 32 },
    });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 468, false);
    expect(el.props['aria-valuetext']).toBe('M');
  });
});

describe('screen reader edges', () => {
  it('ignores actions other than increment and decrement', async () => {
    const scrollY = sharedZero();
    scrollY.set(600);
    await setup({ scrollY, accessibilitySteps: [0, 500, 800] });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it('decrement goes back to the previous step and stops at the start', async () => {
    const scrollY = sharedZero();
    scrollY.set(600);
    await setup({ scrollY, accessibilitySteps: [0, 500, 800] });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    const act1 = async () => {
      await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
      await act(() => jest.advanceTimersByTime(20));
    };
    await act1();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
    scrollY.set(500);
    await act1();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 0, false);
    scrollY.set(0);
    await act1();
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 0, false);
  });

  it('increment past the last step lands on the end of the list', async () => {
    const scrollY = sharedZero();
    scrollY.set(800);
    await setup({ scrollY, accessibilitySteps: [0, 500, 800] });
    await fireEvent(screen.getByRole('adjustable', { name: 'Scroll position' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 900, false);
  });

  it('without steps, paging never goes past either end', async () => {
    const scrollY = sharedZero();
    scrollY.set(880);
    await setup({ scrollY });
    await fireEvent(screen.getByRole('adjustable', { name: 'Scroll position' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await act(() => jest.advanceTimersByTime(20));
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 900, false);
  });
});

describe('web keyboard', () => {
  afterEach(() => jest.restoreAllMocks());
  const control = () => screen.getByRole('adjustable', { name: 'Scroll position' });
  /** Presses `key` on the control; returns whether the page's own handling was prevented */
  const press = async (key: string) => {
    const preventDefault = jest.fn();
    await act(() => control().props.onKeyDown({ nativeEvent: { key }, preventDefault }));
    await act(() => jest.advanceTimersByTime(20)); // the scroll runs on the UI thread (next frame)
    return preventDefault.mock.calls.length > 0;
  };

  it('on web the control is a Tab stop, a vertical slider driven by the keys', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const scrollY = sharedZero();
    await setup({ scrollY, accessibilitySteps: [0, 500, 800] });
    expect(control().props).toMatchObject({ tabIndex: 0, 'aria-orientation': 'vertical' });

    expect(await press('ArrowDown')).toBe(true); // next step
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
    scrollY.set(500);
    expect(await press('ArrowRight')).toBe(true);
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 800, false);
    scrollY.set(800);
    expect(await press('ArrowUp')).toBe(true); // previous step
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 500, false);
    scrollY.set(500);
    expect(await press('ArrowLeft')).toBe(true);
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 0, false);
  });

  it('Page Up/Down move one screen, Home and End go to the ends', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const scrollY = sharedZero();
    await setup({ scrollY, accessibilitySteps: [0, 500, 800] });
    expect(await press('PageDown')).toBe(true); // one screen, not the next step
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 90, false);
    scrollY.set(300);
    expect(await press('PageUp')).toBe(true);
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 210, false);
    expect(await press('End')).toBe(true);
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 900, false);
    expect(screen.getByRole('adjustable').props['aria-valuetext']).toBe('100%');
    expect(await press('Home')).toBe(true);
    expect(mockScrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 0, false);
  });

  it('leaves other keys to the page', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await setup();
    mockScrollTo.mockClear();
    expect(await press('Tab')).toBe(false);
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it('adds nothing on iOS and Android', async () => {
    await setup();
    expect(control().props.tabIndex).toBeUndefined();
    expect(control().props.onKeyDown).toBeUndefined();
  });
});
