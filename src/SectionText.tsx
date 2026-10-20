import { memo, useEffect, useMemo, useState } from 'react';
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
import { FILL } from './defaults';
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
 * The copies are unmounted once measured. New labels are measured on their own (the width only grows);
 * all of them again if the style or system text size changes. New labels are measured once the app is idle
 * (so not while the list first renders), or as soon as `measureNow` is set, whichever comes first.
 */
export const SectionText = memo(function SectionText({
  index,
  labels,
  height,
  style,
  fontSizes,
  sizeToLabels = false,
  measureNow = false,
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
  fontSizes?: FontSizes;
  /** Gives its parent the width of the widest label (for a bubble that sizes to its label) */
  sizeToLabels?: boolean;
  /** Measure the labels now, without waiting for the app to be idle (e.g. the bubble is about to show) */
  measureNow?: boolean;
  /** Cap on the system text size (the line height must already allow for it) */
  maxFontSizeMultiplier: number;
  testID: string;
}) {
  // The labels as they were while their text stays the same, so new sections with the same labels (the list
  // measured its rows again, and the offsets moved) don't remount the field below
  const sameLabels = useSameLabels(labels);
  const fontScale = useWindowDimensions().fontScale;
  // The widest of the labels measured so far, valid only for the text style it was measured with (compared
  // by reference). Labels only add to it: a list that grows a page at a time measures just the new page.
  // (Labels that are gone leave the bubble no narrower: never clipped, at worst a little wide.)
  const [measured, setMeasured] = useState<Measured>();
  const textInputs = [style, fontSizes, fontScale, maxFontSizeMultiplier];
  const valid = measured?.textInputs.every((input, i) => input === textInputs[i]) ? measured : undefined;
  const unmeasured = useMemo(
    () => (sizeToLabels ? [...new Set(labels)].filter((label) => !valid?.labels.has(label)) : []),
    [sizeToLabels, labels, valid],
  );
  // The labels the app has been idle since
  const [idleFor, setIdleFor] = useState<readonly string[]>();
  useEffect(() => {
    if (!sizeToLabels) return;
    return whenIdle(() => setIdleFor(labels));
  }, [sizeToLabels, labels]);
  const measure = unmeasured.length > 0 && (measureNow || idleFor === labels);
  // A batch at a time while idle, so thousands of new labels don't make one long task; all the rest at once
  // when the bubble is about to show
  const sizers = useMemo(
    () => (measure ? (measureNow ? unmeasured : unmeasured.slice(0, MEASURE_BATCH)) : NO_LABELS),
    [measure, measureNow, unmeasured],
  );
  // A new view per batch: a view that stays mounted reports its layout again only if its size changes
  const key = keyOf(sizers);
  const onMeasured = (width: number) =>
    setMeasured({
      width: Math.max(Math.ceil(width), valid?.width ?? 0),
      labels: new Set([...(valid?.labels ?? []), ...sizers]),
      textInputs,
    });
  return (
    // Fills its parent: with sizeToLabels the parent sizes to this view's content (the measured width, or
    // the copies being measured), and a wider parent (e.g. a minWidth) widens the field with it
    <View style={[{ height }, styles.fill]}>
      {valid && <View style={{ width: valid.width }} />}
      {sizers.length > 0 && (
        // Zero height, as wide as the widest label; none is ever visible
        <View
          key={key}
          style={styles.sizer}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={(e) => onMeasured(e.nativeEvent.layout.width)}
        >
          {sizers.map((label) => (
            <Text
              key={label}
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              style={[style, fontSizes && { fontSize: fontSizeFor(fontSizes, label) }]}
            >
              {label}
            </Text>
          ))}
        </View>
      )}
      {/* A new field for each set of labels. On Android a text field can stop taking text set from the UI
          thread (seen once: a label stuck until the app restarted); a new field can't carry that over to new
          sections, e.g. after a search. Its first render shows the current label, so there's no flash */}
      <LabelField
        key={keyOf(sameLabels)}
        index={index}
        labels={sameLabels}
        height={height}
        style={style}
        fontSizes={fontSizes}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        testID={testID}
      />
    </View>
  );
});

/** The read-only native text field that shows the label at `index` */
function LabelField({
  index,
  labels,
  height,
  style,
  fontSizes,
  maxFontSizeMultiplier,
  testID,
}: {
  index: SharedValue<number>;
  labels: readonly string[];
  height: number;
  style: TextStyle | undefined;
  fontSizes: FontSizes | undefined;
  maxFontSizeMultiplier: number;
  testID: string;
}) {
  // Each worklet is restarted, and everything it captures copied to the UI thread again, whenever a captured
  // value changes identity. So they capture only props (the helpers are module functions): a render with
  // the same labels copies nothing, though `labels` can be thousands of strings.
  const animatedProps = useAnimatedProps(() => {
    const text = labelAt(labels, index.get());
    // `defaultValue` too, as Reanimated's own PerformanceMonitor does: the field keeps it if it remounts
    return { text, defaultValue: text } as Partial<TextInputProps>;
  });
  const fontSize = useAnimatedStyle(() => {
    const size = fontSizeFor(fontSizes, labelAt(labels, index.get()));
    return size === undefined ? {} : { fontSize: size };
  });
  const first = labels[0] ?? '';
  return (
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
      style={[
        styles.input,
        { height },
        style,
        fontSizes && { fontSize: fontSizeFor(fontSizes, first) },
        fontSize,
      ]}
    />
  );
}

type FontSizes = { short: number; long: number; shortMaxLength: number };

function labelAt(labels: readonly string[], i: number): string {
  'worklet';
  return labels[clamp(Math.round(i), 0, labels.length - 1)] ?? '';
}

function fontSizeFor(fontSizes: FontSizes | undefined, label: string): number | undefined {
  'worklet';
  if (!fontSizes) return undefined;
  return label.length <= fontSizes.shortMaxLength ? fontSizes.short : fontSizes.long;
}

interface Measured {
  /** The widest label's width (pt, rounded up) */
  width: number;
  labels: ReadonlySet<string>;
  /** What the labels were measured with */
  textInputs: readonly unknown[];
}

const NO_LABELS: readonly string[] = [];
/** Labels laid out per commit while the app is idle */
const MEASURE_BATCH = 200;

/** `labels`, or the earlier array while it holds the same labels */
function useSameLabels(labels: readonly string[]): readonly string[] {
  const [kept, setKept] = useState(labels);
  if (kept === labels) return kept;
  if (kept.length === labels.length && kept.every((label, i) => label === labels[i])) return kept;
  setKept(labels);
  return labels;
}

const keys = new WeakMap<readonly string[], number>();
let lastKey = 0;
/** A key unique to an array of labels (a batch to measure, or the labels themselves), by identity */
function keyOf(labels: readonly string[]): number {
  let key = keys.get(labels);
  if (key === undefined) keys.set(labels, (key = ++lastKey));
  return key;
}

/**
 * Runs `fn` once the JS thread is idle; returns a cancel function. Safari (web) has no requestIdleCallback.
 */
function whenIdle(fn: () => void): () => void {
  const { requestIdleCallback, cancelIdleCallback } = globalThis as unknown as IdleCallbacks;
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, IDLE_FALLBACK_MS);
  return () => clearTimeout(id);
}

/** Declared by React Native and the DOM, but in neither's types as this package compiles them */
interface IdleCallbacks {
  requestIdleCallback?: (fn: () => void, options: { timeout: number }) => number;
  cancelIdleCallback: (id: number) => void;
}

/** Measure by then even if the app never goes idle */
const IDLE_TIMEOUT_MS = 2000;
/** Without requestIdleCallback: after the first renders have settled */
const IDLE_FALLBACK_MS = 500;

const styles = StyleSheet.create({
  fill: { alignSelf: 'stretch' },
  sizer: { height: 0, overflow: 'hidden', alignSelf: 'flex-start' },
  // Text fields pad and underline themselves (Android); a label shouldn't
  input: {
    ...FILL,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
