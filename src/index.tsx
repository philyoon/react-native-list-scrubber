// A drag handle for scrubbing through long lists. Colours, text and haptics come from the app.
// Works with any Reanimated-scrollable list: FlatList, SectionList, ScrollView, FlashList, Legend List.
// - Drag, handle position and list scroll run on the UI thread (Gesture Handler + Reanimated),
//   so the handle follows the finger even while JS is busy rendering rows.
// - Appears on scroll and hides a moment after it stops. The fade-in starts only once:
//   restarting it every scroll frame kept it invisible until scrolling stopped.
// - While dragging, a bubble shows where the finger is. With `sections` the label is picked and drawn
//   on the UI thread (a native text field updated from the gesture), so it never lags behind the list.
//   `labelAt` is the JS fallback for arbitrary labels: it can lag a frame or two while JS is busy.
// - Screen readers get an adjustable control: swipe up/down to move one step (steps, or one screen),
//   announced as the label or a percentage.
import { useCallback, useMemo, useState, type Component, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

/** Adjustable sizes (pt). Override any subset with `metrics`. */
export interface ListScrubberMetrics {
  /** Handle length, longer than a fingertip */
  thumbLength: number;
  /** Idle handle width, thin so it doesn't cover row content */
  thumbWidth: number;
  /** Width while dragging, shows it's grabbed */
  thumbActiveWidth: number;
  thumbRadius: number;
  /** Bubble height and minimum width, big enough to read a letter beside the finger */
  bubbleSize: number;
  /** Gap between the handle's touch area and the bubble, so the finger doesn't cover it */
  bubbleGap: number;
  bubbleRadius: number;
  bubblePadding: number;
  /** Font size for short labels (e.g. index letters) */
  bubbleFontSize: number;
  /** Font size for longer labels (e.g. dates), keeps the bubble from getting too wide */
  bubbleLongFontSize: number;
  /** Labels up to this many characters count as short */
  bubbleShortLabelMax: number;
}

/** Adjustable durations (ms). Override any subset with `timing`. */
export interface ListScrubberTiming {
  /** Delay after scrolling or dragging stops before hiding */
  hideAfterMs: number;
  /** Fade in/out duration */
  fadeMs: number;
}

export const LIST_SCRUBBER_DEFAULTS: {
  metrics: ListScrubberMetrics;
  timing: ListScrubberTiming;
  railWidth: number;
} = {
  metrics: {
    thumbLength: 48,
    thumbWidth: 6,
    thumbActiveWidth: 8,
    thumbRadius: 4,
    bubbleSize: 64,
    bubbleGap: 40,
    bubbleRadius: 16,
    bubblePadding: 16,
    bubbleFontSize: 24,
    bubbleLongFontSize: 16,
    bubbleShortLabelMax: 2,
  },
  timing: { hideAfterMs: 1500, fadeMs: 150 },
  railWidth: 20,
};

// Fixed values
/** Handle touch width: the 44pt minimum touch target */
const TOUCH_WIDTH = 44;
/** Screen-reader step without `steps`, as a share of the viewport; the previous screen's last row stays visible */
const A11Y_PAGE = 0.9;
/** Below this opacity the handle counts as hidden and touches pass through to the list */
const VISIBLE_MIN = 0.01;
/** Distance (pt) treated as "already at this step", so rounding can't keep the reader in place */
const STEP_SLACK = 1;

/**
 * The content offset a label should describe for scroll position `offset`.
 * It slides from the top of the viewport (at the start) to its bottom (at the end), so the last
 * section is reachable even when it's shorter than a screen. Feed it to your `labelAt`.
 */
export function labelProbe(offset: number, contentHeight: number, viewportHeight: number): number {
  'worklet';
  const maxScroll = Math.max(1, contentHeight - viewportHeight);
  const t = Math.min(1, Math.max(0, offset / maxScroll));
  return Math.min(contentHeight - 1, offset + t * viewportHeight);
}

/** Index of the section that contains `y`, given ascending section start offsets. */
export function sectionIndexAt(starts: readonly number[], y: number): number {
  'worklet';
  // Binary search: lists can have thousands of sections (e.g. one per day).
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= y + 0.5) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

/**
 * State for one list + scrubber pair. Spread `listProps` on the list and `scrubberProps` on the scrubber:
 *
 *   const scrubber = useListScrubber();
 *   <Animated.FlatList {...scrubber.listProps} data={…} renderItem={…} />
 *   <ListScrubber {...scrubber.scrubberProps} colors={…} accessibilityLabel="Scroll position" />
 *
 * The list must be an Animated component (Animated.FlatList, Animated.ScrollView, AnimatedLegendList,
 * Animated.createAnimatedComponent(FlashList) …) so the scroll handler runs on the UI thread.
 * The offset comes from scroll events, so it keeps working when the list remounts (e.g. a new `key`).
 * If the list needs its own onLayout / onContentSizeChange, pass your own sizes to ListScrubber instead.
 */
// `any`: works with any scrollable component
export function useListScrubber<TList extends Component<any, any> = any>() {
  const listRef = useAnimatedRef<TList>();
  const scrollY = useSharedValue(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  // Stable identities: the list gets the same props on every render, so it doesn't re-render for them.
  const onContentSizeChange = useCallback((_width: number, height: number) => setContentHeight(height), []);
  const onLayout = useCallback((e: LayoutChangeEvent) => setViewportHeight(e.nativeEvent.layout.height), []);
  const listProps = useMemo(
    () => ({
      ref: listRef,
      onScroll,
      scrollEventThrottle: 16,
      showsVerticalScrollIndicator: false,
      onContentSizeChange,
      onLayout,
    }),
    [listRef, onScroll, onContentSizeChange, onLayout],
  );
  const scrubberProps = useMemo(
    () => ({ listRef, scrollY, contentHeight, viewportHeight }),
    [listRef, scrollY, contentHeight, viewportHeight],
  );
  return { listRef, scrollY, onScroll, contentHeight, viewportHeight, listProps, scrubberProps };
}

/** A labelled section start, e.g. `{ offset: 0, label: 'A' }`. Offsets ascend. */
export interface ListScrubberSection {
  offset: number;
  label: string;
}

/**
 * All labels stacked in a column, one per `height`, inside a window one label tall. The UI thread
 * slides the column so `index` shows: a transform, so it never waits for JS or a React render.
 * The column is as wide as its widest label, so a bubble around it sizes itself.
 */
function LabelStrip({
  index,
  labels,
  height,
  style,
}: {
  index: SharedValue<number>;
  labels: readonly string[];
  height: number;
  style?: StyleProp<TextStyle>;
}) {
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, Math.min(labels.length - 1, index.get())) * height }],
  }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={slide} testID="list-scrubber-label-strip">
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

/**
 * The label of the section at the top of the list, drawn on the UI thread: use it for a pinned
 * header over the list. Native sticky headers (SectionList) only pin headers of rows already rendered,
 * so they show the wrong section while the scrubber jumps; this one follows the scroll position
 * directly. Hidden from screen readers (the list's own headers are read instead).
 * Renders every label once, so it suits up to a few hundred sections.
 */
export function SectionLabel({
  scrollY,
  sections,
  height,
  style,
}: {
  scrollY: SharedValue<number>;
  sections: readonly ListScrubberSection[];
  /** Height of one label line (default: the style's lineHeight, else 1.3 × fontSize) */
  height?: number;
  style?: StyleProp<TextStyle>;
}) {
  const offsets = sections.map((s) => s.offset);
  const flat = StyleSheet.flatten(style) ?? {};
  const lineHeight = height ?? flat.lineHeight ?? Math.ceil((flat.fontSize ?? 14) * 1.3);
  const index = useDerivedValue(() => sectionIndexAt(offsets, scrollY.get()));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="list-scrubber-section-label"
    >
      <LabelStrip index={index} labels={sections.map((s) => s.label)} height={lineHeight} style={style} />
    </View>
  );
}

/**
 * Animated style for a pinned section header: as the next section's own header (in the list) reaches
 * it, the pinned header is pushed up and out, like iOS Contacts, instead of being swapped underneath.
 * Put it on the view that holds the pinned header, inside a container with `overflow: 'hidden'`.
 * `height` is the header's height; section offsets are where each section's header starts.
 */
export function usePinnedHeaderStyle(
  scrollY: SharedValue<number>,
  sections: readonly ListScrubberSection[],
  height: number,
) {
  const offsets = sections.map((s) => s.offset);
  return useAnimatedStyle(() => {
    const y = scrollY.get();
    const next = offsets[sectionIndexAt(offsets, y) + 1];
    const push = next === undefined || y < 0 ? 0 : Math.min(0, next - y - height);
    return { transform: [{ translateY: push }] };
  });
}

export interface ListScrubberColors {
  /** Idle handle; aim for 3:1 contrast against the background */
  thumb: string;
  /** While dragging */
  thumbActive: string;
  bubble: string;
  bubbleText: string;
}

export interface ListScrubberProps {
  scrollY: SharedValue<number>;
  listRef: AnimatedRef<any>; // any scrollable component
  contentHeight: number;
  viewportHeight: number;
  colors: ListScrubberColors;
  /**
   * Labelled sections (ascending offsets). The bubble shows the section under the finger, picked and
   * drawn on the UI thread, and screen readers step section by section. Preferred over `labelAt`.
   */
  sections?: readonly ListScrubberSection[];
  /** Bubble label while dragging, computed on the JS thread (can lag); null keeps the previous label */
  labelAt?: (offset: number) => string | null;
  /** Screen-reader step targets (ascending offsets); defaults to the section offsets, else one screen */
  steps?: readonly number[];
  /** Screen-reader name (e.g. "Scroll position") */
  accessibilityLabel: string;
  /** Screen-reader value when there's no label (default "40%") */
  formatPercent?: (percent: number) => string;
  /** Drag started (e.g. haptics) */
  onDragStart?: () => void;
  /** Offset from the right edge (negative to sit in a margin outside the list) */
  right?: number;
  /** Width of the strip the handle sits in (default 20) */
  railWidth?: number;
  /** Size overrides (defaults: LIST_SCRUBBER_DEFAULTS.metrics) */
  metrics?: Partial<ListScrubberMetrics>;
  /** Duration overrides (defaults: LIST_SCRUBBER_DEFAULTS.timing) */
  timing?: Partial<ListScrubberTiming>;
  /** Extra style for the bubble box (e.g. a shadow) */
  bubbleStyle?: StyleProp<ViewStyle>;
  bubbleTextStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
}

export function ListScrubber({
  scrollY,
  listRef,
  contentHeight,
  viewportHeight,
  colors,
  sections,
  labelAt,
  steps: stepsProp,
  accessibilityLabel,
  formatPercent = (p) => `${p}%`,
  onDragStart,
  right = 0,
  railWidth = LIST_SCRUBBER_DEFAULTS.railWidth,
  metrics,
  timing,
  bubbleStyle,
  bubbleTextStyle,
}: ListScrubberProps) {
  const m = { ...LIST_SCRUBBER_DEFAULTS.metrics, ...metrics };
  const { hideAfterMs, fadeMs } = { ...LIST_SCRUBBER_DEFAULTS.timing, ...timing };
  const track = Math.max(0, viewportHeight - m.thumbLength);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const opacity = useSharedValue(0);
  const fadingIn = useSharedValue(false);
  const dragging = useSharedValue(false);
  const dragTop = useSharedValue(0);
  const startTop = useSharedValue(0);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  /** Offset the screen-reader value describes: set by its own steps, and re-read when scrolling stops */
  const [a11yOffset, setA11yOffset] = useState(0);
  const offsets = sections?.map((s) => s.offset) ?? [];
  const labels = sections?.map((s) => s.label) ?? [];
  const steps = stepsProp ?? (sections ? offsets : undefined);
  /** Section under the finger (UI thread), -1 before the first drag */
  const sectionIdx = useSharedValue(-1);

  const updateLabel = (offset: number) => {
    const next = labelAt?.(offset);
    if (next != null) setLabel(next);
  };
  const begin = () => {
    onDragStart?.();
    setActive(true);
  };
  /** Screen-reader value follows manual scrolling too: re-read the position once scrolling stops */
  const syncA11y = () => setA11yOffset(scrollY.get());
  const end = () => {
    setActive(false);
    setLabel(null);
  };

  useAnimatedReaction(
    () => scrollY.get(),
    (y, prev) => {
      if (prev === null || y === prev || dragging.get() || fadingIn.get()) return;
      if (opacity.get() < 1) {
        fadingIn.set(true);
        opacity.set(
          withSequence(
            withTiming(1, { duration: fadeMs * (1 - opacity.get()) }, () => fadingIn.set(false)),
            withDelay(hideAfterMs, withTiming(0, { duration: fadeMs })),
          ),
        );
      } else {
        opacity.set(withDelay(hideAfterMs, withTiming(0, { duration: fadeMs })));
      }
    },
  );
  useAnimatedReaction(
    () => opacity.get() > VISIBLE_MIN,
    (on, prev) => {
      if (on === prev) return;
      scheduleOnRN(setVisible, on);
      if (!on) scheduleOnRN(syncA11y);
    },
  );

  const pan = Gesture.Pan()
    .withTestId('list-scrubber')
    .enabled(track > 0 && maxScroll > 0)
    .minDistance(0)
    .onBegin(() => {
      dragging.set(true);
      startTop.set(Math.min(track, Math.max(0, (scrollY.get() / maxScroll) * track)));
      dragTop.set(startTop.get());
      if (offsets.length) {
        const y = labelProbe((startTop.get() / track) * maxScroll, contentHeight, viewportHeight);
        sectionIdx.set(sectionIndexAt(offsets, y));
      }
      opacity.set(withTiming(1, { duration: fadeMs }));
      scheduleOnRN(begin);
    })
    .onUpdate((e) => {
      const top = Math.min(track, Math.max(0, startTop.get() + e.translationY));
      dragTop.set(top);
      const offset = (top / track) * maxScroll;
      scrollTo(listRef, 0, offset, false);
      if (offsets.length) {
        sectionIdx.set(sectionIndexAt(offsets, labelProbe(offset, contentHeight, viewportHeight)));
      } else if (labelAt) scheduleOnRN(updateLabel, offset);
    })
    .onFinalize(() => {
      dragging.set(false);
      opacity.set(withDelay(hideAfterMs, withTiming(0, { duration: fadeMs })));
      scheduleOnRN(end);
    });

  const handleStyle = useAnimatedStyle(() => {
    const top = dragging.get() ? dragTop.get() : maxScroll > 0 ? (scrollY.get() / maxScroll) * track : 0;
    return { opacity: opacity.get(), transform: [{ translateY: Math.min(track, Math.max(0, top)) }] };
  });

  // Keep the bubble inside the list at both ends: it is taller than the handle it is centred on.
  const bubbleShift = useAnimatedStyle(() => {
    const top = dragging.get() ? dragTop.get() : 0;
    const overhang = (m.bubbleSize - m.thumbLength) / 2;
    const shift = Math.max(0, overhang - top) - Math.max(0, top + m.thumbLength + overhang - viewportHeight);
    return { transform: [{ translateY: shift }] };
  });
  const sectionBubbleStyle = useAnimatedStyle(() => ({ opacity: dragging.get() ? 1 : 0 }));

  if (maxScroll <= 0 || track <= 0) return null;

  // Screen reader: one step back or forward from here (the next of `steps`, or one screen)
  const step = (dir: 1 | -1) => {
    const from = scrollY.get();
    let to: number;
    if (steps && steps.length) {
      const next =
        dir > 0
          ? steps.find((s) => s > from + STEP_SLACK)
          : [...steps].reverse().find((s) => s < from - STEP_SLACK);
      to = next ?? (dir > 0 ? maxScroll : 0);
    } else to = from + dir * viewportHeight * A11Y_PAGE;
    to = Math.min(maxScroll, Math.max(0, to));
    scheduleOnUI(scrollTo, listRef, 0, to, false);
    setA11yOffset(to);
  };
  const a11yValue =
    (sections?.length ? labels[sectionIndexAt(offsets, a11yOffset)] : labelAt?.(a11yOffset)) ??
    formatPercent(Math.round((a11yOffset / maxScroll) * 100));
  // With sections, one font size for all: the longest label decides
  const longest = labels.reduce((a, b) => (b.length > a.length ? b : a), '');
  const bubbleBox: ViewStyle = {
    position: 'absolute',
    right: TOUCH_WIDTH + m.bubbleGap,
    alignSelf: 'center',
    minWidth: m.bubbleSize,
    height: m.bubbleSize,
    paddingHorizontal: m.bubblePadding,
    borderRadius: m.bubbleRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bubble,
  };
  const textStyle = (text: string): TextStyle => ({
    color: colors.bubbleText,
    fontSize: text.length <= m.bubbleShortLabelMax ? m.bubbleFontSize : m.bubbleLongFontSize,
    fontWeight: '700',
  });

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, bottom: 0, right, width: railWidth }}
    >
      {/* Screen readers: an adjustable control that is always present; the handle itself is drag-only, so it's hidden */}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: a11yValue }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: railWidth }}
        testID="list-scrubber-a11y"
      />
      <GestureDetector gesture={pan}>
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 0,
              width: TOUCH_WIDTH,
              height: m.thumbLength,
              alignItems: 'flex-end',
              justifyContent: 'center',
              flexDirection: 'row',
            },
            handleStyle,
          ]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          testID="list-scrubber-handle"
        >
          {sections?.length ? (
            <Animated.View
              style={[bubbleBox, bubbleStyle, sectionBubbleStyle, bubbleShift]}
              pointerEvents="none"
            >
              <LabelStrip
                index={sectionIdx}
                labels={labels}
                height={m.bubbleSize}
                style={[textStyle(longest), bubbleTextStyle, { textAlign: 'center' }]}
              />
            </Animated.View>
          ) : (
            active &&
            label != null && (
              <Animated.View style={[bubbleBox, bubbleStyle, bubbleShift]}>
                <Text numberOfLines={1} style={[textStyle(label), bubbleTextStyle]}>
                  {label}
                </Text>
              </Animated.View>
            )
          )}
          <View
            style={{
              width: active ? m.thumbActiveWidth : m.thumbWidth,
              height: m.thumbLength,
              marginRight: (railWidth - (active ? m.thumbActiveWidth : m.thumbWidth)) / 2,
              borderRadius: m.thumbRadius,
              backgroundColor: active ? colors.thumbActive : colors.thumb,
            }}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
