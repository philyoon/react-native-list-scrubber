import { memo, useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { clamp } from './math';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** How many of the longest labels size a label that sizes to its text (see `sizeToLabels`) */
export const SIZING_LABELS = 32;

/**
 * The label at `index`, drawn on the UI thread: one read-only native text field whose text is set from the
 * UI thread (Reanimated's animated `text` prop), so it never waits for JS or a React render, and costs one
 * native view however many labels there are. (It replaces a column of every label, which mounted two native
 * views per label.)
 *
 * A native text field doesn't resize when its text changes outside React, so with `sizeToLabels` an
 * invisible copy of the longest labels gives it its width: exact for those, and in practice for the rest,
 * unless a shorter label is drawn wider (e.g. "WWW" against "iiii").
 */
export const SectionText = memo(function SectionText({
  index,
  labels,
  height,
  style,
  fontSizes,
  sizeToLabels = false,
  maxFontSizeMultiplier,
  testID,
}: {
  index: SharedValue<number>;
  labels: readonly string[];
  /** Height of the line; the text is centred in it */
  height: number;
  /** Must keep its identity while its contents are the same (it's compared by reference) */
  style?: TextStyle;
  /** A font size per label: `short` for labels up to `shortMaxLength` characters, `long` for longer ones */
  fontSizes?: { short: number; long: number; shortMaxLength: number };
  /** Gives its parent the width of the widest of the longest labels (for a bubble that sizes to its label) */
  sizeToLabels?: boolean;
  /** Cap on the system text size (the line height must already allow for it) */
  maxFontSizeMultiplier: number;
  testID: string;
}) {
  const fontSizeFor = (label: string) => {
    'worklet';
    if (!fontSizes) return undefined;
    return label.length <= fontSizes.shortMaxLength ? fontSizes.short : fontSizes.long;
  };
  const labelAt = (i: number) => {
    'worklet';
    return labels[clamp(Math.round(i), 0, labels.length - 1)] ?? '';
  };
  const animatedProps = useAnimatedProps(() => {
    const text = labelAt(index.get());
    // `defaultValue` too, as Reanimated's own PerformanceMonitor does: the field keeps it if it remounts
    return { text, defaultValue: text } as Partial<TextInputProps>;
  });
  const fontSize = useAnimatedStyle(() => {
    const size = fontSizeFor(labelAt(index.get()));
    return size === undefined ? {} : { fontSize: size };
  });
  const sizers = useMemo(
    () => (sizeToLabels ? longestLabels(labels, SIZING_LABELS) : []),
    [sizeToLabels, labels],
  );
  const first = labels[0] ?? '';

  return (
    // Fills its parent: with sizeToLabels the parent sizes to this view's content (the copies below), and a
    // wider parent (e.g. a minWidth) widens the field with it
    <View style={[{ height }, styles.fill]}>
      {sizeToLabels && (
        // Zero height, full width: the widest of these sets this view's width; none is ever visible
        <View style={styles.sizer} pointerEvents="none" accessibilityElementsHidden>
          {sizers.map((label) => (
            <Text
              key={label}
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              style={[style, fontSizes && { fontSize: fontSizeFor(label) }]}
            >
              {label}
            </Text>
          ))}
        </View>
      )}
      <AnimatedTextInput
        testID={testID}
        editable={false}
        // Display only: no caret, menu, focus or touches; screen readers read the list (or the scrubber's
        // own control) instead, so it stays out of their way too. A text field is focusable: on web it was a
        // Tab stop, and read out, until `focusable` and `aria-hidden` said otherwise
        focusable={false}
        aria-hidden
        caretHidden
        contextMenuHidden
        selectTextOnFocus={false}
        scrollEnabled={false}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no"
        underlineColorAndroid="transparent"
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        defaultValue={first}
        animatedProps={animatedProps}
        style={[styles.input, { height }, style, fontSizes && { fontSize: fontSizeFor(first) }, fontSize]}
      />
    </View>
  );
});

/** Up to `count` distinct labels, longest first */
function longestLabels(labels: readonly string[], count: number): string[] {
  return [...new Set(labels)].sort((a, b) => b.length - a.length).slice(0, count);
}

const styles = StyleSheet.create({
  fill: { alignSelf: 'stretch' },
  sizer: { height: 0, overflow: 'hidden' },
  // Text fields pad and underline themselves (Android); a label shouldn't
  input: {
    ...StyleSheet.absoluteFill,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
