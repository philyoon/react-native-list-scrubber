import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { Bubble, bubbleTextStyle } from './Bubble';
import {
  LIST_SCRUBBER_DEFAULTS,
  TOUCH_WIDTH,
  type ListScrubberMetrics,
  type ListScrubberTiming,
} from './defaults';
import { LabelStrip } from './LabelStrip';
import { clamp, labelPosition } from './math';
import type { ListScrubberColors, ListScrubberSection } from './types';
import { useA11yStepper } from './useA11yStepper';
import { useAutoHide } from './useAutoHide';
import { useLatest } from './useLatest';
import { useScrubGesture } from './useScrubGesture';

interface ListScrubberBaseProps {
  scrollY: SharedValue<number>;
  listRef: AnimatedRef<any>; // any scrollable component
  contentHeight: number;
  viewportHeight: number;
  colors: ListScrubberColors;
  /** Screen-reader step targets (ascending offsets); defaults to the section offsets, else one screen. Dragging doesn't snap to them. */
  accessibilitySteps?: readonly number[];
  /** Screen-reader name (e.g. "Scroll position") */
  accessibilityLabel: string;
  /** Screen-reader value when there's no label (default "40%") */
  formatAccessibilityPercent?: (percent: number) => string;
  /** Drag started (e.g. haptics) */
  onDragStart?: () => void;
  /** Drag ended (finger lifted or gesture cancelled) */
  onDragEnd?: () => void;
  /** Which edge of the list the handle sits on (default 'right'). For RTL, pass `I18nManager.isRTL ? 'left' : 'right'`. */
  side?: 'left' | 'right';
  /** Distance from that edge (negative to sit in a margin outside the list) */
  edgeOffset?: number;
  /** Space at the top and bottom of the list the handle stays out of (e.g. a pinned header or a toolbar) */
  insets?: { top?: number; bottom?: number };
  /** false hides the scrubber and its screen-reader control, keeping its state (default true) */
  enabled?: boolean;
  /** Size overrides (defaults: LIST_SCRUBBER_DEFAULTS.metrics) */
  metrics?: Partial<ListScrubberMetrics>;
  /** Duration overrides (defaults: LIST_SCRUBBER_DEFAULTS.timing) */
  timing?: Partial<ListScrubberTiming>;
  /** Extra style for the bubble box (e.g. a shadow) */
  bubbleStyle?: StyleProp<ViewStyle>;
  bubbleTextStyle?: StyleProp<TextStyle>;
  /** Prefix of the test IDs: `<testID>` (the drag gesture), `-handle`, `-a11y`, `-label-strip` (default 'list-scrubber') */
  testID?: string;
}

/** Labels from sections: picked and drawn on the UI thread, so they never lag. Preferred. */
interface ListScrubberSectionProps {
  /** Labelled sections (ascending offsets). The bubble shows the section under the finger, and screen readers step section by section. */
  sections: readonly ListScrubberSection[];
  /** The finger moved into another section while dragging (e.g. a haptic tick per letter) */
  onSectionChange?: (index: number, section: ListScrubberSection) => void;
  labelAt?: never;
}

/** Labels from a function on the JS thread: for labels that aren't known ahead of time. */
interface ListScrubberLabelAtProps {
  sections?: undefined;
  onSectionChange?: never;
  /**
   * Bubble label while dragging, computed on the JS thread (can lag); null keeps the previous label.
   * `position` is the content offset to describe (it slides from the top of the viewport at the start to
   * its bottom at the end, so the last rows get a label); `scrollOffset` is the raw scroll position.
   */
  labelAt?: (position: number, scrollOffset: number) => string | null;
}

export type ListScrubberProps = ListScrubberBaseProps & (ListScrubberSectionProps | ListScrubberLabelAtProps);

const defaultFormatPercent = (percent: number) => `${percent}%`;

/**
 * A drag handle for scrubbing through long lists. Colours, text and haptics come from the app.
 * - Drag, handle position and list scroll run on the UI thread (Gesture Handler + Reanimated),
 *   so the handle follows the finger even while JS is busy rendering rows.
 * - Appears on scroll and hides a moment after it stops.
 * - While dragging, a bubble shows where the finger is. With `sections` the label is picked and drawn
 *   on the UI thread (a native text field updated from the gesture), so it never lags behind the list.
 *   `labelAt` is the JS fallback for arbitrary labels: it can lag a frame or two while JS is busy.
 * - Screen readers get an adjustable control: swipe up/down to move one step (accessibilitySteps, or one screen),
 *   announced as the label or a percentage.
 */
export function ListScrubber({
  scrollY,
  listRef,
  contentHeight,
  viewportHeight,
  colors,
  sections,
  labelAt,
  accessibilitySteps,
  accessibilityLabel,
  formatAccessibilityPercent = defaultFormatPercent,
  onDragStart,
  onDragEnd,
  onSectionChange,
  side = 'right',
  edgeOffset = 0,
  insets,
  enabled = true,
  metrics,
  timing,
  bubbleStyle,
  bubbleTextStyle: bubbleTextStyleProp,
  testID = 'list-scrubber',
}: ListScrubberProps) {
  // Memoized: worklets copy what they capture to the UI thread whenever its identity changes, and an
  // inline `metrics={{…}}` would otherwise do that on every render (hence keyed by value).
  const metricsKey = JSON.stringify(metrics ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => ({ ...LIST_SCRUBBER_DEFAULTS.metrics, ...metrics }), [metricsKey]);
  const { hideAfterMs, fadeMs } = { ...LIST_SCRUBBER_DEFAULTS.timing, ...timing };
  const offsets = useMemo(() => sections?.map((s) => s.offset) ?? [], [sections]);
  const labels = useMemo(() => sections?.map((s) => s.label) ?? [], [sections]);
  const insetTop = insets?.top ?? 0;
  const insetBottom = insets?.bottom ?? 0;
  /** Height of the strip the handle travels in */
  const railHeight = Math.max(0, viewportHeight - insetTop - insetBottom);
  const track = Math.max(0, railHeight - m.thumbLength);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);

  const dragging = useSharedValue(false);
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const a11y = useA11yStepper({
    listRef,
    scrollY,
    maxScroll,
    contentHeight,
    viewportHeight,
    steps: accessibilitySteps ?? (sections ? offsets : undefined),
    offsets,
    labels,
    labelAt,
    formatPercent: formatAccessibilityPercent,
  });

  // Stable JS callbacks for the worklets to schedule: they read the latest props when they run.
  const onHide = useLatest(a11y.sync); // the screen-reader value follows manual scrolling too
  const onBegin = useLatest(() => {
    onDragStart?.();
    setActive(true);
  });
  const onEnd = useLatest(() => {
    setActive(false);
    setLabel(null);
    onDragEnd?.();
  });
  const onOffset = useLatest((offset: number) => {
    const next = labelAt?.(labelPosition(offset, contentHeight, viewportHeight), offset);
    if (next != null) setLabel(next);
  });
  const onSection = useLatest((index: number) => {
    // Runs on JS a frame or more after the UI thread picked `index`: `sections` may have changed since.
    const section = sections?.[index];
    if (section) onSectionChange?.(index, section);
  });

  const { opacity, visible } = useAutoHide({ scrollY, dragging, fadeMs, hideAfterMs, onHide });
  const { pan, dragTop, sectionIdx } = useScrubGesture({
    listRef,
    scrollY,
    opacity,
    dragging,
    track,
    maxScroll,
    contentHeight,
    viewportHeight,
    offsets,
    fadeMs,
    hideAfterMs,
    enabled,
    testID,
    onBegin,
    onEnd,
    onOffset: labelAt ? onOffset : undefined,
    onSection: onSectionChange ? onSection : undefined,
  });

  const handleStyle = useAnimatedStyle(() => {
    const top = dragging.get() ? dragTop.get() : maxScroll > 0 ? (scrollY.get() / maxScroll) * track : 0;
    return { opacity: opacity.get(), transform: [{ translateY: clamp(top, 0, track) }] };
  });

  if (!enabled || maxScroll <= 0 || track <= 0) return null;

  const thumbWidth = active ? m.thumbActiveWidth : m.thumbWidth;
  const bubbleProps = { metrics: m, colors, railHeight, dragging, dragTop, side, style: bubbleStyle };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.rail, { top: insetTop, bottom: insetBottom, [side]: edgeOffset, width: TOUCH_WIDTH }]}
    >
      {/* Screen readers: an adjustable control that is always present; the handle itself is drag-only, so it's hidden */}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: a11y.value }}
        accessibilityActions={A11Y_ACTIONS}
        onAccessibilityAction={(e) => a11y.step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        testID={`${testID}-a11y`}
      />
      <GestureDetector gesture={pan}>
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[styles.handle, { [side]: 0, height: m.thumbLength }, handleStyle]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          testID={`${testID}-handle`}
        >
          {sections?.length ? (
            <Bubble {...bubbleProps} shown={dragging}>
              <LabelStrip
                testID={`${testID}-label-strip`}
                index={sectionIdx}
                labels={labels}
                height={m.bubbleSize}
                // Sized per label: one long label doesn't shrink all the letters
                style={(text) => [bubbleTextStyle(text, m, colors), bubbleTextStyleProp]}
              />
            </Bubble>
          ) : (
            active &&
            label != null && (
              <Bubble {...bubbleProps}>
                <Text numberOfLines={1} style={[bubbleTextStyle(label, m, colors), bubbleTextStyleProp]}>
                  {label}
                </Text>
              </Bubble>
            )
          )}
          <View
            style={{
              width: thumbWidth,
              height: m.thumbLength,
              borderRadius: m.thumbRadius,
              backgroundColor: active ? colors.thumbActive : colors.thumb,
            }}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const A11Y_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

const styles = StyleSheet.create({
  rail: { position: 'absolute', top: 0, bottom: 0 },
  handle: {
    position: 'absolute',
    top: 0,
    width: TOUCH_WIDTH,
    // The thumb is centred in the touch area
    alignItems: 'center',
    justifyContent: 'center',
  },
});
