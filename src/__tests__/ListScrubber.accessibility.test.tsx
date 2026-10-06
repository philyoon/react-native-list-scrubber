import { mockScrollTo, sharedZero, setup } from './support';
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

describe('screen reader edges', () => {
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
