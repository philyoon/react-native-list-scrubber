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
import { SectionText } from './SectionText';
import { sectionIndexAt } from './math';
import type { ListScrubberSection } from './types';
import { useSectionOffsets, useStableSections, warnOnce } from './validate';

export interface PinnedSectionHeaderProps {
  scrollY: SharedValue<number>;
  /** Section offsets are where each section's header starts in the list */
  sections: readonly ListScrubberSection[];
  /** Header height. `useListScrubber`'s `pinnedHeaderProps` carry it when given its `pinnedHeader` option */
  height?: number;
  /** The next section's header pushes this one out (default true) */
  push?: boolean;
  /**
   * Distance from the top of the list (default 0), e.g. below a top bar: `useListScrubber`'s
   * `pinnedHeaderProps` pass the visible height of its `topBar`, and a `scrollY` that names the rows below it
   */
  top?: number | SharedValue<number>;
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
  height: heightProp,
  push = true,
  top = 0,
  style,
  textStyle,
  maxFontSizeMultiplier,
  testID = 'list-scrubber-pinned-header',
}: PinnedSectionHeaderProps) {
  if (__DEV__ && heightProp === undefined) {
    warnOnce(
      'pinned height',
      'react-native-list-scrubber: PinnedSectionHeader has no `height`: pass it, or give useListScrubber ' +
        '`pinnedHeader: { height }` and spread its pinnedHeaderProps.',
    );
  }
  const height = heightProp ?? 0;
  const pushStyle = usePinnedSectionHeaderStyle(scrollY, sections, height);
  const topStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: typeof top === 'number' ? top : top.get() }],
  }));
  return (
    <Animated.View style={[styles.pinned, { height }, topStyle]} testID={testID}>
      <Animated.View style={[styles.header, { height }, style, push && pushStyle]}>
        <CurrentSectionLabel
          scrollY={scrollY}
          sections={sections}
          style={textStyle}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          testID={`${testID}-label`}
        />
      </Animated.View>
    </Animated.View>
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
  /** Test ID of the label; its text field is `<testID>-text` (default 'list-scrubber-section-label') */
  testID?: string;
}

/**
 * The label of the section at the top of the list, drawn on the UI thread: PinnedSectionHeader's label,
 * for building a custom pinned header. Native sticky headers (SectionList) only pin headers of rows already
 * rendered, so they show the wrong section while the scrubber jumps; this one follows the scroll position
 * directly. Hidden from screen readers (the list's own headers are read instead).
 * One native text field, whatever the number of sections.
 */
export function CurrentSectionLabel({
  scrollY,
  sections: sectionsProp,
  height,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  testID = 'list-scrubber-section-label',
}: CurrentSectionLabelProps) {
  const sections = useStableSections(sectionsProp);
  const offsets = useSectionOffsets(sections);
  const labels = useMemo(() => sections.map((s) => s.label), [sections]);
  // Compared by value: the label re-renders only when its style changes, and an inline `style={{…}}` (or a
  // PinnedSectionHeader `textStyle`) is a new object on each render, which would re-render all of them every
  // time the app renders
  const styleKey = JSON.stringify(StyleSheet.flatten(style) ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flat: TextStyle = useMemo(() => StyleSheet.flatten(style) ?? {}, [styleKey]);
  // Text scales with the system text size, so its line must too, or the text field clips it
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
      <SectionText
        testID={`${testID}-text`}
        index={index}
        labels={labels}
        height={lineHeight}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={flat}
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
  const offsets = useSectionOffsets(useStableSections(sections));
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
