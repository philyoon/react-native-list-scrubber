import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  scrollTo,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { ScrollPacer } from './ScrollPacer';
import { useLatest } from './useLatest';
import { clamp, labelPosition, sectionIndexAt } from './math';

/**
 * Where the thumb's track starts in the rail (pt: below the visible part of a top bar), how far the thumb can
 * travel along it, the first scroll offset it covers (`start`: past the space a hidden top bar leaves at
 * the top of the list), and how much of the list's top is covered (`cover`: the bar's visible part and the
 * rail's top inset, e.g. a pinned header): labels describe the rows below it
 */
export interface Track {
  top: number;
  travel: number;
  start: number;
  cover: number;
}

/**
 * The drag: maps the distance the thumb can move (the track's `travel`) onto the list's scroll range and
 * scrolls it, all on the UI thread. With section `offsets` it also picks the section under the finger
 * (`sectionIdx`). A drag keeps the track it started with (`dragTrack`), so the thumb stays under the finger
 * even if a top bar moves meanwhile.
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
  /** How far the thumb travels without a top bar (pt): no drag without room */
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
  const dragTrack = useSharedValue<Track>({ top: 0, travel: 0, start: 0, cover: 0 });
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
  // The list's scroll, likewise one at a time (#84): each scroll makes the list render rows on the JS thread,
  // and where that takes longer than a frame, a continuous drag queued scrolls faster than JS got through
  // them. It fell further behind the longer the drag, rows staying blank until the finger stopped. Now the
  // thumb follows the finger as before, and the list goes to where the finger is when JS is ready for it,
  // never to a stale position. "Ready" is paced: letting the next scroll through at JS's next free frame
  // still kept a slow phone's JS busy all the time (13-21 fps), so JS first earns back the time its long
  // frames took (33-54 fps). A fast device has no long frames, and the list still moves every frame.
  const scrollInFlight = useSharedValue(false);
  const scrollWaiting = useSharedValue(false);
  const latestScroll = useSharedValue(0);
  const pacer = useRef<ScrollPacer>(null);
  pacer.current ??= new ScrollPacer();
  const scrolledSelf = useRef<() => void>(null);
  const scrolled = useLatest(() => {
    pacer.current!.afterIdle(() =>
      scheduleOnUI(ackScroll, listRef, scrollInFlight, scrollWaiting, latestScroll, scrolledSelf.current!),
    );
  });
  useLayoutEffect(() => {
    scrolledSelf.current = scrolled;
  }, [scrolled]);
  // A scroll still waiting when the scrubber goes away mustn't scroll a list that's gone
  useEffect(() => () => pacer.current!.cancel(), []);
  // The drag counts as going on until the list reaches where the finger lifted: the scroll that gets it there
  // is reported after the finger lifts, and a top bar that follows scrolls would take that one big jump for a
  // scroll up and slide in (seen with a fast drag released near the top). It also keeps the thumb there
  const releasing = useSharedValue(false);
  useAnimatedReaction(
    () => scrollY.get(),
    (y) => {
      if (releasing.get() && Math.abs(y - latestScroll.get()) < 1) endRelease(releasing, dragging);
    },
  );
  // If the list never reports that spot (it can't scroll that far), the drag ends anyway
  const releaseTimeout = useLatest(() => {
    setTimeout(() => scheduleOnUI(endRelease, releasing, dragging), RELEASE_TIMEOUT_MS);
  });

  const pan = useMemo(
    () => {
      /**
       * Moves the thumb and scrolls the list to where the finger is: translationY from where the drag
       * started. `final` (the finger lifted): the list goes there now, even with a scroll in flight
       */
      const move = (translationY: number, final = false) => {
        'worklet';
        // `top`: the top bar's visible part when the drag began, which the labels describe the rows below
        const { travel, start, cover } = dragTrack.get();
        if (travel <= 0) return; // a top bar covers the whole rail: nowhere to drag
        const top = clamp(startTop.get() + translationY, 0, travel);
        dragTop.set(top);
        const offset = start + (top / travel) * (maxScroll - start);
        latestScroll.set(offset);
        if (!final && scrollInFlight.get()) {
          scrollWaiting.set(true);
        } else {
          scrollTo(listRef, 0, offset, false);
          scrollWaiting.set(false);
          if (!scrollInFlight.get()) {
            scrollInFlight.set(true);
            scheduleOnRN(scrolled);
          }
        }
        if (offsets.length) {
          const idx = sectionIndexAt(offsets, labelPosition(offset, contentHeight, viewportHeight, cover));
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
      };
      return (
        Gesture.Pan()
          .withTestId(testID)
          .enabled(enabled && maxTravel > 0 && maxScroll > 0)
          .minDistance(0)
          .onBegin(() => {
            const { travel, start, cover } = track.get();
            dragTrack.set(track.get());
            dragging.set(true);
            const range = maxScroll - start;
            startTop.set(range > 0 ? clamp(((scrollY.get() - start) / range) * travel, 0, travel) : 0);
            dragTop.set(startTop.get());
            if (offsets.length) {
              const y = labelPosition(
                clamp(scrollY.get(), 0, maxScroll),
                contentHeight,
                viewportHeight,
                cover,
              );
              sectionIdx.set(sectionIndexAt(offsets, y));
            }
            offsetWaiting.set(false);
            // A new drag scrolls at once, even if an earlier one's last scroll was never acknowledged, and a
            // drag that ends without moving ends at once
            scrollInFlight.set(false);
            scrollWaiting.set(false);
            releasing.set(false);
            latestScroll.set(scrollY.get());
            opacity.set(withTiming(1, { duration: fadeMs }));
            scheduleOnRN(onBegin);
          })
          .onUpdate((e) => {
            move(e.translationY);
          })
          // Again with the finger's final position: the last stretch of a drag can come only with the finger
          // lifting, with no move event for it (seen with injected touches on a slow emulator, where a drag
          // to the end of the list stopped a few percent short)
          .onEnd((e) => {
            move(e.translationY, true);
          })
          .onFinalize(() => {
            if (Math.abs(scrollY.get() - latestScroll.get()) < 1) dragging.set(false);
            else {
              releasing.set(true);
              scheduleOnRN(releaseTimeout);
            }
            opacity.set(withDelay(hideAfterMs, withTiming(0, { duration: fadeMs })));
            scheduleOnRN(onEnd);
          })
      );
    },
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
      scrollInFlight,
      scrollWaiting,
      latestScroll,
      scrolled,
      releasing,
      releaseTimeout,
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

/**
 * JS had a frame since the list's last scroll: scroll to the finger's newest offset if it moved meanwhile,
 * else stand by
 */
function ackScroll(
  listRef: AnimatedRef<any>,
  inFlight: SharedValue<boolean>,
  waiting: SharedValue<boolean>,
  latest: SharedValue<number>,
  scrolled: () => void,
) {
  'worklet';
  if (waiting.get()) {
    waiting.set(false);
    scrollTo(listRef, 0, latest.get(), false);
    scheduleOnRN(scrolled);
  } else inFlight.set(false);
}

/** How long a drag waits, after the finger lifts, for the list to report where it lifted (ms) */
const RELEASE_TIMEOUT_MS = 500;

/** The list reached where the finger lifted, or the wait timed out: the drag is over */
function endRelease(releasing: SharedValue<boolean>, dragging: SharedValue<boolean>) {
  'worklet';
  if (!releasing.get()) return;
  releasing.set(false);
  dragging.set(false);
}
