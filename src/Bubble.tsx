import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { TOUCH_WIDTH, type ListScrubberMetrics } from './defaults';
import type { ListScrubberColors } from './types';

/**
 * The label bubble beside the handle. Kept inside the list at both ends: it is taller than the handle
 * it is centred on. `shown` (UI thread) fades it with the drag; without it, it's shown while mounted.
 */
export function Bubble({
  metrics: m,
  colors,
  viewportHeight,
  dragging,
  dragTop,
  shown,
  style,
  children,
}: {
  metrics: ListScrubberMetrics;
  colors: ListScrubberColors;
  viewportHeight: number;
  dragging: SharedValue<boolean>;
  dragTop: SharedValue<number>;
  shown?: SharedValue<boolean>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const shift = useAnimatedStyle(() => {
    const top = dragging.get() ? dragTop.get() : 0;
    const overhang = (m.bubbleSize - m.thumbLength) / 2;
    const y = Math.max(0, overhang - top) - Math.max(0, top + m.thumbLength + overhang - viewportHeight);
    return { transform: [{ translateY: y }], ...(shown && { opacity: shown.get() ? 1 : 0 }) };
  });
  return (
    <Animated.View
      style={[
        styles.box,
        {
          right: TOUCH_WIDTH + m.bubbleGap,
          minWidth: m.bubbleSize,
          height: m.bubbleSize,
          paddingHorizontal: m.bubblePadding,
          borderRadius: m.bubbleRadius,
          backgroundColor: colors.bubble,
        },
        style,
        shift,
      ]}
      pointerEvents="none"
    >
      {children}
    </Animated.View>
  );
}

/** Bubble text: big for short labels (letters), smaller for long ones (dates) */
export function bubbleTextStyle(
  label: string,
  m: ListScrubberMetrics,
  colors: ListScrubberColors,
): TextStyle {
  return {
    color: colors.bubbleText,
    fontSize: label.length <= m.bubbleShortLabelMax ? m.bubbleFontSize : m.bubbleLongFontSize,
    fontWeight: '700',
    textAlign: 'center',
  };
}

const styles = StyleSheet.create({
  box: { position: 'absolute', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
});
