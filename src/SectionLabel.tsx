import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { LabelStrip } from './LabelStrip';
import { sectionIndexAt } from './math';
import type { ListScrubberSection } from './types';

/**
 * The label of the section at the top of the list, drawn on the UI thread: use it for a pinned
 * header over the list. Native sticky headers (SectionList) only pin headers of rows already rendered,
 * so they show the wrong section while the scrubber jumps; this one follows the scroll position
 * directly. Hidden from screen readers (the list's own headers are read instead).
 * Renders every label once, so it suits up to a few hundred sections.
 */
export function SectionLabel({
  scrollY,
  sections,
  height,
  style,
}: {
  scrollY: SharedValue<number>;
  sections: readonly ListScrubberSection[];
  /** Height of one label line (default: the style's lineHeight, else 1.3 × fontSize) */
  height?: number;
  style?: StyleProp<TextStyle>;
}) {
  // Memoized: worklets copy what they capture to the UI thread whenever its identity changes.
  const offsets = useMemo(() => sections.map((s) => s.offset), [sections]);
  const labels = useMemo(() => sections.map((s) => s.label), [sections]);
  const flat = StyleSheet.flatten(style) ?? {};
  const lineHeight = height ?? flat.lineHeight ?? Math.ceil((flat.fontSize ?? 14) * 1.3);
  const index = useDerivedValue(() => sectionIndexAt(offsets, scrollY.get()));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="list-scrubber-section-label"
    >
      <LabelStrip
        testID="list-scrubber-label-strip"
        index={index}
        labels={labels}
        height={lineHeight}
        style={style}
      />
    </View>
  );
}

/**
 * Animated style for a pinned section header: as the next section's own header (in the list) reaches
 * it, the pinned header is pushed up and out, like iOS Contacts, instead of being swapped underneath.
 * Put it on the view that holds the pinned header, inside a container with `overflow: 'hidden'`.
 * `height` is the header's height; section offsets are where each section's header starts.
 */
export function usePinnedHeaderStyle(
  scrollY: SharedValue<number>,
  sections: readonly ListScrubberSection[],
  height: number,
) {
  const offsets = useMemo(() => sections.map((s) => s.offset), [sections]);
  return useAnimatedStyle(() => {
    const y = scrollY.get();
    const next = offsets[sectionIndexAt(offsets, y) + 1];
    const push = next === undefined || y < 0 ? 0 : Math.min(0, next - y - height);
    return { transform: [{ translateY: push }] };
  });
}
