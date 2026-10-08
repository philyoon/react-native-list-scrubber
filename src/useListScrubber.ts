import { useMemo, useRef, type Component } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import {
  Easing,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type AnimatedRef,
  type ScrollEvent,
  type ScrollHandlerProcessed,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { clamp } from './math';
import type { ListScrubberSection, ListScrubberTopBar } from './types';
import { useLatest } from './useLatest';
import { useWarnIfUnmeasured } from './validate';

export interface UseListScrubberOptions<S extends readonly ListScrubberSection[] | undefined = undefined> {
  /**
   * The list's labelled sections (ascending offsets). Given here, `scrubberProps` and `pinnedHeaderProps` carry
   * them, so the scrubber and a pinned header always read the same ones.
   */
  sections?: S;
  /**
   * A bar over the top of the list (a title, a search field…) that slides away as the list scrolls down and
   * comes back on a scroll up. Draw it with `topBarStyle`, and start the list with a spacer as tall as the bar
   * (plus a pinned header, if any). `scrubberProps` and `pinnedHeaderProps` then keep the scrubber and the pinned
   * header below it. During a thumb drag it stays as it was, and it slides back in when the finger lifts.
   */
  topBar?: { height: number };
  // The list's own handlers, called after the scrubber's (listProps sets these props on the list)
  /** A worklet (runs on the UI thread). Keep its identity stable, e.g. define it outside the component. */
  onScroll?: (event: ScrollEvent) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
}

/**
 * State for one list + scrubber pair. Spread `listProps` on the list, `scrubberProps` on the scrubber and,
 * with a pinned header, `pinnedHeaderProps` on it:
 *
 *   const scrubber = useListScrubber({ sections });
 *   <Animated.FlatList {...scrubber.listProps} data={…} renderItem={…} />
 *   <PinnedSectionHeader {...scrubber.pinnedHeaderProps} height={…} />
 *   <ListScrubber {...scrubber.scrubberProps} colors={…} accessibilityLabel="Scroll position" />
 *
 * The list must be an Animated component (Animated.FlatList, Animated.ScrollView, AnimatedLegendList,
 * Animated.createAnimatedComponent(FlashList) …) so the scroll handler runs on the UI thread.
 * The offset comes from scroll events, so it keeps working when the list remounts (e.g. a new `key`).
 * If the list needs its own onScroll / onLayout / onContentSizeChange, pass them in `options`.
 *
 * Without `sections` (e.g. with `labelAt`), `scrubberProps` has none and `pinnedHeaderProps` isn't useful.
 * Returns the props to spread, and the pieces they're made of (`listRef`, `scrollY`, `onScroll`, and the
 * `contentHeight` / `viewportHeight` / `isDragging` shared values) for wiring them by hand: all of it is
 * public API.
 * Measuring the list doesn't re-render the component calling this hook.
 *
 * `scrollToSection(index)` and `scrollToOffset(y)` move the list from code, e.g. for a tappable A–Z index
 * or a "jump to today" button.
 */
// `any`: works with any scrollable component
export function useListScrubber<
  TList extends Component<any, any> = any,
  S extends readonly ListScrubberSection[] | undefined = undefined,
>(options: UseListScrubberOptions<S> = {}): UseListScrubberResult<TList, S> {
  const { onScroll: userOnScroll, sections } = options;
  const barHeight = Math.max(0, options.topBar?.height ?? 0);
  const listRef = useAnimatedRef<TList>();
  const scrollY = useSharedValue(0);
  // Shared values, not state: the component calling this hook (and its list) doesn't re-render when the
  // list is measured. ListScrubber mirrors them and re-renders on its own.
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  /** Set by the scrubber while its thumb is dragged */
  const isDragging = useSharedValue(false);
  /** How much of the top bar is hidden (pt) */
  const barHidden = useSharedValue(0);
  /** The top bar is sliding back in after a drag */
  const barRevealing = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler(
    (e) => {
      const y = e.contentOffset.y;
      // The top bar follows the scroll by as much as it moves, up or down, within its height, and shows at the
      // very top. Pull-to-refresh and iOS's bounce (negative offsets) don't move it. During a drag it stays as it
      // was (big jumps would show and hide it); while it slides back in, the drag's last scroll mustn't stop it
      if (barHeight > 0 && !isDragging.get() && !barRevealing.get()) {
        const now = Math.max(0, y);
        const delta = now - Math.max(0, scrollY.get());
        barHidden.set(clamp(barHidden.get() + delta, 0, Math.min(barHeight, now)));
      }
      scrollY.set(y);
      userOnScroll?.(e);
    },
    [userOnScroll, barHeight],
  );
  // When the finger lifts from the thumb the top bar slides back in. A drag that ended at the top of the thumb's
  // track is at the first row, below the space the hidden bar left: the list scrolls back to the top with it
  useAnimatedReaction(
    () => isDragging.get(),
    (dragging, was) => {
      if (!was || dragging || barHeight <= 0) return;
      if (barHidden.get() > 0 && scrollY.get() <= barHidden.get() + 0.5) scrollTo(listRef, 0, 0, true);
      revealTopBar(barHidden, barRevealing);
    },
    [barHeight],
  );
  const barVisible = useDerivedValue(() => barHeight - barHidden.get());
  const topBarStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -barHidden.get() }] }));
  const topBar = useMemo(
    () =>
      barHeight > 0
        ? {
            height: barHeight,
            visibleHeight: barVisible,
            show: () => scheduleOnUI(revealTopBar, barHidden, barRevealing),
          }
        : undefined,
    [barHeight, barVisible, barHidden, barRevealing],
  );
  /** What a pinned header below the top bar covers: the rows just below what shows of the bar */
  const pinnedScrollY = useDerivedValue(() => scrollY.get() + barVisible.get());
  // Stable identities: the list and the scrubber get the same props on every render.
  // Which of the list's handlers have run, for the development warning below
  const measured = useRef({ onLayout: false, onContentSizeChange: false });
  // Each handler measures one size; the warning needs to know which, to skip sizes a scrubber doesn't use
  const measuredSizes = useMemo(
    () => ({ onLayout: viewportHeight, onContentSizeChange: contentHeight }),
    [viewportHeight, contentHeight],
  );
  useWarnIfUnmeasured(listRef, measured, measuredSizes);
  const onContentSizeChange = useLatest((width: number, height: number) => {
    measured.current.onContentSizeChange = true;
    contentHeight.set(height);
    options.onContentSizeChange?.(width, height);
  });
  const onLayout = useLatest((e: LayoutChangeEvent) => {
    measured.current.onLayout = true;
    viewportHeight.set(e.nativeEvent.layout.height);
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
      ({
        listRef,
        scrollY,
        contentHeight,
        viewportHeight,
        isDragging,
        ...(topBar && { topBar }),
        ...(sections && { sections }),
      }) as ScrubberProps<TList, S>,
    [listRef, scrollY, contentHeight, viewportHeight, isDragging, topBar, sections],
  );
  const pinnedHeaderProps = useMemo(
    () => ({
      scrollY: topBar ? pinnedScrollY : scrollY,
      sections: sections ?? NO_SECTIONS,
      ...(topBar && { top: topBar.visibleHeight }),
    }),
    [scrollY, pinnedScrollY, topBar, sections],
  );
  const topBarLayout = useMemo((): ViewStyle => ({ ...TOP_BAR, height: barHeight }), [barHeight]);
  const topBarStyles = useMemo(
    (): [ViewStyle, typeof topBarStyle] => [topBarLayout, topBarStyle],
    [topBarLayout, topBarStyle],
  );
  const scrollToOffset = useLatest((offset: number, { animated = false }: ScrollOptions = {}) => {
    scheduleOnUI(scrollToClamped, listRef, contentHeight, viewportHeight, offset, animated);
  });
  const scrollToSection = useLatest((index: number, scrollOptions?: ScrollOptions) => {
    const section = sections?.[index];
    if (section) scrollToOffset(section.offset, scrollOptions);
    else if (__DEV__) {
      console.warn(
        `react-native-list-scrubber: scrollToSection(${index}) has no section to go to: ` +
          `there are ${sections?.length ?? 0} (pass \`sections\` to useListScrubber).`,
      );
    }
  });
  return {
    listRef,
    scrollY,
    onScroll,
    contentHeight,
    viewportHeight,
    isDragging,
    topBar,
    topBarStyle: topBarStyles,
    listProps,
    scrubberProps,
    pinnedHeaderProps,
    scrollToSection,
    scrollToOffset,
  };
}

/** Scrolls within the list's range, read on the UI thread where the sizes are current */
function scrollToClamped(
  listRef: AnimatedRef<any>,
  contentHeight: SharedValue<number>,
  viewportHeight: SharedValue<number>,
  offset: number,
  animated: boolean,
) {
  'worklet';
  const maxScroll = Math.max(0, contentHeight.get() - viewportHeight.get());
  scrollTo(listRef, 0, clamp(offset, 0, maxScroll), animated);
}

/** Slides the top bar fully back in */
function revealTopBar(hidden: SharedValue<number>, revealing: SharedValue<boolean>) {
  'worklet';
  if (hidden.get() <= 0) return;
  revealing.set(true);
  hidden.set(
    withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
      revealing.set(false);
    }),
  );
}

/** Where the top bar sits: over the top of the list, as wide as it */
const TOP_BAR: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0 };

interface ScrollOptions {
  /** Animate the scroll (default false: a long animated scroll shows blank rows until it settles) */
  animated?: boolean;
}

const NO_SECTIONS: readonly ListScrubberSection[] = [];

type ScrubberProps<TList extends Component<any, any>, S> = {
  listRef: AnimatedRef<TList>;
  scrollY: SharedValue<number>;
  contentHeight: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  topBar?: ListScrubberTopBar;
} & (S extends readonly ListScrubberSection[] ? { sections: S } : unknown);

/**
 * What `useListScrubber` returns. `S` is the type of the `sections` passed to it (`undefined` without),
 * e.g. `UseListScrubberResult<any, readonly ListScrubberSection[]>` for a component that takes the hook's
 * result as a prop.
 */
export interface UseListScrubberResult<
  TList extends Component<any, any> = any,
  S extends readonly ListScrubberSection[] | undefined = undefined,
> {
  listRef: AnimatedRef<TList>;
  /** Scroll offset, updated on the UI thread */
  scrollY: SharedValue<number>;
  onScroll: ScrollHandlerProcessed<Record<string, unknown>>;
  /** The list's content height, set as it's measured (a shared value: measuring doesn't re-render you) */
  contentHeight: SharedValue<number>;
  /** The list's own height, set as it's measured */
  viewportHeight: SharedValue<number>;
  /** True while the scrubber's thumb is dragged, set on the UI thread: read it from worklets */
  isDragging: SharedValue<boolean>;
  /**
   * With the `topBar` option: its height, what shows of it now (`visibleHeight`, e.g. to scroll a section in
   * below it with `scrollToOffset(offset - visibleHeight.get())`), and `show()`, which slides it back in (e.g.
   * when its search field is focused)
   */
  topBar: (ListScrubberTopBar & { show: () => void }) | undefined;
  /**
   * Style for the top bar's view (an Animated.View): over the top of the list, as tall as the bar, sliding with
   * the scroll. Add your own background and contents. Without the `topBar` option it isn't needed.
   */
  topBarStyle: [ViewStyle, ReturnType<typeof useAnimatedStyle<ViewStyle>>];
  /** Spread on the list */
  listProps: {
    ref: AnimatedRef<TList>;
    onScroll: ScrollHandlerProcessed<Record<string, unknown>>;
    scrollEventThrottle: number;
    showsVerticalScrollIndicator: boolean;
    onContentSizeChange: (width: number, height: number) => void;
    onLayout: (event: LayoutChangeEvent) => void;
  };
  /** Spread on ListScrubber (with `sections` when the hook was given them) */
  scrubberProps: ScrubberProps<TList, S>;
  /**
   * Spread on PinnedSectionHeader: the hook's `sections` and the scroll position, and with a top bar the
   * header's `top` below it (and a `scrollY` naming the rows there)
   */
  pinnedHeaderProps: {
    scrollY: SharedValue<number>;
    sections: readonly ListScrubberSection[];
    top?: SharedValue<number>;
  };
  /** Scroll to the start of `sections[index]` (the hook's sections) */
  scrollToSection: (index: number, options?: { animated?: boolean }) => void;
  /** Scroll to a content offset, clamped to the list's range */
  scrollToOffset: (offset: number, options?: { animated?: boolean }) => void;
}
