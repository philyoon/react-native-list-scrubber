import { useMemo, useState, type Component } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type AnimatedRef,
  type ScrollEvent,
  type SharedValue,
} from 'react-native-reanimated';
import type { ListScrubberSection } from './types';
import { useLatest } from './useLatest';

export interface UseListScrubberOptions<S extends readonly ListScrubberSection[] | undefined = undefined> {
  /**
   * The list's labelled sections (ascending offsets). Given here, `scrubberProps` and `headerProps` carry them,
   * so the scrubber and a pinned header always read the same ones.
   */
  sections?: S;
  // The list's own handlers, called after the scrubber's (listProps sets these props on the list)
  /** A worklet (runs on the UI thread). Keep its identity stable, e.g. define it outside the component. */
  onScroll?: (event: ScrollEvent) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
}

/**
 * State for one list + scrubber pair. Spread `listProps` on the list, `scrubberProps` on the scrubber and,
 * with a pinned header, `headerProps` on it:
 *
 *   const scrubber = useListScrubber({ sections });
 *   <Animated.FlatList {...scrubber.listProps} data={…} renderItem={…} />
 *   <PinnedSectionHeader {...scrubber.headerProps} height={…} />
 *   <ListScrubber {...scrubber.scrubberProps} colors={…} accessibilityLabel="Scroll position" />
 *
 * The list must be an Animated component (Animated.FlatList, Animated.ScrollView, AnimatedLegendList,
 * Animated.createAnimatedComponent(FlashList) …) so the scroll handler runs on the UI thread.
 * The offset comes from scroll events, so it keeps working when the list remounts (e.g. a new `key`).
 * If the list needs its own onScroll / onLayout / onContentSizeChange, pass them in `options`.
 *
 * Without `sections` (e.g. with `labelAt`), `scrubberProps` has none and `headerProps` isn't useful.
 * Returns the props to spread, and the pieces they're made of (`listRef`, `scrollY`, `onScroll`,
 * `contentHeight`, `viewportHeight`) for wiring them by hand: all of it is public API.
 */
// `any`: works with any scrollable component
export function useListScrubber<
  TList extends Component<any, any> = any,
  S extends readonly ListScrubberSection[] | undefined = undefined,
>(options: UseListScrubberOptions<S> = {}) {
  const { onScroll: userOnScroll, sections } = options;
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
  // With sections, they ride along (typed only then, so `labelAt` users can still spread scrubberProps)
  const scrubberProps = useMemo(
    () =>
      ({ listRef, scrollY, contentHeight, viewportHeight, ...(sections && { sections }) }) as ScrubberProps<
        TList,
        S
      >,
    [listRef, scrollY, contentHeight, viewportHeight, sections],
  );
  const headerProps = useMemo(() => ({ scrollY, sections: sections ?? NO_SECTIONS }), [scrollY, sections]);
  return { listRef, scrollY, onScroll, contentHeight, viewportHeight, listProps, scrubberProps, headerProps };
}

const NO_SECTIONS: readonly ListScrubberSection[] = [];

type ScrubberProps<TList extends Component<any, any>, S> = {
  listRef: AnimatedRef<TList>;
  scrollY: SharedValue<number>;
  contentHeight: number;
  viewportHeight: number;
} & (S extends readonly ListScrubberSection[] ? { sections: S } : unknown);
