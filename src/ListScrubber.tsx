import { useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
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
  MAX_FONT_SCALE,
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
import { warnIfUnsorted } from './validate';

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
  /** Which edge of the list the thumb sits on (default 'right'). For RTL, pass `I18nManager.isRTL ? 'left' : 'right'`. */
  side?: 'left' | 'right';
  /** Distance from that edge (negative to sit in a margin outside the list) */
  edgeOffset?: number;
  /** Space at the top and bottom of the list the thumb stays out of (e.g. a pinned header or a toolbar) */
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
  /** Prefix of the test IDs: `<testID>` (the drag gesture), `-thumb`, `-a11y`, `-label-strip` (default 'list-scrubber') */
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
 * A draggable thumb for scrubbing through long lists. Colours, text and haptics come from the app.
 * - Drag, thumb position and list scroll run on the UI thread (Gesture Handler + Reanimated),
 *   so the thumb follows the finger even while JS is busy rendering rows.
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
  const offsets = useMemo(() => {
    const values = sections?.map((s) => s.offset) ?? [];
    if (sections) warnIfUnsorted(values, sections, 'sections');
    return values;
  }, [sections]);
  // Checked once per array (the result is cached), so calling it on every render is free
  if (accessibilitySteps) warnIfUnsorted(accessibilitySteps, accessibilitySteps, 'accessibilitySteps');
  const labels = useMemo(() => sections?.map((s) => s.label) ?? [], [sections]);
  const insetTop = insets?.top ?? 0;
  const insetBottom = insets?.bottom ?? 0;
  /** Height of the strip the thumb travels in */
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

  const positionStyle = useAnimatedStyle(() => {
    const top = dragging.get() ? dragTop.get() : maxScroll > 0 ? (scrollY.get() / maxScroll) * track : 0;
    return { opacity: opacity.get(), transform: [{ translateY: clamp(top, 0, track) }] };
  });

  if (!enabled || maxScroll <= 0 || track <= 0) return null;

  const thumbWidth = active ? m.thumbActiveWidth : m.thumbWidth;
  const bubbleProps = { metrics: m, colors, railHeight, dragging, dragTop, side, style: bubbleStyle };

  // Web keyboard. Typed here rather than with React Native's ViewProps: its legacy and strict typings
  // disagree on onKeyDown, and apps use either. React Native Web's nativeEvent is the DOM KeyboardEvent.
  const onKeyDown = (e: { nativeEvent: { key: string }; preventDefault: () => void }) => {
    const action = KEY_ACTIONS[e.nativeEvent.key];
    if (!action) return;
    e.preventDefault(); // the page itself mustn't scroll too
    if (action === 'next' || action === 'previous') a11y.step(action === 'next' ? 1 : -1);
    else if (action === 'pageDown' || action === 'pageUp') a11y.page(action === 'pageDown' ? 1 : -1);
    else a11y.jumpTo(action === 'start' ? 0 : maxScroll);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.rail, { top: insetTop, bottom: insetBottom, [side]: edgeOffset, width: TOUCH_WIDTH }]}
    >
      {/* Screen readers: an adjustable control that is always present; the thumb itself is drag-only, so it's hidden */}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        // aria-valuetext rather than accessibilityValue: the same value on iOS and Android, and React Native
        // Web only reads the aria- form
        aria-valuetext={a11y.value}
        accessibilityActions={A11Y_ACTIONS}
        onAccessibilityAction={(e) => a11y.step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        {...(Platform.OS === 'web' && webKeyboardProps(onKeyDown))}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        testID={`${testID}-a11y`}
      />
      <GestureDetector gesture={pan}>
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[styles.touchArea, { [side]: 0, height: m.thumbLength }, positionStyle]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          testID={`${testID}-thumb`}
        >
          {sections?.length ? (
            <Bubble {...bubbleProps} shown={dragging}>
              <LabelStrip
                testID={`${testID}-label-strip`}
                index={sectionIdx}
                labels={labels}
                height={m.bubbleSize}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                // Sized per label: one long label doesn't shrink all the letters
                style={(text) => [bubbleTextStyle(text, m, colors), bubbleTextStyleProp]}
              />
            </Bubble>
          ) : (
            active &&
            label != null && (
              <Bubble {...bubbleProps}>
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[bubbleTextStyle(label, m, colors), bubbleTextStyleProp]}
                >
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

/** Web: a Tab stop driven by the keyboard (React Native Web forwards these to the DOM; native ignores them) */
function webKeyboardProps(onKeyDown: (e: never) => void): object {
  return { tabIndex: 0, 'aria-orientation': 'vertical', onKeyDown };
}

/**
 * Web keyboard: the arrows step like a screen reader (down/right is further down the list, where the thumb
 * moves), Page Up/Down move one screen, Home/End go to the ends.
 */
const KEY_ACTIONS: Record<string, 'next' | 'previous' | 'pageDown' | 'pageUp' | 'start' | 'end'> = {
  ArrowDown: 'next',
  ArrowRight: 'next',
  ArrowUp: 'previous',
  ArrowLeft: 'previous',
  PageDown: 'pageDown',
  PageUp: 'pageUp',
  Home: 'start',
  End: 'end',
};

const styles = StyleSheet.create({
  rail: { position: 'absolute', top: 0, bottom: 0 },
  touchArea: {
    position: 'absolute',
    top: 0,
    width: TOUCH_WIDTH,
    // The thumb is centred in the touch area
    alignItems: 'center',
    justifyContent: 'center',
  },
});
