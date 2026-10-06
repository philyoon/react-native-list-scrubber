import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  scrollTo,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { clamp, labelProbe, sectionIndexAt } from './math';

/**
 * The drag: maps the handle's travel (`track`) onto the list's scroll range and scrolls it, all on the
 * UI thread. With section `offsets` it also picks the section under the finger (`sectionIdx`).
 * The JS callbacks must be stable (useLatest): the gesture is rebuilt only when its numbers change.
 */
export function useScrubGesture({
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
  onOffset,
  onSection,
}: {
  listRef: AnimatedRef<any>;
  scrollY: SharedValue<number>;
  opacity: SharedValue<number>;
  dragging: SharedValue<boolean>;
  /** How far the handle travels (pt) */
  track: number;
  maxScroll: number;
  contentHeight: number;
  viewportHeight: number;
  offsets: readonly number[];
  fadeMs: number;
  hideAfterMs: number;
  enabled: boolean;
  testID: string;
  onBegin: () => void;
  onEnd: () => void;
  /** Without sections: the scroll offset of every drag frame */
  onOffset?: (offset: number) => void;
  /** With sections: the finger moved into another section */
  onSection?: (index: number) => void;
}) {
  const dragTop = useSharedValue(0);
  const startTop = useSharedValue(0);
  /** Section under the finger (UI thread), -1 before the first drag */
  const sectionIdx = useSharedValue(-1);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(testID)
        .enabled(enabled && track > 0 && maxScroll > 0)
        .minDistance(0)
        .onBegin(() => {
          dragging.set(true);
          startTop.set(clamp((scrollY.get() / maxScroll) * track, 0, track));
          dragTop.set(startTop.get());
          if (offsets.length) {
            const y = labelProbe((startTop.get() / track) * maxScroll, contentHeight, viewportHeight);
            sectionIdx.set(sectionIndexAt(offsets, y));
          }
          opacity.set(withTiming(1, { duration: fadeMs }));
          scheduleOnRN(onBegin);
        })
        .onUpdate((e) => {
          const top = clamp(startTop.get() + e.translationY, 0, track);
          dragTop.set(top);
          const offset = (top / track) * maxScroll;
          scrollTo(listRef, 0, offset, false);
          if (offsets.length) {
            const idx = sectionIndexAt(offsets, labelProbe(offset, contentHeight, viewportHeight));
            // Only real moves count: the section the drag started in is not a change.
            if (idx !== sectionIdx.get() && onSection) scheduleOnRN(onSection, idx);
            sectionIdx.set(idx);
          } else if (onOffset) scheduleOnRN(onOffset, offset);
        })
        .onFinalize(() => {
          dragging.set(false);
          opacity.set(withDelay(hideAfterMs, withTiming(0, { duration: fadeMs })));
          scheduleOnRN(onEnd);
        }),
    // Shared values and refs are stable; the rest is what the worklets read.
    [
      listRef,
      scrollY,
      opacity,
      dragging,
      dragTop,
      startTop,
      sectionIdx,
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
      onOffset,
      onSection,
    ],
  );

  return { pan, dragTop, sectionIdx };
}
