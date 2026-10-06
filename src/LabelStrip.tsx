import { memo } from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { clamp } from './math';

/**
 * All labels stacked in a column, one per `height`, inside a window one label tall. The UI thread
 * slides the column so `index` shows: a transform, so it never waits for JS or a React render.
 * The column is as wide as its widest label, so a bubble around it sizes itself.
 * Memoized: it renders every label, possibly thousands, so it re-renders only when its props change.
 */
export const LabelStrip = memo(function LabelStrip({
  index,
  labels,
  height,
  style,
  maxFontSizeMultiplier,
  testID,
}: {
  index: SharedValue<number>;
  labels: readonly string[];
  height: number;
  /** One style for every label, or a style per label */
  style?: StyleProp<TextStyle> | ((label: string) => StyleProp<TextStyle>);
  /** Cap on the system text size (the row height must already allow for it) */
  maxFontSizeMultiplier: number;
  testID: string;
}) {
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: -clamp(index.get(), 0, labels.length - 1) * height }],
  }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={slide} testID={testID}>
        {labels.map((label, i) => (
          <View key={i} style={{ height, justifyContent: 'center' }}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              style={typeof style === 'function' ? style(label) : style}
            >
              {label}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
});
