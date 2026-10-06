import { useMemo, useState, type Component } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type ScrollEvent,
} from 'react-native-reanimated';
import { useLatest } from './useLatest';

/** The list's own handlers, called after the scrubber's (listProps sets these props on the list) */
export interface UseListScrubberOptions {
  /** A worklet (runs on the UI thread). Keep its identity stable, e.g. define it outside the component. */
  onScroll?: (event: ScrollEvent) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
}

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
 * If the list needs its own onScroll / onLayout / onContentSizeChange, pass them in `options`.
 *
 * Returns `listProps` and `scrubberProps` to spread, and the pieces they're made of (`listRef`, `scrollY`,
 * `onScroll`, `contentHeight`, `viewportHeight`) for wiring them by hand: all of it is public API.
 */
// `any`: works with any scrollable component
export function useListScrubber<TList extends Component<any, any> = any>(
  options: UseListScrubberOptions = {},
) {
  const { onScroll: userOnScroll } = options;
  const listRef = useAnimatedRef<TList>();
  const scrollY = useSharedValue(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const onScroll = useAnimatedScrollHandler(
    (e) => {
      scrollY.set(e.contentOffset.y);
      userOnScroll?.(e);
    },
    [userOnScroll],
  );
  // Stable identities: the list gets the same props on every render, so it doesn't re-render for them.
  const onContentSizeChange = useLatest((width: number, height: number) => {
    setContentHeight(height);
    options.onContentSizeChange?.(width, height);
  });
  const onLayout = useLatest((e: LayoutChangeEvent) => {
    setViewportHeight(e.nativeEvent.layout.height);
    options.onLayout?.(e);
  });
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
