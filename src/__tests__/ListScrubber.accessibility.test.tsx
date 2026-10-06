import { mockScrollTo, sharedZero, setup } from './support';
import { act, fireEvent, screen } from '@testing-library/react-native';

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
