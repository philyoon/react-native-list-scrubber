/**
 * A Jest mock of react-native-list-scrubber, for testing apps that use it. In the app's Jest setup:
 *
 *   jest.mock('react-native-list-scrubber', () => require('react-native-list-scrubber/jest'));
 *
 * It needs no Reanimated, Worklets or Gesture Handler mocks: it imports none of them.
 * - ListScrubber renders its screen-reader control (`<testID>-a11y`, role "adjustable", its label and value)
 *   and nothing else. Its value is the section at the scroll position (or `labelAt`'s label, or a
 *   percentage), like the real one's.
 * - PinnedSectionHeader and CurrentSectionLabel show the section at the scroll position, like the real ones.
 * - useListScrubber returns the same shape as the real hook. Its shared values are plain objects with
 *   get/set; listProps' handlers record the list's size and scroll offset and call your own;
 *   scrollToSection / scrollToOffset set `scrollY` to where the real hook would scroll. The components above
 *   re-render when these values change, so a test can scroll
 *   (`listProps.onScroll({ contentOffset: { y: 300 } })`) and check the label.
 * - listLayout, sectionListLayout, sectionIndexAt and LIST_SCRUBBER_DEFAULTS are the real ones.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Platform, Text, View, type LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { ListScrubberProps } from './ListScrubber';
import type {
  CurrentSectionLabelProps,
  PinnedSectionHeaderProps,
  usePinnedSectionHeaderStyle as RealUsePinnedSectionHeaderStyle,
} from './PinnedSectionHeader';
import { useListHeader } from './ListHeader';
import { labelPosition, sectionIndexAt } from './math';
import type { ListScrubberSection } from './types';
import { useLatest } from './useLatest';
import type { UseListScrubberOptions, UseListScrubberResult } from './useListScrubber';

export { LIST_SCRUBBER_DEFAULTS } from './defaults';
export { listLayout, sectionListLayout } from './layout';
export { sectionIndexAt } from './math';

/** Notifies the components above when one of the hook's values changes, so a test sees what the user would */
const listeners = new WeakMap<object, Set<() => void>>();

/** A stand-in for a Reanimated shared value: `get`, `set` and `value` */
function sharedValue<T>(initial: T): SharedValue<T> {
  let current = initial;
  const value = {
    get: () => current,
    set: (next: T | ((value: T) => T)) => {
      current = typeof next === 'function' ? (next as (value: T) => T)(current) : next;
      listeners.get(value)?.forEach((listener) => listener());
    },
    get value() {
      return current;
    },
    set value(next: T) {
      value.set(next);
    },
  };
  listeners.set(value, new Set());
  return value as unknown as SharedValue<T>;
}

/** A read-only value `by` more than `source`, changing with it (the mock's derived value) */
function offsetBy(source: SharedValue<number>, by: number): SharedValue<number> {
  const value = { get: () => source.get() + by, set: () => {} };
  listeners.set(value, listeners.get(source)!);
  return value as unknown as SharedValue<number>;
}

const read = (v: number | SharedValue<number>) => (typeof v === 'number' ? v : v.get());

/**
 * A number, or a shared value read on each change: the mock's own update; any other read as it is at render
 */
function useValue(v: number | SharedValue<number>): number {
  return useSyncExternalStore(
    (onChange) => {
      const set = typeof v === 'object' ? listeners.get(v) : undefined;
      set?.add(onChange);
      return () => set?.delete(onChange);
    },
    () => read(v),
  );
}

export function ListScrubber<S extends ListScrubberSection = ListScrubberSection>({
  scrollY,
  sections,
  labelAt,
  contentHeight: contentHeightProp,
  viewportHeight: viewportHeightProp,
  accessibilityLabel,
  formatAccessibilityPercent = (percent) => `${percent}%`,
  enabled = true,
  topBar,
  insets,
  testID = 'list-scrubber',
}: ListScrubberProps<S>) {
  const y = useValue(scrollY);
  /** The top bar's visible part and the top inset (a pinned header): the value describes the rows below */
  const cover = useValue(topBar?.visibleHeight ?? 0) + (insets?.top ?? 0);
  const contentHeight = useValue(contentHeightProp);
  const viewportHeight = useValue(viewportHeightProp);
  const maxScroll = contentHeight - viewportHeight;
  if (!enabled || maxScroll <= 0) return null;
  // As the real scrubber's screen-reader value: the section there, else labelAt's label, else a percentage
  const value =
    (sections?.length
      ? sections[
          sectionIndexAt(
            sections.map((s) => s.offset),
            y + cover,
          )
        ]?.label
      : labelAt?.(labelPosition(y, contentHeight, viewportHeight, cover), y)) ??
    formatAccessibilityPercent(Math.round((y / maxScroll) * 100));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      aria-valuetext={value}
      testID={`${testID}-a11y`}
    />
  );
}

export function CurrentSectionLabel({
  scrollY,
  sections,
  style,
  testID = 'list-scrubber-section-label',
}: CurrentSectionLabelProps) {
  const y = useValue(scrollY);
  const label =
    sections[
      sectionIndexAt(
        sections.map((s) => s.offset),
        y,
      )
    ]?.label;
  return (
    <Text style={style} testID={testID}>
      {label}
    </Text>
  );
}

export function PinnedSectionHeader({
  scrollY,
  sections,
  height,
  style,
  textStyle,
  testID = 'list-scrubber-pinned-header',
}: PinnedSectionHeaderProps) {
  return (
    <View style={[{ height }, style]} testID={testID}>
      <CurrentSectionLabel
        scrollY={scrollY}
        sections={sections}
        style={textStyle}
        testID={`${testID}-label`}
      />
    </View>
  );
}

/** An empty style: the header isn't pushed */
export const usePinnedSectionHeaderStyle: typeof RealUsePinnedSectionHeaderStyle = () => ({}) as never;

export function useListScrubber<S extends readonly ListScrubberSection[] | undefined = undefined>(
  options: UseListScrubberOptions<S> = {},
): UseListScrubberResult<S> {
  const { layout, pinnedHeader } = options;
  const barHeight = Math.max(0, options.topBar?.height ?? 0);
  // Placed like the real hook's: a pinned header over a list without section headers of its own takes space
  const ownHeaders = pinnedHeader?.push ?? layout?.sectionHeaders ?? true;
  const pinnedHeight = pinnedHeader && Math.max(0, pinnedHeader.height);
  const pinnedSpace = pinnedHeight !== undefined && !ownHeaders ? pinnedHeight : 0;
  const spacerHeight = barHeight + pinnedSpace;
  const hasLayout = layout !== undefined;
  const given = layout ? layout.sections : options.sections;
  const sections = useMemo(
    () =>
      hasLayout && spacerHeight > 0 && given
        ? (given.map((s, i) => (i === 0 ? s : { ...s, offset: s.offset + spacerHeight })) as unknown as S)
        : given,
    [given, spacerHeight, hasLayout],
  );
  // Stable identities, like the real hook's; the handlers read the latest options
  const [values] = useState(() => ({
    listRef: { current: null } as never, // like an animated ref before the list mounts
    scrollY: sharedValue<number>(0),
    contentHeight: sharedValue<number>(0),
    viewportHeight: sharedValue<number>(0),
    isDragging: sharedValue<boolean>(false), // the mock's thumb is never dragged
  }));
  const { scrollY, contentHeight, viewportHeight } = values;
  const onScroll = useLatest((event: { contentOffset: { y: number } }) => {
    scrollY.set(event.contentOffset.y);
    options.onScroll?.(event as never);
  });
  const onContentSizeChange = useLatest((width: number, height: number) => {
    contentHeight.set(height);
    options.onContentSizeChange?.(width, height);
  });
  const onLayout = useLatest((event: LayoutChangeEvent) => {
    viewportHeight.set(event.nativeEvent.layout.height);
    options.onLayout?.(event);
  });
  const scrollToOffset = useLatest((offset: number) => {
    const maxScroll = Math.max(0, contentHeight.get() - viewportHeight.get());
    scrollY.set(Math.min(maxScroll, Math.max(0, offset - barHeight - pinnedSpace)));
  });
  const scrollToSection = useLatest((index: number) => {
    const section = sections?.[index];
    if (section) scrollToOffset(section.offset);
  });
  const listProps = useMemo(
    () => ({
      ref: values.listRef,
      onScroll: onScroll as never,
      scrollEventThrottle: 16,
      showsVerticalScrollIndicator: false,
      onContentSizeChange,
      onLayout,
    }),
    [values, onScroll, onContentSizeChange, onLayout],
  );
  const getItemLayout = useLatest((data: unknown, index: number) => {
    const row = layout!.getItemLayout(data, index);
    return { ...row, offset: row.offset + spacerHeight };
  });
  // The real one: the spacer, then your own header, following them in the same render. Without its warning
  // that the spacer is never drawn: tests don't lay views out
  const ListHeader = useListHeader(spacerHeight, options.ListHeaderComponent, false);
  const hasHeader = spacerHeight > 0 || options.ListHeaderComponent !== undefined;
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
  // The mock's top bar always shows in full and stays in place, as the real one does with a screen reader on
  // (isFixed): the pinned header sits below it and names the rows there, scrollToOffset brings an offset to
  // just below it, hide() leaves it, and onVisibilityChange is never called
  const topBar = useMemo(() => {
    if (barHeight <= 0) return undefined;
    const visibleHeight = sharedValue(barHeight);
    const show = () => visibleHeight.set(barHeight);
    const hide = () => {};
    return { height: barHeight, visibleHeight, isFixed: sharedValue(true), show, hide };
  }, [barHeight]);
  const topBarProps = useMemo(
    () => ({
      style: [
        { position: 'absolute', top: 0, left: 0, right: 0, height: barHeight },
        {},
      ] as UseListScrubberResult['topBarProps']['style'],
      ...(Platform.OS === 'web' && topBar && { onFocus: topBar.show }),
    }),
    [barHeight, topBar],
  );
  const scrubberProps = useMemo(
    () =>
      ({
        ...values,
        ...(topBar && { topBar }),
        ...(pinnedSpace > 0 && { insets: { top: pinnedSpace } }),
        ...(sections && { sections }),
      }) as never,
    [values, topBar, pinnedSpace, sections],
  );
  const pinnedHeaderProps = useMemo(
    () => ({
      scrollY: spacerHeight > 0 ? offsetBy(scrollY, spacerHeight) : scrollY,
      sections: sections ?? NO_SECTIONS,
      ...(topBar && { top: topBar.visibleHeight }),
      ...(pinnedHeight !== undefined && { height: pinnedHeight, push: ownHeaders }),
    }),
    [scrollY, topBar, spacerHeight, sections, pinnedHeight, ownHeaders],
  );
  return {
    scrollY: values.scrollY,
    isDragging: values.isDragging,
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

const NO_SECTIONS: readonly ListScrubberSection[] = [];
