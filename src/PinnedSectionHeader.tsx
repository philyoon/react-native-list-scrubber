import { useMemo } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { MAX_FONT_SCALE } from './defaults';
import { LabelStrip } from './LabelStrip';
import { sectionIndexAt } from './math';
import type { ListScrubberSection } from './types';
import { warnIfUnsorted } from './validate';

export interface PinnedSectionHeaderProps {
  scrollY: SharedValue<number>;
  /** Section offsets are where each section's header starts in the list */
  sections: readonly ListScrubberSection[];
  /** Header height */
  height: number;
  /** The next section's header pushes this one out (default true) */
  push?: boolean;
  /** The header box, e.g. background and padding */
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** Cap on the system text size for the label (default 1.5): the header doesn't grow with it */
  maxFontSizeMultiplier?: number;
  /** Test ID of the header; its label is `<testID>-label` (default 'list-scrubber-pinned-header') */
  testID?: string;
}

/**
 * A section header pinned over the top of the list, showing the current section's label. Drawn on the
 * UI thread, so it changes in the same frame as the list, even during scrubber jumps. Put it next to the
 * list, inside the same container. As the next section's own header (in the list) reaches it, it is pushed
 * up and out like iOS Contacts; pass `push={false}` when the list has no section headers of its own.
 */
export function PinnedSectionHeader({
  scrollY,
  sections,
  height,
  push = true,
  style,
  textStyle,
  maxFontSizeMultiplier,
  testID = 'list-scrubber-pinned-header',
}: PinnedSectionHeaderProps) {
  const pushStyle = usePinnedSectionHeaderStyle(scrollY, sections, height);
  return (
    <View style={[styles.pinned, { height }]} testID={testID}>
      <Animated.View style={[styles.header, { height }, style, push && pushStyle]}>
        <CurrentSectionLabel
          scrollY={scrollY}
          sections={sections}
          style={textStyle}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          testID={`${testID}-label`}
        />
      </Animated.View>
    </View>
  );
}

export interface CurrentSectionLabelProps {
  scrollY: SharedValue<number>;
  sections: readonly ListScrubberSection[];
  /**
   * Height of one label line. Default: the style's lineHeight, else 1.3 × fontSize, scaled with the
   * system text size (up to maxFontSizeMultiplier). A height you pass is used as is.
   */
  height?: number;
  style?: StyleProp<TextStyle>;
  /** Cap on the system text size (default 1.5) */
  maxFontSizeMultiplier?: number;
  /** Test ID of the label; its strip is `<testID>-strip` (default 'list-scrubber-section-label') */
  testID?: string;
}

/**
 * The label of the section at the top of the list, drawn on the UI thread: PinnedSectionHeader's label,
 * for building a custom pinned header. Native sticky headers (SectionList) only pin headers of rows already rendered,
 * so they show the wrong section while the scrubber jumps; this one follows the scroll position
 * directly. Hidden from screen readers (the list's own headers are read instead).
 * Renders every label once, so it suits up to a few hundred sections.
 */
export function CurrentSectionLabel({
  scrollY,
  sections,
  height,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  testID = 'list-scrubber-section-label',
}: CurrentSectionLabelProps) {
  // Memoized: worklets copy what they capture to the UI thread whenever its identity changes.
  const offsets = useMemo(() => {
    const values = sections.map((s) => s.offset);
    warnIfUnsorted(values, sections, 'sections');
    return values;
  }, [sections]);
  const labels = useMemo(() => sections.map((s) => s.label), [sections]);
  const flat = StyleSheet.flatten(style) ?? {};
  // Text scales with the system text size, so its row must too, or the strip's window clips it
  const scale = Math.min(useWindowDimensions().fontScale, maxFontSizeMultiplier);
  const lineHeight = height ?? Math.ceil((flat.lineHeight ?? (flat.fontSize ?? 14) * 1.3) * scale);
  const index = useDerivedValue(() => sectionIndexAt(offsets, scrollY.get()));
  return (
    <View
      style={styles.passThrough}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <LabelStrip
        testID={`${testID}-strip`}
        index={index}
        labels={labels}
        height={lineHeight}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={style}
      />
    </View>
  );
}

/**
 * Animated style for a pinned section header: as the next section's own header (in the list) reaches
 * it, the pinned header is pushed up and out, like iOS Contacts, instead of being swapped underneath.
 * For a custom pinned header (PinnedSectionHeader uses it): put it on the view that holds the header,
 * inside a container with `overflow: 'hidden'`.
 * `height` is the header's height; section offsets are where each section's header starts.
 */
export function usePinnedSectionHeaderStyle(
  scrollY: SharedValue<number>,
  sections: readonly ListScrubberSection[],
  height: number,
) {
  const offsets = useMemo(() => {
    const values = sections.map((s) => s.offset);
    warnIfUnsorted(values, sections, 'sections');
    return values;
  }, [sections]);
  return useAnimatedStyle(() => {
    const y = scrollY.get();
    const next = offsets[sectionIndexAt(offsets, y) + 1];
    const push = next === undefined || y < 0 ? 0 : Math.min(0, next - y - height);
    return { transform: [{ translateY: push }] };
  });
}

const styles = StyleSheet.create({
  pinned: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', pointerEvents: 'none' },
  passThrough: { pointerEvents: 'none' },
  header: { justifyContent: 'center' },
});
