import { useLayoutEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  scrollTo,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { useLatest } from './useLatest';
import { clamp, labelPosition, sectionIndexAt } from './math';

/** Where the thumb's track starts in the rail (pt, moved by animated insets) and how far the thumb can travel along it */
export interface Track {
  top: number;
  travel: number;
}

/**
 * The drag: maps the distance the thumb can move (the track's `travel`) onto the list's scroll range and scrolls
 * it, all on the UI thread. With section `offsets` it also picks the section under the finger (`sectionIdx`).
 * A drag keeps the track it started with (`dragTrack`), so the thumb stays under the finger even if animated
 * insets move meanwhile.
 * The JS callbacks must be stable (useLatest): the gesture is rebuilt only when its numbers change.
 */
export function useScrubGesture({
  listRef,
  scrollY,
  opacity,
  dragging,
  track,
  maxTravel,
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
  /** The thumb's track now (UI thread) */
  track: SharedValue<Track>;
  /** How far the thumb travels without animated insets (pt): no drag without room */
  maxTravel: number;
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
  /** The track when the drag began */
  const dragTrack = useSharedValue<Track>({ top: 0, travel: 0 });
  const startTop = useSharedValue(0);
  /** Section under the finger (UI thread), -1 before the first drag */
  const sectionIdx = useSharedValue(-1);
  // onDragOffset (labelAt) runs on JS, which can be busy rendering rows exactly while the thumb is dragged.
  // One frame at a time is in flight: frames arriving meanwhile only keep the newest offset, sent when JS
  // acknowledges. Otherwise a busy JS thread would queue a stale call per frame and run them all later.
  const offsetInFlight = useSharedValue(false);
  const offsetWaiting = useSharedValue(false);
  const latestOffset = useSharedValue(0);
  // The acknowledgement hands this same callback back to the UI thread, so it reaches itself through a ref
  const deliverSelf = useRef<(offset: number) => void>(null);
  const deliverOffset = useLatest((offset: number) => {
    onDragOffset?.(offset);
    scheduleOnUI(ackOffset, offsetInFlight, offsetWaiting, latestOffset, deliverSelf.current!);
  });
  useLayoutEffect(() => {
    deliverSelf.current = deliverOffset;
  }, [deliverOffset]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(testID)
        .enabled(enabled && maxTravel > 0 && maxScroll > 0)
        .minDistance(0)
        .onBegin(() => {
          const { travel } = track.get();
          dragTrack.set(track.get());
          dragging.set(true);
          startTop.set(clamp((scrollY.get() / maxScroll) * travel, 0, travel));
          dragTop.set(startTop.get());
          if (offsets.length) {
            const y = labelPosition(clamp(scrollY.get(), 0, maxScroll), contentHeight, viewportHeight);
            sectionIdx.set(sectionIndexAt(offsets, y));
          }
          offsetWaiting.set(false);
          opacity.set(withTiming(1, { duration: fadeMs }));
          scheduleOnRN(onBegin);
        })
        .onUpdate((e) => {
          const { travel } = dragTrack.get();
          if (travel <= 0) return; // animated insets cover the whole rail: nowhere to drag
          const top = clamp(startTop.get() + e.translationY, 0, travel);
          dragTop.set(top);
          const offset = (top / travel) * maxScroll;
          scrollTo(listRef, 0, offset, false);
          if (offsets.length) {
            const idx = sectionIndexAt(offsets, labelPosition(offset, contentHeight, viewportHeight));
            // Only real moves count: the section the drag started in is not a change.
            if (idx !== sectionIdx.get() && onSection) scheduleOnRN(onSection, idx);
            sectionIdx.set(idx);
          } else if (onDragOffset) {
            latestOffset.set(offset);
            if (offsetInFlight.get()) offsetWaiting.set(true);
            else {
              offsetInFlight.set(true);
              scheduleOnRN(deliverOffset, offset);
            }
          }
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
      dragTrack,
      startTop,
      sectionIdx,
      track,
      maxTravel,
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
      offsetInFlight,
      offsetWaiting,
      latestOffset,
      deliverOffset,
    ],
  );

  return { pan, dragTop, dragTrack, sectionIdx };
}

/** JS finished one onDragOffset call: send the newest offset if frames came in meanwhile, else stand by */
function ackOffset(
  inFlight: SharedValue<boolean>,
  waiting: SharedValue<boolean>,
  latest: SharedValue<number>,
  deliver: (offset: number) => void,
) {
  'worklet';
  if (waiting.get()) {
    waiting.set(false);
    scheduleOnRN(deliver, latest.get());
  } else inFlight.set(false);
}
