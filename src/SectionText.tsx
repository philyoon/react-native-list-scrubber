import { memo, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { clamp } from './math';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * The label at `index`, drawn on the UI thread: one read-only native text field whose text is set from the
 * UI thread (Reanimated's animated `text` prop), so it never waits for JS or a React render, and costs one
 * native view however many labels there are. (It replaces a column of every label, which mounted two native
 * views per label.)
 *
 * A native text field doesn't resize when its text changes outside React, so with `sizeToLabels` every
 * distinct label is laid out once, invisibly, and the field takes the widest: no label is ever clipped.
 * The copies are unmounted once measured, and laid out again when the labels, style or system text size
 * change.
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
  /** Gives its parent the width of the widest label (for a bubble that sizes to its label) */
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
  const fontScale = useWindowDimensions().fontScale;
  // The widest label's width, valid only for what it was measured with (all compared by reference)
  const [measured, setMeasured] = useState<{ width: number; inputs: readonly unknown[] }>();
  const inputs = [labels, style, fontSizes, fontScale, maxFontSizeMultiplier];
  const width =
    measured && measured.inputs.every((input, i) => input === inputs[i]) ? measured.width : undefined;
  const sizers = useMemo(
    () => (sizeToLabels && width === undefined ? [...new Set(labels)] : []),
    [sizeToLabels, width, labels],
  );
  const first = labels[0] ?? '';

  return (
    // Fills its parent: with sizeToLabels the parent sizes to this view's content (the measured width, or
    // the copies being measured), and a wider parent (e.g. a minWidth) widens the field with it
    <View style={[{ height }, styles.fill]}>
      {sizeToLabels && width !== undefined && <View style={{ width }} />}
      {sizers.length > 0 && (
        // Zero height, as wide as the widest label; none is ever visible
        <View
          style={styles.sizer}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={(e) => setMeasured({ width: Math.ceil(e.nativeEvent.layout.width), inputs })}
        >
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

const styles = StyleSheet.create({
  fill: { alignSelf: 'stretch' },
  sizer: { height: 0, overflow: 'hidden', alignSelf: 'flex-start' },
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
