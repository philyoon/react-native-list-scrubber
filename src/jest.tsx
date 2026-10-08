/**
 * A Jest mock of react-native-list-scrubber, for testing apps that use it. In the app's Jest setup:
 *
 *   jest.mock('react-native-list-scrubber', () => require('react-native-list-scrubber/jest'));
 *
 * It needs no Reanimated, Worklets or Gesture Handler mocks: it imports none of them.
 * - ListScrubber renders its screen-reader control (`<testID>-a11y`, role "adjustable", its label and value)
 *   and nothing else. Its value is the section at the scroll position (or `labelAt`'s label, or a percentage),
 *   like the real one's.
 * - PinnedSectionHeader and CurrentSectionLabel show the section at the scroll position, like the real ones.
 * - useListScrubber returns the same shape as the real hook. Its shared values are plain objects with
 *   get/set; listProps' handlers record the list's size and scroll offset and call your own; scrollToSection /
 *   scrollToOffset set `scrollY` to where the real hook would scroll. The components above re-render when
 *   these values change, so a test can scroll (`listProps.onScroll({ contentOffset: { y: 300 } })`) and check
 *   the label.
 * - listLayout, sectionListLayout, sectionIndexAt and LIST_SCRUBBER_DEFAULTS are the real ones.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { ListScrubberProps } from './ListScrubber';
import type {
  CurrentSectionLabelProps,
  PinnedSectionHeaderProps,
  usePinnedSectionHeaderStyle as RealUsePinnedSectionHeaderStyle,
} from './PinnedSectionHeader';
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

/** A number, or a shared value read on each change: the mock's own update; any other read as it is at render */
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
  testID = 'list-scrubber',
}: ListScrubberProps<S>) {
  const y = useValue(scrollY);
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
            y,
          )
        ]?.label
      : labelAt?.(labelPosition(y, contentHeight, viewportHeight), y)) ??
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
): UseListScrubberResult<any, S> {
  const { sections } = options;
  const barHeight = Math.max(0, options.topBar?.height ?? 0);
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
    scrollY.set(Math.min(maxScroll, Math.max(0, offset)));
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
  // The mock's top bar always shows in full: the pinned header sits below it and names the rows there
  const topBar = useMemo(() => {
    if (barHeight <= 0) return undefined;
    const visibleHeight = sharedValue(barHeight);
    return { height: barHeight, visibleHeight, show: () => visibleHeight.set(barHeight) };
  }, [barHeight]);
  const topBarStyle = useMemo(
    () =>
      [
        { position: 'absolute', top: 0, left: 0, right: 0, height: barHeight },
        {},
      ] as UseListScrubberResult['topBarStyle'],
    [barHeight],
  );
  const scrubberProps = useMemo(
    () => ({ ...values, ...(topBar && { topBar }), ...(sections && { sections }) }) as never,
    [values, topBar, sections],
  );
  const pinnedHeaderProps = useMemo(
    () => ({
      scrollY: topBar ? offsetBy(scrollY, barHeight) : scrollY,
      sections: sections ?? NO_SECTIONS,
      ...(topBar && { top: topBar.visibleHeight }),
    }),
    [scrollY, topBar, barHeight, sections],
  );
  return {
    ...values,
    onScroll: onScroll as never,
    topBar,
    topBarStyle,
    listProps,
    scrubberProps,
    pinnedHeaderProps,
    scrollToSection,
    scrollToOffset,
  };
}

const NO_SECTIONS: readonly ListScrubberSection[] = [];
