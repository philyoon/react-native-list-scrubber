import { useMemo, useRef, type Component } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type AnimatedRef,
  type ScrollEvent,
  type ScrollHandlerProcessed,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { clamp } from './math';
import type { ListScrubberSection } from './types';
import { useLatest } from './useLatest';
import { useWarnIfUnmeasured } from './validate';

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
  const listRef = useAnimatedRef<TList>();
  const scrollY = useSharedValue(0);
  // Shared values, not state: the component calling this hook (and its list) doesn't re-render when the
  // list is measured. ListScrubber mirrors them and re-renders on its own.
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  /** Set by the scrubber while its thumb is dragged */
  const isDragging = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler(
    (e) => {
      scrollY.set(e.contentOffset.y);
      userOnScroll?.(e);
    },
    [userOnScroll],
  );
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
        ...(sections && { sections }),
      }) as ScrubberProps<TList, S>,
    [listRef, scrollY, contentHeight, viewportHeight, isDragging, sections],
  );
  const headerProps = useMemo(() => ({ scrollY, sections: sections ?? NO_SECTIONS }), [scrollY, sections]);
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
    listProps,
    scrubberProps,
    headerProps,
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
  /**
   * True while the scrubber's thumb is dragged, set on the UI thread: read it from worklets, e.g. to keep a
   * collapsing header hidden during a drag
   */
  isDragging: SharedValue<boolean>;
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
  /** Spread on PinnedSectionHeader: `scrollY` and the hook's `sections` */
  headerProps: { scrollY: SharedValue<number>; sections: readonly ListScrubberSection[] };
  /** Scroll to the start of `sections[index]` (the hook's sections) */
  scrollToSection: (index: number, options?: { animated?: boolean }) => void;
  /** Scroll to a content offset, clamped to the list's range */
  scrollToOffset: (offset: number, options?: { animated?: boolean }) => void;
}
