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
  FILL,
  LIST_SCRUBBER_DEFAULTS,
  MAX_FONT_SCALE,
  TOUCH_WIDTH,
  type ListScrubberMetrics,
  type ListScrubberTiming,
} from './defaults';
import { clamp, labelPosition } from './math';
import { SectionText } from './SectionText';
import type { ListScrubberColors, ListScrubberSection } from './types';
import { useA11yStepper } from './useA11yStepper';
import { useAutoHide } from './useAutoHide';
import { useMirroredNumber } from './useMirroredNumber';
import { useLatest } from './useLatest';
import { useScrubGesture } from './useScrubGesture';
import { useSectionOffsets, warnIfInvalid } from './validate';

interface ListScrubberBaseProps<S extends ListScrubberSection> {
  scrollY: SharedValue<number>;
  listRef: AnimatedRef<any>; // any scrollable component
  /** The list's content and viewport heights: numbers, or shared values (as `useListScrubber` gives) */
  contentHeight: number | SharedValue<number>;
  viewportHeight: number | SharedValue<number>;
  /** Colour overrides (defaults: LIST_SCRUBBER_DEFAULTS.colors) */
  colors?: Partial<ListScrubberColors>;
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
  /**
   * Which edge of the list the thumb sits on, as laid out left to right (default 'right'). On iOS and Android,
   * React Native mirrors left/right in RTL layouts by default, so the scrubber moves to the left edge by itself:
   * don't flip this for RTL there. On web, left/right aren't mirrored: pass 'left' for an RTL page.
   */
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
  /** Prefix of the test IDs: `<testID>` (the drag gesture), `-thumb`, `-a11y`, `-label` (default 'list-scrubber') */
  testID?: string;
  /**
   * With `sections`: the finger moved into another section while dragging (e.g. a haptic tick per letter).
   * `section` has your sections' own type, extra fields included.
   * Shared by both label modes rather than tied to `sections`, so its parameters are typed even when
   * `sections` comes in a spread (`{...scrubber.scrubberProps}`), which TypeScript can't discriminate on.
   */
  onSectionChange?: (index: number, section: S) => void;
}

/** Labels from sections: picked and drawn on the UI thread, so they never lag. Preferred. */
interface ListScrubberSectionProps<S extends ListScrubberSection> {
  /** Labelled sections (ascending offsets). The bubble shows the section under the finger, and screen readers step section by section. */
  sections: readonly S[];
  labelAt?: never;
}

/** Labels from a function on the JS thread: for labels that aren't known ahead of time. */
interface ListScrubberLabelAtProps {
  sections?: undefined;
  /**
   * Bubble label while dragging, computed on the JS thread (can lag); null keeps the previous label.
   * `position` is the content offset to describe (it slides from the top of the viewport at the start to
   * its bottom at the end, so the last rows get a label); `scrollOffset` is the raw scroll position.
   */
  labelAt?: (position: number, scrollOffset: number) => string | null;
}

/** `S` is the type of your sections: `{ offset, label }` plus any fields of your own */
export type ListScrubberProps<S extends ListScrubberSection = ListScrubberSection> =
  ListScrubberBaseProps<S> & (ListScrubberSectionProps<S> | ListScrubberLabelAtProps);

const defaultFormatPercent = (percent: number) => `${percent}%`;

/**
 * A draggable thumb for scrubbing through long lists. Text and haptics come from the app; colours and sizes
 * have defaults to override.
 * - Drag, thumb position and list scroll run on the UI thread (Gesture Handler + Reanimated),
 *   so the thumb follows the finger even while JS is busy rendering rows.
 * - Appears on scroll and hides a moment after it stops.
 * - While dragging, a bubble shows where the finger is. With `sections` the label is picked and drawn
 *   on the UI thread (a native text field updated from the gesture), so it never lags behind the list.
 *   `labelAt` is the JS fallback for arbitrary labels: it can lag a frame or two while JS is busy.
 * - Screen readers get an adjustable control: swipe up/down to move one step (accessibilitySteps, or one screen),
 *   announced as the label or a percentage.
 */
export function ListScrubber<S extends ListScrubberSection = ListScrubberSection>({
  scrollY,
  listRef,
  contentHeight: contentHeightProp,
  viewportHeight: viewportHeightProp,
  colors: colorsProp,
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
}: ListScrubberProps<S>) {
  // Shared values from useListScrubber are mirrored here, so a new size re-renders only the scrubber
  const contentHeight = useMirroredNumber(contentHeightProp);
  const viewportHeight = useMirroredNumber(viewportHeightProp);
  // Memoized: worklets copy what they capture to the UI thread whenever its identity changes, and an
  // inline `metrics={{…}}` would otherwise do that on every render (hence keyed by value).
  const metricsKey = JSON.stringify(metrics ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => ({ ...LIST_SCRUBBER_DEFAULTS.metrics, ...metrics }), [metricsKey]);
  // Colours and the section label's style keep their identity between renders too, keyed by value so inline
  // objects are fine: the section label (SectionText) is memoized and re-renders only when they change
  const colorsKey = JSON.stringify(colorsProp ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => ({ ...LIST_SCRUBBER_DEFAULTS.colors, ...colorsProp }), [colorsKey]);
  const textStyleKey = JSON.stringify(StyleSheet.flatten(bubbleTextStyleProp) ?? null);
  const sectionLabelStyle = useMemo(
    (): TextStyle => ({
      color: colors.bubbleText,
      fontWeight: '700',
      textAlign: 'center',
      ...StyleSheet.flatten(bubbleTextStyleProp),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, textStyleKey],
  );
  // Sized per label (one long label doesn't shrink all the letters), unless bubbleTextStyle sets fontSize
  const sectionFontSizes = useMemo(
    () =>
      sectionLabelStyle.fontSize === undefined
        ? { short: m.bubbleFontSize, long: m.bubbleLongFontSize, shortMaxLength: m.bubbleShortLabelMaxLength }
        : undefined,
    [m, sectionLabelStyle],
  );
  const { hideAfterMs, fadeMs } = { ...LIST_SCRUBBER_DEFAULTS.timing, ...timing };
  const offsets = useSectionOffsets(sections);
  // Checked once per array (the result is cached), so calling it on every render is free
  if (accessibilitySteps) warnIfInvalid(accessibilitySteps, accessibilitySteps, 'accessibilitySteps');
  const labels = useMemo(() => sections?.map((s) => s.label) ?? [], [sections]);
  const insetTop = insets?.top ?? 0;
  const insetBottom = insets?.bottom ?? 0;
  /** Height of the strip the thumb travels in */
  const railHeight = Math.max(0, viewportHeight - insetTop - insetBottom);
  /** How far the thumb can move: the rail minus the thumb */
  const travel = Math.max(0, railHeight - m.thumbLength);
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
  const onDragOffset = useLatest((offset: number) => {
    const next = labelAt?.(labelPosition(offset, contentHeight, viewportHeight), offset);
    if (next != null) setLabel(next);
  });
  const onSection = useLatest((index: number) => {
    // Runs on JS a frame or more after the UI thread picked `index`: `sections` may have changed since.
    const section = sections?.[index];
    if (section) onSectionChange?.(index, section);
  });

  const { opacity, visible } = useAutoHide({ scrollY, dragging, fadeMs, hideAfterMs, onHide });
  // The labels the thumb has been shown with: the bubble's labels must be measured by then (see SectionText).
  // Latched, so later shows and hides don't re-render the label
  const [shownFor, setShownFor] = useState<readonly string[]>();
  if (visible && shownFor !== labels) setShownFor(labels);
  const { pan, dragTop, sectionIdx } = useScrubGesture({
    listRef,
    scrollY,
    opacity,
    dragging,
    travel,
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
    onDragOffset: labelAt ? onDragOffset : undefined,
    onSection: onSectionChange ? onSection : undefined,
  });

  const positionStyle = useAnimatedStyle(() => {
    const top = dragging.get() ? dragTop.get() : maxScroll > 0 ? (scrollY.get() / maxScroll) * travel : 0;
    return { opacity: opacity.get(), transform: [{ translateY: clamp(top, 0, travel) }] };
  });

  if (!enabled || maxScroll <= 0 || travel <= 0) return null;

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
        onAccessibilityAction={(e) => {
          const dir = A11Y_STEP[e.nativeEvent.actionName];
          if (dir) a11y.step(dir);
        }}
        {...(Platform.OS === 'web' && webKeyboardProps(onKeyDown))}
        style={styles.a11y}
        testID={`${testID}-a11y`}
      />
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.touchArea,
            { [side]: 0, height: m.thumbLength, pointerEvents: visible ? 'auto' : 'none' },
            positionStyle,
          ]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          testID={`${testID}-thumb`}
        >
          {sections?.length ? (
            <Bubble {...bubbleProps} shown={dragging}>
              <SectionText
                // The thumb takes touches only once shown, so this measures before any drag can start
                measureNow={shownFor === labels}
                testID={`${testID}-label`}
                index={sectionIdx}
                labels={labels}
                height={m.bubbleSize}
                style={sectionLabelStyle}
                fontSizes={sectionFontSizes}
                sizeToLabels
                maxFontSizeMultiplier={MAX_FONT_SCALE}
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
/** Only the declared actions step; anything else (e.g. `activate`) is ignored */
const A11Y_STEP: Record<string, 1 | -1> = { increment: 1, decrement: -1 };

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
  // Touches outside the thumb reach the list
  rail: { position: 'absolute', top: 0, bottom: 0, pointerEvents: 'box-none' },
  // Screen readers only: touches pass through to the thumb and the list
  a11y: { ...FILL, pointerEvents: 'none' },
  touchArea: {
    position: 'absolute',
    top: 0,
    width: TOUCH_WIDTH,
    // The thumb is centred in the touch area
    alignItems: 'center',
    justifyContent: 'center',
  },
});
