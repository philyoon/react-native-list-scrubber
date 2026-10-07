/**
 * A Jest mock of react-native-list-scrubber, for testing apps that use it. In the app's Jest setup:
 *
 *   jest.mock('react-native-list-scrubber', () => require('react-native-list-scrubber/jest'));
 *
 * It needs no Reanimated, Worklets or Gesture Handler mocks: it imports none of them.
 * - ListScrubber renders its screen-reader control (`<testID>-a11y`, role "adjustable", its label and value)
 *   and nothing else.
 * - PinnedSectionHeader and CurrentSectionLabel show the first section's label.
 * - useListScrubber returns the same shape as the real hook. Its shared values are plain objects with
 *   get/set; listProps' handlers record the list's size and call your own; scrollToSection / scrollToOffset
 *   set `scrollY` to where the real hook would scroll.
 * - listLayout, sectionListLayout, sectionIndexAt and LIST_SCRUBBER_DEFAULTS are the real ones.
 */
import { useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { ListScrubberProps } from './ListScrubber';
import type {
  CurrentSectionLabelProps,
  PinnedSectionHeaderProps,
  usePinnedSectionHeaderStyle as RealUsePinnedSectionHeaderStyle,
} from './PinnedSectionHeader';
import type { ListScrubberSection } from './types';
import { useLatest } from './useLatest';
import type { UseListScrubberOptions, UseListScrubberResult } from './useListScrubber';

export { LIST_SCRUBBER_DEFAULTS } from './defaults';
export { listLayout, sectionListLayout } from './layout';
export { sectionIndexAt } from './math';

/** A stand-in for a Reanimated shared value: `get`, `set` and `value` */
function sharedValue(initial: number): SharedValue<number> {
  let current = initial;
  return {
    get: () => current,
    set: (next: number | ((value: number) => number)) => {
      current = typeof next === 'function' ? next(current) : next;
    },
    get value() {
      return current;
    },
    set value(next: number) {
      current = next;
    },
  } as unknown as SharedValue<number>;
}

const read = (v: number | SharedValue<number>) => (typeof v === 'number' ? v : v.get());

export function ListScrubber<S extends ListScrubberSection = ListScrubberSection>({
  sections,
  contentHeight,
  viewportHeight,
  accessibilityLabel,
  formatAccessibilityPercent = (percent) => `${percent}%`,
  enabled = true,
  testID = 'list-scrubber',
}: ListScrubberProps<S>) {
  if (!enabled || read(contentHeight) <= read(viewportHeight)) return null;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      aria-valuetext={sections?.[0]?.label ?? formatAccessibilityPercent(0)}
      testID={`${testID}-a11y`}
    />
  );
}

export function CurrentSectionLabel({
  sections,
  style,
  testID = 'list-scrubber-section-label',
}: CurrentSectionLabelProps) {
  return (
    <Text style={style} testID={testID}>
      {sections[0]?.label}
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
  // Stable identities, like the real hook's; the handlers read the latest options
  const [values] = useState(() => ({
    listRef: { current: null } as never, // like an animated ref before the list mounts
    scrollY: sharedValue(0),
    contentHeight: sharedValue(0),
    viewportHeight: sharedValue(0),
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
  const scrubberProps = useMemo(
    () => ({ ...values, ...(sections && { sections }) }) as never,
    [values, sections],
  );
  const headerProps = useMemo(() => ({ scrollY, sections: sections ?? NO_SECTIONS }), [scrollY, sections]);
  return {
    ...values,
    onScroll: onScroll as never,
    listProps,
    scrubberProps,
    headerProps,
    scrollToSection,
    scrollToOffset,
  };
}

const NO_SECTIONS: readonly ListScrubberSection[] = [];
