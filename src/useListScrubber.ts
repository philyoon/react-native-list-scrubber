import { useCallback, useMemo, useState, type Component } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

/**
 * State for one list + scrubber pair. Spread `listProps` on the list and `scrubberProps` on the scrubber:
 *
 *   const scrubber = useListScrubber();
 *   <Animated.FlatList {...scrubber.listProps} data={…} renderItem={…} />
 *   <ListScrubber {...scrubber.scrubberProps} colors={…} accessibilityLabel="Scroll position" />
 *
 * The list must be an Animated component (Animated.FlatList, Animated.ScrollView, AnimatedLegendList,
 * Animated.createAnimatedComponent(FlashList) …) so the scroll handler runs on the UI thread.
 * The offset comes from scroll events, so it keeps working when the list remounts (e.g. a new `key`).
 * If the list needs its own onLayout / onContentSizeChange, pass your own sizes to ListScrubber instead.
 */
// `any`: works with any scrollable component
export function useListScrubber<TList extends Component<any, any> = any>() {
  const listRef = useAnimatedRef<TList>();
  const scrollY = useSharedValue(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  // Stable identities: the list gets the same props on every render, so it doesn't re-render for them.
  const onContentSizeChange = useCallback((_width: number, height: number) => setContentHeight(height), []);
  const onLayout = useCallback((e: LayoutChangeEvent) => setViewportHeight(e.nativeEvent.layout.height), []);
  const listProps = useMemo(
    () => ({
      ref: listRef,
      onScroll,
      scrollEventThrottle: 16,
      showsVerticalScrollIndicator: false,
      onContentSizeChange,
      onLayout,
    }),
    [listRef, onScroll, onContentSizeChange, onLayout],
  );
  const scrubberProps = useMemo(
    () => ({ listRef, scrollY, contentHeight, viewportHeight }),
    [listRef, scrollY, contentHeight, viewportHeight],
  );
  return { listRef, scrollY, onScroll, contentHeight, viewportHeight, listProps, scrubberProps };
}
