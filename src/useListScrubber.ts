import { useEffect, useMemo, useRef, useState, type Component, type ComponentType } from 'react';
import { AccessibilityInfo, Platform, type LayoutChangeEvent, type ViewStyle } from 'react-native';
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
import { LIST_SCRUBBER_DEFAULTS } from './defaults';
import { clamp, scrollBelowBar } from './math';
import { useListHeader, type ListHeaderContent } from './ListHeader';
import type { ListScrubberLayout, ListScrubberSection, ListScrubberTopBar } from './types';
import { useLatest } from './useLatest';
import { useStableSections, useWarnIfUnmeasured, useWarnIfUnstable } from './validate';

interface BaseOptions {
  /**
   * A bar over the top of the list (a title, a search field…) that slides away as the list scrolls down and
   * comes back on a scroll up. Draw it inside a view that spreads `topBarProps`. The list's spread draws the
   * space it needs at the top, and `scrubberProps` and `pinnedHeaderProps` keep the scrubber and the pinned
   * header below it. During a thumb drag it stays as it was, and it slides back in when the finger lifts,
   * over `revealMs` (default: LIST_SCRUBBER_DEFAULTS.topBar.revealMs).
   */
  topBar?: { height: number; revealMs?: number };
  /**
   * A PinnedSectionHeader `height` tall: `pinnedHeaderProps` carry its height and placement. Over a list with
   * section headers of its own (a SectionList's, as `sectionListLayout` gives) it sits over them, and the
   * next one pushes it out; over one without (a flat list's) it takes its own space at the top of the list,
   * and the scrubber stays below it. With hand-made `sections`, say which with `push` (default true: the list
   * has section headers of its own).
   */
  pinnedHeader?: { height: number; push?: boolean };
  /**
   * Your own list header, with a top bar or a pinned header: the list's spread draws it below the space they
   * need. Give it here rather than to the list. Its height goes to listLayout's `listHeaderHeight`.
   */
  ListHeaderComponent?: ListHeaderContent;
  // The list's own handlers, called after the scrubber's (listProps sets these props on the list)
  /**
   * A worklet (runs on the UI thread). Keep its identity stable, e.g. define it outside the component
   * (development builds warn when it changes on every render).
   */
  onScroll?: (event: ScrollEvent) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
}

export type UseListScrubberOptions<S extends readonly ListScrubberSection[] | undefined = undefined> =
  BaseOptions &
    (
      | {
          /**
           * The list's layout, from `listLayout` or `sectionListLayout` (wrap it in useMemo). Its sections
           * ride in `scrubberProps` and `pinnedHeaderProps`, and its `getItemLayout` in `flatListProps` and
           * `sectionListProps`, all placed below a top bar or a pinned header.
           */
          layout: Omit<ListScrubberLayout, 'sections'> & { sections: S };
          sections?: undefined;
        }
      | {
          /**
           * Sections built by hand (ascending offsets, in the list's own coordinates: below anything the
           * list draws at its top). `scrubberProps` and `pinnedHeaderProps` carry them, so the scrubber and a
           * pinned header always read the same ones.
           */
          sections?: S;
          layout?: undefined;
        }
    );

/**
 * State for one list + scrubber pair. Spread `listProps` on the list, `scrubberProps` on the scrubber and,
 * with a pinned header, `pinnedHeaderProps` on it:
 *
 *   const scrubber = useListScrubber(listLayout(rows, { sectionLabel: (row) => …, itemHeight: ROW }));
 *   <Animated.FlatList {...scrubber.listProps} data={rows} renderItem={…} />
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
// `any`: works with any scrollable component. TList comes first: S is inferred from `options`, so TList is
// the only one to write out
export function useListScrubber<
  TList extends Component<any, any> = any,
  S extends readonly ListScrubberSection[] | undefined = undefined,
>(options: UseListScrubberOptions<S> = {}): UseListScrubberResult<S, TList> {
  const { onScroll: userOnScroll, layout, pinnedHeader } = options;
  const barHeight = Math.max(0, options.topBar?.height ?? 0);
  /** The list draws section headers of its own, which a pinned header sits over */
  const ownHeaders = pinnedHeader?.push ?? layout?.sectionHeaders ?? true;
  /** Space a pinned header takes at the top of a list without section headers of its own */
  const pinnedHeight = pinnedHeader && Math.max(0, pinnedHeader.height);
  const pinnedSpace = pinnedHeight !== undefined && !ownHeaders ? pinnedHeight : 0;
  /** What the list draws at its top for the top bar and the pinned header */
  const spacerHeight = barHeight + pinnedSpace;
  const hasLayout = layout !== undefined;
  const given = useStableSections(layout ? layout.sections : options.sections);
  // A layout's sections, placed below the spacer. The first stays at 0: it covers what's above it
  const sections = useMemo(
    () =>
      hasLayout && spacerHeight > 0 && given
        ? (given.map((s, i) => (i === 0 ? s : { ...s, offset: s.offset + spacerHeight })) as unknown as S)
        : given,
    [given, spacerHeight, hasLayout],
  );
  const revealMs = options.topBar?.revealMs ?? LIST_SCRUBBER_DEFAULTS.topBar.revealMs;
  useWarnIfUnstable(userOnScroll);
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
  // With a screen reader on, the bar stays in place: hidden, its title and search field would still be in the
  // screen reader's reach, off screen. Not on the web, where a page can't tell (React Native Web always says
  // yes): there the app shows the bar when something in it gets focus
  const screenReader = useScreenReaderEnabled(barHeight > 0 && Platform.OS !== 'web');
  const barPinned = useSharedValue(false);
  useEffect(() => {
    barPinned.set(screenReader);
    if (screenReader) scheduleOnUI(revealTopBar, barHidden, barRevealing, revealMs);
  }, [screenReader, barPinned, barHidden, barRevealing, revealMs]);
  const onScroll = useAnimatedScrollHandler(
    (e) => {
      const y = e.contentOffset.y;
      // The top bar follows the scroll by as much as it moves, up or down, within its height, and shows at
      // the very top. Pull-to-refresh and iOS's bounce (negative offsets) don't move it. During a drag it
      // stays as it was (big jumps would show and hide it); while it slides back in,
      // the drag's last scroll mustn't stop it
      if (barHeight > 0 && !barPinned.get() && !isDragging.get() && !barRevealing.get()) {
        const now = Math.max(0, y);
        const delta = now - Math.max(0, scrollY.get());
        barHidden.set(clamp(barHidden.get() + delta, 0, Math.min(barHeight, now)));
      }
      scrollY.set(y);
      userOnScroll?.(e);
    },
    [userOnScroll, barHeight],
  );
  // When the finger lifts from the thumb the top bar slides back in. A drag that ended at the top of the
  // thumb's track is at the first row, below the space the hidden bar left: the list scrolls back
  // to the top with it
  useAnimatedReaction(
    () => isDragging.get(),
    (dragging, was) => {
      if (!was || dragging || barHeight <= 0) return;
      if (barHidden.get() > 0 && scrollY.get() <= barHidden.get() + 0.5) scrollTo(listRef, 0, 0, true);
      revealTopBar(barHidden, barRevealing, revealMs);
    },
    [barHeight, revealMs],
  );
  const barVisible = useDerivedValue(() => barHeight - barHidden.get());
  const topBarStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -barHidden.get() }] }));
  const topBar = useMemo(
    () =>
      barHeight > 0
        ? {
            height: barHeight,
            visibleHeight: barVisible,
            isFixed: barPinned,
            show: () => scheduleOnUI(revealTopBar, barHidden, barRevealing, revealMs),
          }
        : undefined,
    [barHeight, barVisible, barPinned, barHidden, barRevealing, revealMs],
  );
  /**
   * What a pinned header below the top bar names: the rows just below the bar's visible part or, over a list
   * without section headers of its own, the rows just below the pinned header itself
   */
  const pinnedScrollY = useDerivedValue(() => scrollY.get() + barVisible.get() + pinnedSpace);
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
  // The layout's rows, placed below the spacer. Stable: a layout rebuilt on a render doesn't re-render the
  // list
  const getItemLayout = useLatest((data: unknown, index: number): ItemLayout => {
    const row = layout!.getItemLayout(data, index);
    return spacerHeight > 0 ? { ...row, offset: row.offset + spacerHeight } : row;
  });
  const ListHeader = useListHeader(spacerHeight, options.ListHeaderComponent);
  const hasHeader = spacerHeight > 0 || options.ListHeaderComponent !== undefined;
  // One spread per list, each with only the props that list documents
  const flatListProps = useMemo(
    () => ({
      ...listProps,
      ...(hasLayout && { getItemLayout }),
      ...(hasHeader && { ListHeaderComponent: ListHeader }),
    }),
    [listProps, hasLayout, getItemLayout, hasHeader, ListHeader],
  );
  const headerListProps = useMemo(
    () => ({ ...listProps, ...(hasHeader && { ListHeaderComponent: ListHeader }) }),
    [listProps, hasHeader, ListHeader],
  );
  const insets = useMemo(() => (pinnedSpace > 0 ? { top: pinnedSpace } : undefined), [pinnedSpace]);
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
        ...(insets && { insets }),
        ...(sections && { sections }),
      }) as ScrubberProps<TList, S>,
    [listRef, scrollY, contentHeight, viewportHeight, isDragging, topBar, insets, sections],
  );
  const pinnedHeaderProps = useMemo(
    () => ({
      scrollY: topBar || pinnedSpace > 0 ? pinnedScrollY : scrollY,
      sections: sections ?? NO_SECTIONS,
      ...(topBar && { top: topBar.visibleHeight }),
      ...(pinnedHeight !== undefined && { height: pinnedHeight, push: ownHeaders }),
    }),
    [scrollY, pinnedScrollY, pinnedSpace, topBar, sections, pinnedHeight, ownHeaders],
  );
  const topBarLayout = useMemo((): ViewStyle => ({ ...TOP_BAR, height: barHeight }), [barHeight]);
  const showTopBar = topBar?.show;
  const topBarProps = useMemo(
    () => ({
      style: [topBarLayout, topBarStyle] as [ViewStyle, typeof topBarStyle],
      // On the web the bar keeps sliding with a screen reader on (a page can't tell), so it comes back when
      // something in it gets focus, e.g. tabbing to its search field. Focus events bubble there
      ...(Platform.OS === 'web' && showTopBar && { onFocus: showTopBar }),
    }),
    [topBarLayout, topBarStyle, showTopBar],
  );
  const scrollToOffset = useLatest((offset: number, { animated = false }: ScrollOptions = {}) => {
    const bar = { height: barHeight, hidden: barHidden, fixed: barPinned, revealing: barRevealing };
    const to = offset - pinnedSpace; // the pinned header covers the top below the bar for good
    scheduleOnUI(scrollToVisible, listRef, scrollY, contentHeight, viewportHeight, bar, to, animated);
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
    topBarProps,
    listProps,
    flatListProps,
    sectionListProps: flatListProps,
    flashListProps: headerListProps,
    legendListProps: headerListProps,
    scrollViewProps: listProps,
    ListHeader,
    spacerHeight,
    scrubberProps,
    pinnedHeaderProps,
    scrollToSection,
    scrollToOffset,
  };
}

/**
 * Scrolls so content offset `offset` comes to the top of the list's visible part, below a top bar where it
 * will be once it has followed the scroll; within the list's range, read on the UI thread where the sizes and
 * the bar are current
 */
function scrollToVisible(
  listRef: AnimatedRef<any>,
  scrollY: SharedValue<number>,
  contentHeight: SharedValue<number>,
  viewportHeight: SharedValue<number>,
  bar: {
    height: number;
    hidden: SharedValue<number>;
    fixed: SharedValue<boolean>;
    revealing: SharedValue<boolean>;
  },
  offset: number,
  animated: boolean,
) {
  'worklet';
  const maxScroll = Math.max(0, contentHeight.get() - viewportHeight.get());
  // While it slides back in, the bar ignores scrolling and ends up in full
  const revealing = bar.revealing.get();
  const state = {
    height: bar.height,
    hidden: revealing ? 0 : bar.hidden.get(),
    fixed: revealing || bar.fixed.get(),
  };
  scrollTo(listRef, 0, scrollBelowBar(offset, scrollY.get(), state, maxScroll).scroll, animated);
}

/**
 * Whether a screen reader (VoiceOver, TalkBack) is on, followed as it changes; false while `watch` is false
 */
function useScreenReaderEnabled(watch: boolean): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!watch) return;
    let current = true;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => current && setEnabled(on));
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      current = false;
      subscription.remove();
    };
  }, [watch]);
  return watch && enabled;
}

/** Slides the top bar fully back in, over `durationMs` */
function revealTopBar(hidden: SharedValue<number>, revealing: SharedValue<boolean>, durationMs: number) {
  'worklet';
  if (hidden.get() <= 0) return;
  revealing.set(true);
  hidden.set(
    withTiming(0, { duration: durationMs, easing: Easing.out(Easing.cubic) }, () => {
      revealing.set(false);
    }),
  );
}

/** Where the top bar sits: over the top of the list, as wide as it */
const TOP_BAR: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0 };

/** One row's place in the list, as FlatList's and SectionList's `getItemLayout` give it */
interface ItemLayout {
  length: number;
  offset: number;
  index: number;
}

interface ScrollOptions {
  /** Animate the scroll (default false: a long animated scroll shows blank rows until it settles) */
  animated?: boolean;
}

const NO_SECTIONS: readonly ListScrubberSection[] = [];

interface ListProps<TList extends Component<any, any>> {
  ref: AnimatedRef<TList>;
  onScroll: ScrollHandlerProcessed<Record<string, unknown>>;
  scrollEventThrottle: number;
  showsVerticalScrollIndicator: boolean;
  onContentSizeChange: (width: number, height: number) => void;
  onLayout: (event: LayoutChangeEvent) => void;
}

interface HeaderListProps<TList extends Component<any, any>> extends ListProps<TList> {
  /** With a top bar, a pinned header that takes its own space, or your own `ListHeaderComponent` */
  ListHeaderComponent?: ComponentType;
}

interface VirtualizedListProps<TList extends Component<any, any>> extends HeaderListProps<TList> {
  /** With a `layout` */
  getItemLayout?: (data: unknown, index: number) => ItemLayout;
}

type ScrubberProps<TList extends Component<any, any>, S> = {
  listRef: AnimatedRef<TList>;
  scrollY: SharedValue<number>;
  contentHeight: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  topBar?: ListScrubberTopBar;
  /** With a pinned header that takes its own space: the scrubber stays below it */
  insets?: { top: number };
} & (S extends readonly ListScrubberSection[] ? { sections: S } : unknown);

/**
 * What `useListScrubber` returns. `S` is the type of the `sections` passed to it (`undefined` without),
 * e.g. `UseListScrubberResult<readonly ListScrubberSection[]>` for a component that takes the hook's
 * result as a prop. `TList` is the list component's type.
 */
export interface UseListScrubberResult<
  S extends readonly ListScrubberSection[] | undefined = undefined,
  TList extends Component<any, any> = any,
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
   * With the `topBar` option: the bar's height, `visibleHeight` (how much of it is on screen), `isFixed`
   * (it stays in place, with a screen reader on), and `show()`, which slides it back in
   */
  topBar: (ListScrubberTopBar & { show: () => void }) | undefined;
  /**
   * Spread on an Animated.View that holds the top bar: its `style` puts it over the top of the list, as tall
   * as the bar, sliding with the scroll, and on the web its `onFocus` brings the bar back when something in
   * it gets focus. Draw the bar inside it. Without the `topBar` option it isn't needed.
   */
  topBarProps: {
    style: [ViewStyle, ReturnType<typeof useAnimatedStyle<ViewStyle>>];
    onFocus?: () => void;
  };
  /**
   * Spread on a scrollable component the hook has no spread of its own for: only the props every scrollable
   * component takes (ScrollView's)
   */
  listProps: ListProps<TList>;
  /** Spread on an Animated.FlatList: `listProps`, the layout's `getItemLayout` and the list header */
  flatListProps: VirtualizedListProps<TList>;
  /** Spread on an animated SectionList: the same as `flatListProps` */
  sectionListProps: VirtualizedListProps<TList>;
  /** Spread on an animated FlashList: `listProps` and the list header */
  flashListProps: HeaderListProps<TList>;
  /** Spread on an AnimatedLegendList: `listProps` and the list header */
  legendListProps: HeaderListProps<TList>;
  /**
   * Spread on an Animated.ScrollView: `listProps`. A ScrollView has no ListHeaderComponent: with a top bar, a
   * pinned header or your own list header, put `<scrubber.ListHeader />` first in it
   */
  scrollViewProps: ListProps<TList>;
  /**
   * The list's header, which the spreads give the list: the space a top bar or a pinned header needs at the
   * top, then your own `ListHeaderComponent`. Render it yourself only in a ScrollView
   */
  ListHeader: ComponentType;
  /** How much space the top bar and the pinned header need at the top of the list (pt), e.g. for a
   * RefreshControl's `progressViewOffset` */
  spacerHeight: number;
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
    /** With the `pinnedHeader` option */
    height?: number;
    /** With the `pinnedHeader` option */
    push?: boolean;
  };
  /** Scroll so `sections[index]` (the hook's sections) starts at the top of the list, below a top bar */
  scrollToSection: (index: number, options?: { animated?: boolean }) => void;
  /**
   * Scroll so a content offset is at the top of the list, clamped to its range. With a top bar, just below
   * the bar's visible part, where it will be once it has followed the scroll
   */
  scrollToOffset: (offset: number, options?: { animated?: boolean }) => void;
}
