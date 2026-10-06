import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { clamp } from './math';

/**
 * All labels stacked in a column, one per `height`, inside a window one label tall. The UI thread
 * slides the column so `index` shows: a transform, so it never waits for JS or a React render.
 * The column is as wide as its widest label, so a bubble around it sizes itself.
 */
export function LabelStrip({
  index,
  labels,
  height,
  style,
  testID,
}: {
  index: SharedValue<number>;
  labels: readonly string[];
  height: number;
  style?: StyleProp<TextStyle>;
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
            <Text numberOfLines={1} style={style}>
              {label}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
