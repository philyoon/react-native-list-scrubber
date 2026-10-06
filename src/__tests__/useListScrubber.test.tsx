import './support';
import { act, renderHook } from '@testing-library/react-native';
import { useListScrubber } from '../index';

describe('useListScrubber', () => {
  it('measures the list from its layout and content size', async () => {
    const { result } = await renderHook(() => useListScrubber());
    await act(() => {
      result.current.listProps.onLayout({ nativeEvent: { layout: { height: 600 } } } as never);
      result.current.listProps.onContentSizeChange(390, 12000);
    });
    expect(result.current.scrubberProps).toMatchObject({ viewportHeight: 600, contentHeight: 12000 });
    expect(result.current.listProps.scrollEventThrottle).toBe(16);
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
  expect(result.current.scrubberProps).toMatchObject({ viewportHeight: 600, contentHeight: 12000 });
});
