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
import { clamp, labelPosition, sectionIndexAt } from './math';

/**
 * The drag: maps the distance the thumb can move (`travel`) onto the list's scroll range and scrolls it, all on the
 * UI thread. With section `offsets` it also picks the section under the finger (`sectionIdx`).
 * The JS callbacks must be stable (useLatest): the gesture is rebuilt only when its numbers change.
 */
export function useScrubGesture({
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
  onDragOffset,
  onSection,
}: {
  listRef: AnimatedRef<any>;
  scrollY: SharedValue<number>;
  opacity: SharedValue<number>;
  dragging: SharedValue<boolean>;
  /** How far the thumb travels (pt) */
  travel: number;
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
  onDragOffset?: (offset: number) => void;
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
        .enabled(enabled && travel > 0 && maxScroll > 0)
        .minDistance(0)
        .onBegin(() => {
          dragging.set(true);
          startTop.set(clamp((scrollY.get() / maxScroll) * travel, 0, travel));
          dragTop.set(startTop.get());
          if (offsets.length) {
            const y = labelPosition((startTop.get() / travel) * maxScroll, contentHeight, viewportHeight);
            sectionIdx.set(sectionIndexAt(offsets, y));
          }
          opacity.set(withTiming(1, { duration: fadeMs }));
          scheduleOnRN(onBegin);
        })
        .onUpdate((e) => {
          const top = clamp(startTop.get() + e.translationY, 0, travel);
          dragTop.set(top);
          const offset = (top / travel) * maxScroll;
          scrollTo(listRef, 0, offset, false);
          if (offsets.length) {
            const idx = sectionIndexAt(offsets, labelPosition(offset, contentHeight, viewportHeight));
            // Only real moves count: the section the drag started in is not a change.
            if (idx !== sectionIdx.get() && onSection) scheduleOnRN(onSection, idx);
            sectionIdx.set(idx);
          } else if (onDragOffset) scheduleOnRN(onDragOffset, offset);
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
      onDragOffset,
      onSection,
    ],
  );

  return { pan, dragTop, sectionIdx };
}
