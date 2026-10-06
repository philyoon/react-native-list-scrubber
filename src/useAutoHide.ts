import { useState } from 'react';
import {
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { VISIBLE_MIN } from './defaults';

/**
 * The thumb's opacity: fades in when the list scrolls and out `hideAfterMs` after it stops.
 * The fade-in starts only once: restarting it every scroll frame kept it invisible until scrolling stopped.
 * `visible` mirrors it on the JS thread (touches pass through while hidden); `onHide` runs as it hides.
 */
export function useAutoHide({
  scrollY,
  dragging,
  fadeMs,
  hideAfterMs,
  onHide,
}: {
  scrollY: SharedValue<number>;
  dragging: SharedValue<boolean>;
  fadeMs: number;
  hideAfterMs: number;
  /** A stable JS callback (it is scheduled from the UI thread) */
  onHide: () => void;
}) {
  const opacity = useSharedValue(0);
  const fadingIn = useSharedValue(false);
  const [visible, setVisible] = useState(false);

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
      if (!on) scheduleOnRN(onHide);
    },
  );

  return { opacity, visible };
}
