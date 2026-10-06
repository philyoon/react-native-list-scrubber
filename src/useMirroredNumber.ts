import { useState } from 'react';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * A number, or a shared value read as one on the JS thread. A shared value is mirrored into this
 * component's state, so when it changes only this component re-renders, not the one that owns it.
 */
export function useMirroredNumber(v: number | SharedValue<number>): number {
  const [mirrored, setMirrored] = useState(() => read(v));
  useAnimatedReaction(
    () => read(v),
    (next, prev) => {
      if (next !== prev) scheduleOnRN(setMirrored, next);
    },
  );
  return typeof v === 'number' ? v : mirrored;
}

function read(v: number | SharedValue<number>): number {
  'worklet';
  return typeof v === 'number' ? v : v.get();
}
