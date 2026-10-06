import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { TOUCH_WIDTH, type ListScrubberMetrics } from './defaults';
import type { ListScrubberColors } from './types';

/**
 * The label bubble beside the thumb. Kept inside the list at both ends: it is taller than the thumb
 * it is centred on. `shown` (UI thread) fades it with the drag; without it, it's shown while mounted.
 */
export function Bubble({
  metrics: m,
  colors,
  railHeight,
  side,
  dragging,
  dragTop,
  shown,
  style,
  children,
}: {
  metrics: ListScrubberMetrics;
  colors: ListScrubberColors;
  /** The bubble stays inside this height */
  railHeight: number;
  /** The thumb's edge: the bubble goes on the other side of it */
  side: 'left' | 'right';
  dragging: SharedValue<boolean>;
  dragTop: SharedValue<number>;
  shown?: SharedValue<boolean>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const shift = useAnimatedStyle(() => {
    const top = dragging.get() ? dragTop.get() : 0;
    const overhang = (m.bubbleSize - m.thumbLength) / 2;
    const y = Math.max(0, overhang - top) - Math.max(0, top + m.thumbLength + overhang - railHeight);
    return { transform: [{ translateY: y }], ...(shown && { opacity: shown.get() ? 1 : 0 }) };
  });
  return (
    // The bubble hangs off the thumb's narrow touch area, and an absolute view is measured against its
    // parent's width: sized directly, a long label like "Jul 2025" was cut to "Ju…". So a wide, empty
    // anchor takes the position and the bubble inside it sizes to its label.
    <Animated.View
      style={[
        styles.anchor,
        {
          [side]: TOUCH_WIDTH + m.bubbleGap,
          height: m.bubbleSize,
          alignItems: side === 'right' ? 'flex-end' : 'flex-start',
        },
        shift,
      ]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.box,
          {
            minWidth: m.bubbleSize,
            height: m.bubbleSize,
            paddingHorizontal: m.bubblePadding,
            borderRadius: m.bubbleRadius,
            backgroundColor: colors.bubble,
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
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

/** Widest a bubble can grow: wider than any phone, so in practice only the label limits it */
const ANCHOR_WIDTH = 1000;

const styles = StyleSheet.create({
  anchor: { position: 'absolute', alignSelf: 'center', width: ANCHOR_WIDTH },
  box: { alignItems: 'center', justifyContent: 'center' },
});
